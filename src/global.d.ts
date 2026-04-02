interface OllamaChatPayload {
  model: string
  messages: { role: string; content: string }[]
  stream?: boolean
}

interface OllamaCompletePayload {
  model: string
  messages: { role: string; content: string }[]
}

interface OllamaCompleteResponse {
  message: { role: string; content: string }
  done: boolean
}

interface NimChatPayload {
  model: string
  messages: { role: string; content: string }[]
}

interface NimCompletePayload {
  model: string
  messages: { role: string; content: string }[]
}

interface NimCompleteResponse {
  message: { content: string }
  error?: string
}

interface ClaudeChatPayload {
  model: string
  messages: { role: string; content: string }[]
}

interface ClaudeCompletePayload {
  model: string
  messages: { role: string; content: string }[]
}

interface ClaudeCompleteResponse {
  message: { content: string }
  error?: string
}

interface FrameAnalysisSource {
  label: string
  imageBase64?: string   // video frame as JPEG base64
  terminalText?: string  // text from a linked terminal run
}

interface FrameAnalysisPayload {
  model: string
  sources: FrameAnalysisSource[]
  prompt: string
}

interface FrameAnalysisResponse {
  analysis?: string
  error?: string
}

interface ScreenSource {
  id: string
  name: string
  thumbnail: string
}

interface NotifyConfig {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  fromEmail: string
  fromName: string
  toEmail: string
}

interface NotifyResponse {
  success: boolean
  error?: string
}

interface OllamaStatus {
  running: boolean
  installed: boolean
}

interface OllamaModel {
  name: string
  size: number
  modified_at: string
}

interface RegisteredAction {
  name: string
  description: string
  params: Record<string, string | null>
  clientId: string
  online: boolean
}

interface Window {
  api: {
    window: {
      minimize: () => void
      maximize: () => void
      close: () => void
    }
    ollama: {
      checkStatus: () => Promise<OllamaStatus>
      start: () => Promise<{ success: boolean; error?: string }>
      install: () => Promise<{ success: boolean; error?: string }>
      listModels: () => Promise<OllamaModel[]>
      pullModel: (model: string) => Promise<{ success: boolean; error?: string }>
      deleteModel: (model: string) => Promise<{ success: boolean; error?: string }>
      chat: (payload: OllamaChatPayload) => Promise<void>
      complete: (payload: OllamaCompletePayload) => Promise<OllamaCompleteResponse>
      onChunk: (cb: (chunk: string) => void) => () => void
      onChatDone: (cb: () => void) => () => void
    }
    nim: {
      setApiKey: (key: string) => Promise<{ success: boolean }>
      getApiKey: () => Promise<string>
      addModel: (name: string) => Promise<string[]>
      removeModel: (name: string) => Promise<string[]>
      getModels: () => Promise<string[]>
      chat: (payload: NimChatPayload) => Promise<void>
      complete: (payload: NimCompletePayload) => Promise<NimCompleteResponse>
      analyzeFrame: (payload: FrameAnalysisPayload) => Promise<FrameAnalysisResponse>
      onChunk: (cb: (chunk: string) => void) => () => void
      onChatDone: (cb: () => void) => () => void
      onError: (cb: (message: string) => void) => () => void
    }
    claude: {
      setApiKey: (key: string) => Promise<{ success: boolean }>
      getApiKey: () => Promise<string>
      addModel: (name: string) => Promise<string[]>
      removeModel: (name: string) => Promise<string[]>
      getModels: () => Promise<string[]>
      chat: (payload: ClaudeChatPayload) => Promise<void>
      complete: (payload: ClaudeCompletePayload) => Promise<ClaudeCompleteResponse>
      analyzeFrame: (payload: FrameAnalysisPayload) => Promise<FrameAnalysisResponse>
      onChunk: (cb: (chunk: string) => void) => () => void
      onChatDone: (cb: () => void) => () => void
      onError: (cb: (message: string) => void) => () => void
    }
    screen: {
      getSources: () => Promise<ScreenSource[]>
    }
    notify: {
      getConfig: () => Promise<NotifyConfig>
      setConfig: (patch: Partial<NotifyConfig>) => Promise<{ success: boolean; config: NotifyConfig }>
      sendTest: () => Promise<NotifyResponse>
      sendAlert: (payload: { subject: string; text: string; html?: string }) => Promise<NotifyResponse>
    }
    lab: {
      spawn: (command: string, workDir: string) => Promise<{ id: string; pid?: number }>
      stop: (id: string) => Promise<{ success: boolean; error?: string }>
      listProcesses: () => Promise<{ id: string; command: string; workDir: string }[]>
      getActions: () => Promise<RegisteredAction[]>
      callAction: (name: string, args?: Record<string, unknown>) => Promise<{ success: boolean; output: string }>
      getSocketPort: () => Promise<number>
      onStdout: (cb: (id: string, text: string) => void) => () => void
      onStderr: (cb: (id: string, text: string) => void) => () => void
      onExit: (cb: (id: string, code: number | null, signal: string | null) => void) => () => void
      onActionRegistered: (cb: (action: RegisteredAction) => void) => () => void
      onActionRemoved: (cb: (name: string) => void) => () => void
      onAttached: (cb: (info: { id: string; name: string }) => void) => () => void
    }
  }
}
