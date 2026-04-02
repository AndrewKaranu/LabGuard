import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close')
  },

  ollama: {
    checkStatus: () => ipcRenderer.invoke('ollama:checkStatus'),
    start: () => ipcRenderer.invoke('ollama:start'),
    install: () => ipcRenderer.invoke('ollama:install'),
    listModels: () => ipcRenderer.invoke('ollama:listModels'),
    pullModel: (model: string) => ipcRenderer.invoke('ollama:pullModel', model),
    deleteModel: (model: string) => ipcRenderer.invoke('ollama:deleteModel', model),
    chat: (payload: OllamaChatPayload) => ipcRenderer.invoke('ollama:chat', payload),
    complete: (payload: OllamaCompletePayload) => ipcRenderer.invoke('ollama:complete', payload),
    onChunk: (cb: (chunk: string) => void) => {
      const handler = (_: unknown, chunk: string) => cb(chunk)
      ipcRenderer.on('ollama:chunk', handler)
      return () => ipcRenderer.removeListener('ollama:chunk', handler)
    },
    onChatDone: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.once('ollama:done', handler)
      return () => ipcRenderer.removeListener('ollama:done', handler)
    }
  },

  nim: {
    setApiKey: (key: string) => ipcRenderer.invoke('nim:setApiKey', key),
    getApiKey: () => ipcRenderer.invoke('nim:getApiKey'),
    addModel: (name: string) => ipcRenderer.invoke('nim:addModel', name),
    removeModel: (name: string) => ipcRenderer.invoke('nim:removeModel', name),
    getModels: () => ipcRenderer.invoke('nim:getModels'),
    chat: (payload: NimChatPayload) => ipcRenderer.invoke('nim:chat', payload),
    complete: (payload: NimCompletePayload) => ipcRenderer.invoke('nim:complete', payload),
    analyzeFrame: (payload: FrameAnalysisPayload) => ipcRenderer.invoke('nim:analyzeFrame', payload),
    onChunk: (cb: (chunk: string) => void) => {
      const handler = (_: unknown, chunk: string) => cb(chunk)
      ipcRenderer.on('nim:chunk', handler)
      return () => ipcRenderer.removeListener('nim:chunk', handler)
    },
    onChatDone: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.once('nim:done', handler)
      return () => ipcRenderer.removeListener('nim:done', handler)
    },
    onError: (cb: (message: string) => void) => {
      const handler = (_: unknown, message: string) => cb(message)
      ipcRenderer.on('nim:error', handler)
      return () => ipcRenderer.removeListener('nim:error', handler)
    }
  },

  claude: {
    setApiKey: (key: string) => ipcRenderer.invoke('claude:setApiKey', key),
    getApiKey: () => ipcRenderer.invoke('claude:getApiKey'),
    addModel: (name: string) => ipcRenderer.invoke('claude:addModel', name),
    removeModel: (name: string) => ipcRenderer.invoke('claude:removeModel', name),
    getModels: () => ipcRenderer.invoke('claude:getModels'),
    chat: (payload: ClaudeChatPayload) => ipcRenderer.invoke('claude:chat', payload),
    complete: (payload: ClaudeCompletePayload) => ipcRenderer.invoke('claude:complete', payload),
    analyzeFrame: (payload: FrameAnalysisPayload) => ipcRenderer.invoke('claude:analyzeFrame', payload),
    onChunk: (cb: (chunk: string) => void) => {
      const handler = (_: unknown, chunk: string) => cb(chunk)
      ipcRenderer.on('claude:chunk', handler)
      return () => ipcRenderer.removeListener('claude:chunk', handler)
    },
    onChatDone: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.once('claude:done', handler)
      return () => ipcRenderer.removeListener('claude:done', handler)
    },
    onError: (cb: (message: string) => void) => {
      const handler = (_: unknown, message: string) => cb(message)
      ipcRenderer.on('claude:error', handler)
      return () => ipcRenderer.removeListener('claude:error', handler)
    }
  },

  screen: {
    getSources: () => ipcRenderer.invoke('screen:getSources')
  },

  notify: {
    getConfig: () => ipcRenderer.invoke('notify:getConfig'),
    setConfig: (patch: NotifyConfigPatch) => ipcRenderer.invoke('notify:setConfig', patch),
    sendTest: () => ipcRenderer.invoke('notify:sendTest'),
    sendAlert: (payload: NotifyAlertPayload) => ipcRenderer.invoke('notify:sendAlert', payload)
  },

  lab: {
    // Process management
    spawn: (command: string, workDir: string) => ipcRenderer.invoke('lab:spawn', command, workDir),
    stop: (id: string) => ipcRenderer.invoke('lab:stop', id),
    listProcesses: () => ipcRenderer.invoke('lab:listProcesses'),

    // Action registry
    getActions: () => ipcRenderer.invoke('lab:getActions'),
    callAction: (name: string, args?: Record<string, unknown>) => ipcRenderer.invoke('lab:callAction', name, args),
    getSocketPort: () => ipcRenderer.invoke('lab:getSocketPort'),

    // Events
    onStdout: (cb: (id: string, text: string) => void) => {
      const handler = (_: unknown, id: string, text: string) => cb(id, text)
      ipcRenderer.on('lab:stdout', handler)
      return () => ipcRenderer.removeListener('lab:stdout', handler)
    },
    onStderr: (cb: (id: string, text: string) => void) => {
      const handler = (_: unknown, id: string, text: string) => cb(id, text)
      ipcRenderer.on('lab:stderr', handler)
      return () => ipcRenderer.removeListener('lab:stderr', handler)
    },
    onExit: (cb: (id: string, code: number | null, signal: string | null) => void) => {
      const handler = (_: unknown, id: string, code: number | null, signal: string | null) => cb(id, code, signal)
      ipcRenderer.on('lab:exit', handler)
      return () => ipcRenderer.removeListener('lab:exit', handler)
    },
    onActionRegistered: (cb: (action: RegisteredAction) => void) => {
      const handler = (_: unknown, action: RegisteredAction) => cb(action)
      ipcRenderer.on('lab:actionRegistered', handler)
      return () => ipcRenderer.removeListener('lab:actionRegistered', handler)
    },
    onActionRemoved: (cb: (name: string) => void) => {
      const handler = (_: unknown, name: string) => cb(name)
      ipcRenderer.on('lab:actionRemoved', handler)
      return () => ipcRenderer.removeListener('lab:actionRemoved', handler)
    },
    onAttached: (cb: (info: { id: string; name: string }) => void) => {
      const handler = (_: unknown, info: { id: string; name: string }) => cb(info)
      ipcRenderer.on('lab:attached', handler)
      return () => ipcRenderer.removeListener('lab:attached', handler)
    }
  }
})

interface OllamaChatPayload {
  model: string
  messages: { role: string; content: string }[]
  stream?: boolean
}

interface OllamaCompletePayload {
  model: string
  messages: { role: string; content: string }[]
}

interface NimChatPayload {
  model: string
  messages: { role: string; content: string }[]
}

interface NimCompletePayload {
  model: string
  messages: { role: string; content: string }[]
}

interface ClaudeChatPayload {
  model: string
  messages: { role: string; content: string }[]
}

interface ClaudeCompletePayload {
  model: string
  messages: { role: string; content: string }[]
}

interface FrameAnalysisSource {
  label: string
  imageBase64?: string
  terminalText?: string
}

interface FrameAnalysisPayload {
  model: string
  sources: FrameAnalysisSource[]
  prompt: string
}

interface NotifyConfigPatch {
  enabled?: boolean
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPassword?: string
  fromEmail?: string
  fromName?: string
  toEmail?: string
}

interface NotifyAlertPayload {
  subject: string
  text: string
  html?: string
}

interface RegisteredAction {
  name: string
  description: string
  params: Record<string, string | null>
  clientId: string
  online: boolean
}
