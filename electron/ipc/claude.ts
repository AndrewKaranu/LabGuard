import { ipcMain, BrowserWindow } from 'electron'
import Store from 'electron-store'

interface ClaudeStore {
  apiKey: string
  models: string[]
}

const DEFAULT_CLAUDE_MODELS = [
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-6'
]

const LEGACY_DEFAULT_MODELS = [
  'claude-3-5-haiku-latest',
  'claude-3-7-sonnet-latest',
  'claude-opus-4-1'
]

const store = new Store<ClaudeStore>({
  name: 'claude',
  defaults: {
    apiKey: '',
    models: DEFAULT_CLAUDE_MODELS
  }
})

interface PromptMessage {
  role: string
  content: string
}

function normalizeMessages(messages: PromptMessage[]) {
  const systemParts: string[] = []
  const out: { role: 'user' | 'assistant'; content: string }[] = []

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content)
      continue
    }

    if (m.role === 'assistant') {
      out.push({ role: 'assistant', content: m.content })
    } else {
      out.push({ role: 'user', content: m.content })
    }
  }

  return {
    system: systemParts.join('\n\n').trim() || undefined,
    messages: out
  }
}

function extractError(body: unknown): string {
  if (body && typeof body === 'object' && 'error' in body) {
    const error = (body as { error?: { message?: string } }).error
    if (error?.message) return error.message
  }
  return 'Claude API request failed'
}

function getEffectiveModels(): string[] {
  const models = store.get('models', DEFAULT_CLAUDE_MODELS)
  const trimmed = models.map((m) => m.trim()).filter(Boolean)

  // Migrate old default list to the latest canonical defaults.
  const isLegacyDefaultList =
    trimmed.length === LEGACY_DEFAULT_MODELS.length &&
    LEGACY_DEFAULT_MODELS.every((m) => trimmed.includes(m))

  if (isLegacyDefaultList) {
    store.set('models', DEFAULT_CLAUDE_MODELS)
    return [...DEFAULT_CLAUDE_MODELS]
  }

  // Ensure latest defaults are available while preserving user-added models.
  const withLatest = Array.from(new Set([...trimmed, ...DEFAULT_CLAUDE_MODELS]))
  if (withLatest.length !== trimmed.length) {
    store.set('models', withLatest)
  }
  return withLatest
}

async function callClaude(payload: { model: string; messages: PromptMessage[] }) {
  const apiKey = store.get('apiKey', '').trim()
  if (!apiKey) return { error: 'No Claude API key configured' as const }

  const { system, messages } = normalizeMessages(payload.messages)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: payload.model,
        system,
        messages,
        max_tokens: 4096,
        temperature: 0.6
      })
    })

    const body = await response.json() as unknown
    if (!response.ok) {
      return { error: extractError(body) as const }
    }

    const content = (body as { content?: Array<{ type?: string; text?: string }> }).content ?? []
    const text = content
      .filter((b) => b?.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text)
      .join('')
      .trim()

    return { message: { content: text } }
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export function registerClaudeHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('claude:setApiKey', (_, key: string) => {
    store.set('apiKey', key.trim())
    return { success: true }
  })

  ipcMain.handle('claude:getApiKey', () => store.get('apiKey', ''))

  ipcMain.handle('claude:addModel', (_, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return getEffectiveModels()
    const models = getEffectiveModels()
    if (!models.includes(trimmed)) store.set('models', [...models, trimmed])
    return getEffectiveModels()
  })

  ipcMain.handle('claude:removeModel', (_, name: string) => {
    const models = getEffectiveModels().filter((m: string) => m !== name)
    store.set('models', models)
    return models
  })

  ipcMain.handle('claude:getModels', () => getEffectiveModels())

  ipcMain.handle('claude:complete', async (_, payload: { model: string; messages: PromptMessage[] }) => {
    return callClaude(payload)
  })

  ipcMain.handle('claude:chat', async (_, payload: { model: string; messages: PromptMessage[] }) => {
    const result = await callClaude(payload)
    if ('error' in result) {
      mainWindow.webContents.send('claude:error', result.error)
      return
    }
    mainWindow.webContents.send('claude:chunk', result.message.content)
    mainWindow.webContents.send('claude:done')
  })

  ipcMain.handle('claude:analyzeFrame', async (_, payload: {
    model: string
    sources: Array<{ label: string; imageBase64?: string; terminalText?: string }>
    prompt: string
  }) => {
    const apiKey = store.get('apiKey', '').trim()
    if (!apiKey) return { error: 'No Claude API key configured' }

    // Build content blocks: label + image/text per source, then the prompt
    const contentBlocks: unknown[] = []
    for (const src of payload.sources) {
      contentBlocks.push({ type: 'text', text: `## ${src.label}` })
      if (src.imageBase64) {
        contentBlocks.push({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: src.imageBase64 }
        })
      }
      if (src.terminalText) {
        contentBlocks.push({ type: 'text', text: `\`\`\`\n${src.terminalText}\n\`\`\`` })
      }
    }
    contentBlocks.push({ type: 'text', text: payload.prompt })

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: payload.model,
          messages: [{ role: 'user', content: contentBlocks }],
          max_tokens: 1024
        })
      })

      const body = await response.json() as unknown
      if (!response.ok) return { error: extractError(body) }

      const content = (body as { content?: Array<{ type?: string; text?: string }> }).content ?? []
      const text = content.filter((b) => b?.type === 'text').map((b) => b.text).join('').trim()
      return { analysis: text }
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
}
