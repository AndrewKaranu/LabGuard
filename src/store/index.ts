import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ──────────────────────────────────────────────────────────────────

export type OllamaStatus = 'checking' | 'not_installed' | 'installing' | 'not_running' | 'ready'

export interface OllamaModel {
  name: string
  size: number
  modified_at: string
}

export type ExperimentStatus = 'running' | 'stopped' | 'error' | 'completed'

export type VideoSourceType = 'webcam' | 'screencapture' | 'mp4' | 'terminal'

export interface VideoSource {
  id: string
  type: VideoSourceType
  label?: string
  videoFileName?: string        // mp4: original file name
  linkedExperimentId?: string   // terminal: which run to pull logs from
}

export interface Experiment {
  id: string
  name: string
  command: string
  workDir: string
  status: ExperimentStatus
  pid?: number
  startedAt: number
  stoppedAt?: number
  exitCode?: number | null
  // Video/multi-source monitoring (undefined = terminal/pipe run)
  sources?: VideoSource[]
  monitoringInstructions?: string
  // Legacy single-source fields (kept for persisted v1 data migration)
  sourceType?: 'webcam' | 'screencapture' | 'mp4'
  videoFileName?: string
}

export interface TerminalLine {
  text: string
  timestamp: number
  stream: 'stdout' | 'stderr'
}

export interface MetricPoint {
  value: number
  step: number
}

export interface WatchdogEvent {
  id: string
  timestamp: number
  decision: {
    action: string | null
    reason: string
    args?: Record<string, unknown>
  }
  status: 'analysis' | 'pending_approval' | 'approved' | 'rejected' | 'executed' | 'failed'
  output?: string
}

export interface RegisteredAction {
  name: string
  description: string
  params: Record<string, string | null>
  clientId: string
  online: boolean
}

export interface RunChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

// ── Store ──────────────────────────────────────────────────────────────────

interface AppState {
  // Ollama
  ollamaStatus: OllamaStatus
  models: OllamaModel[]
  selectedModel: string | null
  setOllamaStatus: (s: OllamaStatus) => void
  setModels: (m: OllamaModel[]) => void
  setSelectedModel: (m: string) => void
  nimModels: string[]
  nimApiKey: string
  setNimModels: (m: string[]) => void
  setNimApiKey: (k: string) => void
  claudeModels: string[]
  claudeApiKey: string
  setClaudeModels: (m: string[]) => void
  setClaudeApiKey: (k: string) => void

  // Experiments
  experiments: Experiment[]
  activeExperimentId: string | null
  addExperiment: (exp: Experiment) => void
  updateExperiment: (id: string, patch: Partial<Experiment>) => void
  setActiveExperiment: (id: string | null) => void
  deleteExperiment: (id: string) => void

  // Terminal output (keyed by experiment id)
  terminalLines: Record<string, TerminalLine[]>
  appendLine: (experimentId: string, line: TerminalLine) => void
  clearTerminal: (experimentId: string) => void

  // Metrics (keyed by experiment id, then metric name)
  metrics: Record<string, Record<string, MetricPoint[]>>
  upsertMetric: (experimentId: string, name: string, point: MetricPoint) => void

  // Watchdog events (keyed by experiment id)
  watchdogEvents: Record<string, WatchdogEvent[]>
  addWatchdogEvent: (experimentId: string, event: WatchdogEvent) => void
  updateWatchdogEvent: (experimentId: string, eventId: string, patch: Partial<WatchdogEvent>) => void
  watchdogEnabled: boolean
  setWatchdogEnabled: (v: boolean) => void
  watchdogIntervalSecs: number
  setWatchdogIntervalSecs: (v: number) => void

  // Actions registry
  registeredActions: RegisteredAction[]
  setRegisteredActions: (actions: RegisteredAction[]) => void
  addRegisteredAction: (action: RegisteredAction) => void
  removeRegisteredAction: (name: string) => void

  // Run chat history (keyed by experiment id)
  runChatHistory: Record<string, RunChatMessage[]>
  addRunChatMessage: (experimentId: string, message: RunChatMessage) => void
  clearRunChat: (experimentId: string) => void

  // UI
  activeTab: 'terminal' | 'metrics' | 'watchdog' | 'actions' | 'chat' | 'video'
  setActiveTab: (t: 'terminal' | 'metrics' | 'watchdog' | 'actions' | 'chat' | 'video') => void
  activeSection: 'runs' | 'settings'
  setActiveSection: (s: 'runs' | 'settings') => void
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      // Ollama
      ollamaStatus: 'checking',
      models: [],
      selectedModel: null,
      setOllamaStatus: (ollamaStatus) => set({ ollamaStatus }),
      setModels: (models) => set({ models }),
      setSelectedModel: (selectedModel) => set({ selectedModel }),
      nimModels: [],
      nimApiKey: '',
      setNimModels: (nimModels) => set({ nimModels }),
      setNimApiKey: (nimApiKey) => set({ nimApiKey }),
      claudeModels: [],
      claudeApiKey: '',
      setClaudeModels: (claudeModels) => set({ claudeModels }),
      setClaudeApiKey: (claudeApiKey) => set({ claudeApiKey }),

      // Experiments
      experiments: [],
      activeExperimentId: null,
      addExperiment: (exp) => set((s) => ({ experiments: [...s.experiments, exp] })),
      updateExperiment: (id, patch) =>
        set((s) => ({
          experiments: s.experiments.map((e) => e.id === id ? { ...e, ...patch } : e)
        })),
      setActiveExperiment: (activeExperimentId) => set({ activeExperimentId }),
      deleteExperiment: (id) =>
        set((s) => {
          const { [id]: _tl, ...terminalLines } = s.terminalLines
          const { [id]: _m, ...metrics } = s.metrics
          const { [id]: _we, ...watchdogEvents } = s.watchdogEvents
          const { [id]: _ch, ...runChatHistory } = s.runChatHistory
          return {
            experiments: s.experiments.filter((e) => e.id !== id),
            activeExperimentId: s.activeExperimentId === id ? null : s.activeExperimentId,
            terminalLines,
            metrics,
            watchdogEvents,
            runChatHistory
          }
        }),

      // Terminal
      terminalLines: {},
      appendLine: (experimentId, line) =>
        set((s) => {
          const existing = s.terminalLines[experimentId] ?? []
          // Cap at 5000 lines to avoid memory growth
          const lines = existing.length >= 5000
            ? [...existing.slice(-4999), line]
            : [...existing, line]
          return { terminalLines: { ...s.terminalLines, [experimentId]: lines } }
        }),
      clearTerminal: (experimentId) =>
        set((s) => ({ terminalLines: { ...s.terminalLines, [experimentId]: [] } })),

      // Metrics
      metrics: {},
      upsertMetric: (experimentId, name, point) =>
        set((s) => {
          const expMetrics = s.metrics[experimentId] ?? {}
          const series = expMetrics[name] ?? []
          return {
            metrics: {
              ...s.metrics,
              [experimentId]: {
                ...expMetrics,
                [name]: [...series, point]
              }
            }
          }
        }),

      // Watchdog
      watchdogEvents: {},
      addWatchdogEvent: (experimentId, event) =>
        set((s) => {
          const existing = s.watchdogEvents[experimentId] ?? []
          return { watchdogEvents: { ...s.watchdogEvents, [experimentId]: [...existing, event] } }
        }),
      updateWatchdogEvent: (experimentId, eventId, patch) =>
        set((s) => {
          const events = (s.watchdogEvents[experimentId] ?? []).map((e) =>
            e.id === eventId ? { ...e, ...patch } : e
          )
          return { watchdogEvents: { ...s.watchdogEvents, [experimentId]: events } }
        }),
      watchdogEnabled: true,
      setWatchdogEnabled: (watchdogEnabled) => set({ watchdogEnabled }),
      watchdogIntervalSecs: 20,
      setWatchdogIntervalSecs: (watchdogIntervalSecs) => set({ watchdogIntervalSecs }),

      // Actions
      registeredActions: [],
      setRegisteredActions: (registeredActions) => set({ registeredActions }),
      addRegisteredAction: (action) =>
        set((s) => ({
          registeredActions: [...s.registeredActions.filter((a) => a.name !== action.name), action]
        })),
      removeRegisteredAction: (name) =>
        set((s) => ({ registeredActions: s.registeredActions.filter((a) => a.name !== name) })),

      // Run chat
      runChatHistory: {},
      addRunChatMessage: (experimentId, message) =>
        set((s) => {
          const existing = s.runChatHistory[experimentId] ?? []
          return { runChatHistory: { ...s.runChatHistory, [experimentId]: [...existing, message] } }
        }),
      clearRunChat: (experimentId) =>
        set((s) => ({ runChatHistory: { ...s.runChatHistory, [experimentId]: [] } })),

      // UI
      activeTab: 'terminal',
      setActiveTab: (activeTab) => set({ activeTab }),
      activeSection: 'runs',
      setActiveSection: (activeSection) => set({ activeSection })
    }),
    {
      name: 'labguard-storage',
      partialize: (s) => ({
        experiments: s.experiments,
        // Cap terminal lines to last 500 per run for persistence
        terminalLines: Object.fromEntries(
          Object.entries(s.terminalLines).map(([id, lines]) => [id, lines.slice(-500)])
        ),
        metrics: s.metrics,
        watchdogEvents: s.watchdogEvents,
        runChatHistory: s.runChatHistory,
        selectedModel: s.selectedModel,
        nimModels: s.nimModels,
        claudeModels: s.claudeModels,
        nimApiKey: s.nimApiKey,
        claudeApiKey: s.claudeApiKey,
        watchdogEnabled: s.watchdogEnabled,
        watchdogIntervalSecs: s.watchdogIntervalSecs
      })
    }
  )
)
