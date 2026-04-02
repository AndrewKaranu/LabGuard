import { ipcMain, BrowserWindow } from 'electron'
import { exec, spawn } from 'child_process'
import { promisify } from 'util'
import * as http from 'http'

const execAsync = promisify(exec)
const OLLAMA_BASE = 'http://localhost:11434'

// ── Helpers ────────────────────────────────────────────────────────────────

async function pingOllama(): Promise<boolean> {
  return new Promise((resolve) => {
    http
      .get(`${OLLAMA_BASE}/api/tags`, (res) => resolve(res.statusCode === 200))
      .on('error', () => resolve(false))
  })
}

async function isOllamaInstalled(): Promise<boolean> {
  try {
    await execAsync('ollama --version')
    return true
  } catch {
    return false
  }
}

async function fetchJson<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    http.get(`${OLLAMA_BASE}${path}`, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve(JSON.parse(data)))
    }).on('error', reject)
  })
}

// Waits up to `maxMs` for Ollama to become reachable, polling every 500ms
async function waitForOllama(maxMs = 10000): Promise<boolean> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (await pingOllama()) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

// ── IPC Handlers ──────────────────────────────────────────────────────────

export function registerOllamaHandlers() {
  // Returns { running: boolean, installed: boolean }
  ipcMain.handle('ollama:checkStatus', async () => {
    const running = await pingOllama()
    if (running) return { running: true, installed: true }
    const installed = await isOllamaInstalled()
    return { running: false, installed }
  })

  // Start the ollama server in the background, wait for it to be ready
  ipcMain.handle('ollama:start', async () => {
    // Spawn detached so it outlives any intermediate shells
    const proc = spawn('ollama', ['serve'], {
      shell: true,
      detached: true,
      stdio: 'ignore'
    })
    proc.unref()

    const ready = await waitForOllama(15000)
    return { success: ready, error: ready ? undefined : 'Ollama did not start within 15 seconds' }
  })

  // Install ollama — platform-aware
  ipcMain.handle('ollama:install', async () => {
    const platform = process.platform
    let cmd: string
    if (platform === 'win32') {
      cmd = 'winget install Ollama.Ollama --silent'
    } else if (platform === 'darwin') {
      cmd = 'brew install ollama'
    } else {
      cmd = 'curl -fsSL https://ollama.com/install.sh | sh'
    }
    try {
      await execAsync(cmd)
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('ollama:listModels', async () => {
    try {
      const data = await fetchJson<{ models: { name: string; size: number; modified_at: string }[] }>('/api/tags')
      return data.models ?? []
    } catch {
      return []
    }
  })

  ipcMain.handle('ollama:pullModel', async (_, model: string) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const proc = spawn('ollama', ['pull', model], { shell: true })
      proc.on('close', (code) => {
        if (code === 0) resolve({ success: true })
        else resolve({ success: false, error: `Exit code ${code}` })
      })
      proc.on('error', (err) => resolve({ success: false, error: err.message }))
    })
  })

  ipcMain.handle('ollama:deleteModel', async (_, model: string) => {
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const proc = spawn('ollama', ['rm', model], { shell: true })
      proc.on('close', (code) => {
        if (code === 0) resolve({ success: true })
        else resolve({ success: false, error: `Exit code ${code}` })
      })
      proc.on('error', (err) => resolve({ success: false, error: err.message }))
    })
  })

  // Streaming chat — sends chunks via 'ollama:chunk' events, resolves when done
  ipcMain.handle('ollama:chat', async (event, payload: {
    model: string
    messages: { role: string; content: string }[]
    stream?: boolean
  }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const body = JSON.stringify({ ...payload, stream: true })

    return new Promise<void>((resolve, reject) => {
      const req = http.request(
        { hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        (res) => {
          res.on('data', (chunk: Buffer) => {
            const lines = chunk.toString().split('\n').filter(Boolean)
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line)
                if (parsed.message?.content) {
                  win?.webContents.send('ollama:chunk', parsed.message.content)
                }
                if (parsed.done) {
                  win?.webContents.send('ollama:done')
                }
              } catch {
                // partial JSON, skip
              }
            }
          })
          res.on('end', () => resolve())
        }
      )
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  })

  // Non-streaming single completion — returns full message object (supports tool_calls)
  ipcMain.handle('ollama:complete', async (_, payload: {
    model: string
    messages: { role: string; content: string; tool_calls?: unknown[] }[]
    tools?: unknown[]
  }) => {
    const body = JSON.stringify({ ...payload, stream: false })
    return new Promise<unknown>((resolve, reject) => {
      const req = http.request(
        { hostname: 'localhost', port: 11434, path: '/api/chat', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
        (res) => {
          let data = ''
          res.on('data', (chunk: Buffer) => (data += chunk.toString()))
          res.on('end', () => {
            try { resolve(JSON.parse(data)) }
            catch { reject(new Error('Invalid JSON from Ollama')) }
          })
        }
      )
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  })
}
