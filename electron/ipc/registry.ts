import { ipcMain, BrowserWindow } from 'electron'
import * as net from 'net'
import { randomUUID } from 'crypto'

const SOCKET_PORT = 7821

interface RegisteredAction {
  name: string
  description: string
  params: Record<string, string | null>
  clientId: string
  online: boolean
}

interface PendingCall {
  resolve: (result: { success: boolean; output: string }) => void
  timeout: ReturnType<typeof setTimeout>
}

const actions = new Map<string, RegisteredAction>()
const clients = new Map<string, net.Socket>()
const pendingCalls = new Map<string, PendingCall>()
// clientId → experimentId for piped runs
const pipedRuns = new Map<string, string>()

let server: net.Server | null = null

export function listRegisteredActions(): RegisteredAction[] {
  return Array.from(actions.values())
}

export async function callRegisteredAction(name: string, args: Record<string, unknown> = {}) {
  const action = actions.get(name)
  if (!action) return { success: false, output: `Action "${name}" not registered` }
  if (!action.online) return { success: false, output: `Action "${name}" is offline` }
  if (!clients.has(action.clientId)) return { success: false, output: `Action "${name}" has no active client` }

  const callId = randomUUID()

  return await new Promise<{ success: boolean; output: string }>((resolve) => {
    const timeout = setTimeout(() => {
      pendingCalls.delete(callId)
      resolve({ success: false, output: 'Action timed out after 30s' })
    }, 30000)

    pendingCalls.set(callId, { resolve, timeout })
    sendToClient(action.clientId, { type: 'call', call_id: callId, name, args })
  })
}

function sendToClient(clientId: string, msg: Record<string, unknown>) {
  const socket = clients.get(clientId)
  if (socket && !socket.destroyed) {
    socket.write(JSON.stringify(msg) + '\n')
  }
}

export function registerRegistryHandlers(mainWindow: BrowserWindow) {
  // Start TCP socket server for Python SDK
  server = net.createServer((socket) => {
    const clientId = randomUUID()
    clients.set(clientId, socket)

    let buf = ''

    socket.on('data', (data) => {
      buf += data.toString()
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          handleClientMessage(clientId, msg, mainWindow)
        } catch {
          // ignore malformed messages
        }
      }
    })

    socket.on('close', () => {
      clients.delete(clientId)
      // Keep action definitions but mark them offline when the client disconnects.
      for (const [name, action] of actions.entries()) {
        if (action.clientId === clientId) {
          const updated = { ...action, online: false }
          actions.set(name, updated)
          mainWindow.webContents.send('lab:actionRegistered', updated)
        }
      }
      // If a piped run was attached by this client, signal exit
      const attachedId = pipedRuns.get(clientId)
      if (attachedId) {
        pipedRuns.delete(clientId)
        mainWindow.webContents.send('lab:exit', attachedId, null, null)
      }
    })

    socket.on('error', () => {
      clients.delete(clientId)
    })

    // Ack connection
    sendToClient(clientId, { type: 'connected', clientId })
  })

  server.listen(SOCKET_PORT, '127.0.0.1', () => {
    console.log(`LabGuard registry listening on port ${SOCKET_PORT}`)
  })

  server.on('error', (err) => {
    console.error('Registry server error:', err.message)
  })

  ipcMain.handle('lab:getActions', () => {
    return listRegisteredActions()
  })

  ipcMain.handle('lab:callAction', async (_, name: string, args: Record<string, unknown> = {}) => {
    return callRegisteredAction(name, args)
  })

  ipcMain.handle('lab:getSocketPort', () => SOCKET_PORT)
}

function handleClientMessage(
  clientId: string,
  msg: Record<string, unknown>,
  mainWindow: BrowserWindow
) {
  if (msg.type === 'attach') {
    // A piped run is connecting — create a new experiment ID
    const id = randomUUID()
    const name = (msg.name as string) || 'piped-run'
    pipedRuns.set(clientId, id)
    sendToClient(clientId, { type: 'attached', id })
    mainWindow.webContents.send('lab:attached', { id, name })
  } else if (msg.type === 'log') {
    // Forward a line from the piped process as stdout/stderr
    const id = pipedRuns.get(clientId)
    if (id) {
      const stream = (msg.stream as string) === 'stderr' ? 'lab:stderr' : 'lab:stdout'
      mainWindow.webContents.send(stream, id, (msg.text as string) + '\n')
    }
  } else if (msg.type === 'exit') {
    const id = pipedRuns.get(clientId)
    if (id) {
      pipedRuns.delete(clientId)
      mainWindow.webContents.send('lab:exit', id, (msg.code as number) ?? 0, null)
    }
  } else if (msg.type === 'register') {
    const action: RegisteredAction = {
      name: msg.name as string,
      description: (msg.description as string) || '',
      params: (msg.params as Record<string, string | null>) || {},
      clientId,
      online: true
    }
    actions.set(action.name, action)
    sendToClient(clientId, { type: 'ack', name: action.name })
    mainWindow.webContents.send('lab:actionRegistered', action)
  } else if (msg.type === 'result') {
    const callId = msg.call_id as string
    const pending = pendingCalls.get(callId)
    if (pending) {
      clearTimeout(pending.timeout)
      pendingCalls.delete(callId)
      pending.resolve({
        success: msg.success as boolean,
        output: (msg.output as string) || ''
      })
      mainWindow.webContents.send('lab:actionExecuted', {
        callId,
        name: msg.name,
        success: msg.success,
        output: msg.output
      })
    }
  }
}
