import { ipcMain, BrowserWindow } from 'electron'
import Store from 'electron-store'
import OpenAI from 'openai'

interface NimStore {
  apiKey: string
  models: string[]
}

const store = new Store<NimStore>({ name: 'nim', defaults: { apiKey: '', models: [] } })

function getClient(): OpenAI | null {
  const apiKey = store.get('apiKey')
  if (!apiKey) return null
  return new OpenAI({ apiKey, baseURL: 'https://integrate.api.nvidia.com/v1' })
}

export function registerNimHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('nim:setApiKey', (_, key: string) => {
    store.set('apiKey', key.trim())
    return { success: true }
  })

  ipcMain.handle('nim:getApiKey', () => store.get('apiKey', ''))

  ipcMain.handle('nim:addModel', (_, name: string) => {
    const models = store.get('models', [])
    if (!models.includes(name)) store.set('models', [...models, name])
    return store.get('models')
  })

  ipcMain.handle('nim:removeModel', (_, name: string) => {
    const models = store.get('models', []).filter((m: string) => m !== name)
    store.set('models', models)
    return models
  })

  ipcMain.handle('nim:getModels', () => store.get('models', []))

  ipcMain.handle('nim:complete', async (_, payload: {
    model: string
    messages: { role: string; content: string }[]
  }) => {
    const client = getClient()
    if (!client) return { error: 'No NVIDIA NIM API key configured' }

    try {
      const completion = await client.chat.completions.create({
        model: payload.model,
        messages: payload.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: 0.6,
        top_p: 0.7,
        max_tokens: 4096,
        stream: false
      })
      return {
        message: { content: completion.choices[0]?.message?.content ?? '' }
      }
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('nim:chat', async (_, payload: {
    model: string
    messages: { role: string; content: string }[]
  }) => {
    const client = getClient()
    if (!client) {
      mainWindow.webContents.send('nim:error', 'No NVIDIA NIM API key configured')
      return
    }

    try {
      const stream = await client.chat.completions.create({
        model: payload.model,
        messages: payload.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        temperature: 0.6,
        top_p: 0.7,
        max_tokens: 4096,
        stream: true
      })

      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content
        if (text) mainWindow.webContents.send('nim:chunk', text)
      }
      mainWindow.webContents.send('nim:done')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      mainWindow.webContents.send('nim:error', msg)
    }
  })

  ipcMain.handle('nim:analyzeFrame', async (_, payload: {
    model: string
    sources: Array<{ label: string; imageBase64?: string; terminalText?: string }>
    prompt: string
  }) => {
    const client = getClient()
    if (!client) return { error: 'No NVIDIA NIM API key configured' }

    const contentParts: OpenAI.Chat.ChatCompletionContentPart[] = []
    for (const src of payload.sources) {
      contentParts.push({ type: 'text', text: `## ${src.label}` })
      if (src.imageBase64) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${src.imageBase64}` }
        })
      }
      if (src.terminalText) {
        contentParts.push({ type: 'text', text: `\`\`\`\n${src.terminalText}\n\`\`\`` })
      }
    }
    contentParts.push({ type: 'text', text: payload.prompt })

    try {
      const completion = await client.chat.completions.create({
        model: payload.model,
        messages: [{ role: 'user', content: contentParts }] as OpenAI.Chat.ChatCompletionMessageParam[],
        max_tokens: 1024,
        stream: false
      })
      return { analysis: completion.choices[0]?.message?.content ?? '' }
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })
}
