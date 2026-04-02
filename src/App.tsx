import { useEffect, useState } from 'react'
import { useStore } from './store'
import { OllamaSetup } from './components/Setup/OllamaSetup'
import { Sidebar } from './components/Layout/Sidebar'
import { TerminalView } from './components/Terminal/TerminalView'
import { MetricsPanel } from './components/Metrics/MetricsPanel'
import { WatchdogFeed } from './components/Watchdog/WatchdogFeed'
import { ActionsPanel } from './components/Actions/ActionsPanel'
import { RunChat } from './components/Chat/RunChat'
import { VideoMonitor } from './components/Video/VideoMonitor'
import { NewRunDialog } from './components/Dashboard/NewRunDialog'
import { ModelsView } from './components/Models/ModelsView'
import { useWatchdog } from './hooks/useWatchdog'
import { parseLine } from './lib/metricsParser'
import { Button } from './components/ui/button'
import { cn } from './lib/utils'
import { Cloud } from 'lucide-react'
import { Plus, Square, Terminal, BarChart2, Zap, Plug, ChevronDown, MessageSquare, Video } from 'lucide-react'

export default function App() {
  // Use targeted selectors so this component only re-renders when these specific values change
  const ollamaStatus = useStore((s) => s.ollamaStatus)
  const activeExperimentId = useStore((s) => s.activeExperimentId)
  const experiments = useStore((s) => s.experiments)
  const activeTab = useStore((s) => s.activeTab)
  const activeSection = useStore((s) => s.activeSection)
  const models = useStore((s) => s.models)
  const nimModels = useStore((s) => s.nimModels)
  const claudeModels = useStore((s) => s.claudeModels)
  const selectedModel = useStore((s) => s.selectedModel)
  const setActiveTab = useStore((s) => s.setActiveTab)
  const setSelectedModel = useStore((s) => s.setSelectedModel)
  const setModels = useStore((s) => s.setModels)
  const setNimModels = useStore((s) => s.setNimModels)
  const setClaudeModels = useStore((s) => s.setClaudeModels)
  const deleteExperiment = useStore((s) => s.deleteExperiment)

  const [newRunOpen, setNewRunOpen] = useState(false)

  const activeExperiment = experiments.find((e) => e.id === activeExperimentId)

  // When the active experiment changes, switch to the appropriate default tab
  useEffect(() => {
    if (!activeExperiment) return
    const isVideoRun = !!(activeExperiment.sources?.length || activeExperiment.sourceType)
    if (isVideoRun) {
      setActiveTab('video')
    } else if (activeTab === 'video') {
      setActiveTab('terminal')
    }
  }, [activeExperimentId])

  useWatchdog(activeExperimentId)

  // Wire IPC events once — all callbacks use useStore.getState() to avoid stale closures
  useEffect(() => {
    const unsubStdout = window.api.lab.onStdout((id, text) => {
      const { appendLine, upsertMetric } = useStore.getState()
      const lines = text.split(/\r?\n/)
      for (const raw of lines) {
        if (!raw) continue
        appendLine(id, { text: raw, timestamp: Date.now(), stream: 'stdout' })
        const parsed = parseLine(raw)
        if (parsed) {
          const step = Date.now()
          for (const [name, value] of Object.entries(parsed)) {
            if (typeof value === 'number' && isFinite(value)) {
              upsertMetric(id, name, { value, step })
            }
          }
        }
      }
    })

    const unsubStderr = window.api.lab.onStderr((id, text) => {
      const { appendLine } = useStore.getState()
      const lines = text.split(/\r?\n/)
      for (const raw of lines) {
        if (!raw) continue
        appendLine(id, { text: raw, timestamp: Date.now(), stream: 'stderr' })
      }
    })

    const unsubExit = window.api.lab.onExit((id, code, signal) => {
      const state = useStore.getState()
      const exp = state.experiments.find((e) => e.id === id)
      const status = code === 0 ? 'completed' : code == null ? 'stopped' : 'error'

      state.updateExperiment(id, {
        status,
        stoppedAt: Date.now(),
        exitCode: code
      })

      if (status !== 'completed') {
        const runName = exp?.name ?? id.slice(0, 8)
        const reason = signal
          ? `signal=${signal}`
          : code == null
            ? 'process terminated unexpectedly'
            : `exit_code=${code}`

        void window.api.notify.sendAlert({
          subject: 'LabGuard Alert: Training Stopped',
          text: [
            `Run: ${runName}`,
            `Run ID: ${id}`,
            `Status: ${status}`,
            `Reason: ${reason}`,
            `Command: ${exp?.command ?? '(unknown)'}`
          ].join('\n')
        })
      }
    })

    const unsubActionRegistered = window.api.lab.onActionRegistered((action) => {
      useStore.getState().addRegisteredAction(action)
    })

    const unsubActionRemoved = window.api.lab.onActionRemoved((name) => {
      useStore.getState().removeRegisteredAction(name)
    })

    const unsubAttached = window.api.lab.onAttached((info) => {
      const { addExperiment, setActiveExperiment, setActiveTab } = useStore.getState()
      addExperiment({
        id: info.id,
        name: info.name,
        command: `pipe: ${info.name}`,
        workDir: '.',
        status: 'running',
        startedAt: Date.now()
      })
      setActiveExperiment(info.id)
      setActiveTab('terminal')
    })

    window.api.lab.getActions().then((actions) => useStore.getState().setRegisteredActions(actions))

    return () => {
      unsubStdout()
      unsubStderr()
      unsubExit()
      unsubActionRegistered()
      unsubActionRemoved()
      unsubAttached()
    }
  }, [])

  // Keep local and cloud model lists in sync for the titlebar selector.
  useEffect(() => {
    if (ollamaStatus !== 'ready') return
    Promise.all([
      window.api.ollama.listModels(),
      window.api.nim.getModels().catch(() => [] as string[]),
      window.api.claude.getModels().catch(() => [] as string[])
    ]).then(([local, nim, claude]) => {
      setModels(local)
      setNimModels(nim)
      setClaudeModels(claude)

      const current = useStore.getState().selectedModel
      if (!current) {
        const fallback = local[0]?.name ?? nim[0] ?? claude[0]
        if (fallback) setSelectedModel(fallback)
      }
    })
  }, [ollamaStatus])

  async function stopExperiment() {
    if (!activeExperimentId) return
    await window.api.lab.stop(activeExperimentId)
  }

  if (ollamaStatus !== 'ready') {
    return <OllamaSetup />
  }

  const isVideoRun = !!(activeExperiment?.sourceType)

  const TERMINAL_TABS = [
    { id: 'terminal' as const, label: 'Terminal', icon: Terminal },
    { id: 'metrics' as const, label: 'Metrics', icon: BarChart2 },
    { id: 'watchdog' as const, label: 'Watchdog', icon: Zap },
    { id: 'actions' as const, label: 'Actions', icon: Plug },
    { id: 'chat' as const, label: 'Chat', icon: MessageSquare }
  ]

  const VIDEO_TABS = [
    { id: 'video' as const, label: 'Monitor', icon: Video },
    { id: 'watchdog' as const, label: 'Analysis', icon: Zap },
    { id: 'chat' as const, label: 'Chat', icon: MessageSquare }
  ]

  const TABS = isVideoRun ? VIDEO_TABS : TERMINAL_TABS

  return (
    <div className="flex flex-col h-screen bg-background text-foreground select-none overflow-hidden">
      {/* Titlebar */}
      <div className="flex items-center justify-between px-4 h-10 border-b border-border drag-region shrink-0 bg-card/50">
        <div className="flex items-center gap-2 no-drag">
          <span className="text-sm font-bold text-primary tracking-tight">LabGuard</span>
          <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">alpha</span>
        </div>

        <div className="flex items-center gap-2 no-drag">
          {(models.length > 0 || nimModels.length > 0 || claudeModels.length > 0) && (
            <ModelPill
              selectedModel={selectedModel}
              models={models}
              nimModels={nimModels}
              claudeModels={claudeModels}
              onSelect={setSelectedModel}
            />
          )}

          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setNewRunOpen(true)}>
            <Plus size={13} /> New Run
          </Button>

          {activeExperiment?.status === 'running' && (
            <Button size="sm" variant="destructive" className="h-7 text-xs gap-1.5" onClick={stopExperiment}>
              <Square size={11} /> Stop
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 min-h-0">
        <Sidebar
          onNewRun={() => setNewRunOpen(true)}
          onRestartRun={async (exp) => {
            if (!exp.command || exp.command.startsWith('pipe:')) return
            const result = await window.api.lab.spawn(exp.command, exp.workDir || '.')
            const next = {
              id: result.id,
              name: exp.name,
              command: exp.command,
              workDir: exp.workDir || '.',
              status: 'running' as const,
              pid: result.pid,
              startedAt: Date.now()
            }
            const state = useStore.getState()
            state.addExperiment(next)
            state.setActiveExperiment(result.id)
            state.setActiveTab('terminal')
            state.setActiveSection('runs')
          }}
          onDeleteRun={async (exp) => {
            // If this is a spawned running process, stop it first, then remove from UI/state.
            if (exp.status === 'running' && !exp.command.startsWith('pipe:') && !exp.command.startsWith('video:')) {
              try {
                await window.api.lab.stop(exp.id)
              } catch {
                // Ignore stop errors; still allow deleting the run entry.
              }
            }
            deleteExperiment(exp.id)
          }}
        />

        <div className="flex flex-col flex-1 min-w-0">
          {activeSection === 'settings' ? (
            <>
              <div className="flex items-center justify-end px-4 py-2 border-b border-border bg-card/20 shrink-0">
                <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setNewRunOpen(true)}>
                  <Plus size={13} /> New Run
                </Button>
              </div>
              <ModelsView />
            </>
          ) : activeExperiment ? (
            <>
              {/* Experiment header + tabs */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-card/20">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn(
                    'h-2 w-2 rounded-full shrink-0',
                    activeExperiment.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'
                  )} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{activeExperiment.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{activeExperiment.command}</p>
                  </div>
                </div>

                <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-0.5 shrink-0">
                  {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1 rounded-md text-xs transition-colors',
                        activeTab === id
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon size={12} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-h-0">
                {activeTab === 'terminal' && <TerminalView experimentId={activeExperiment.id} />}
                {activeTab === 'metrics' && <MetricsPanel experimentId={activeExperiment.id} />}
                {activeTab === 'watchdog' && <WatchdogFeed experimentId={activeExperiment.id} />}
                {activeTab === 'actions' && <ActionsPanel />}
                {activeTab === 'chat' && <RunChat experimentId={activeExperiment.id} />}
                {activeTab === 'video' && <VideoMonitor experimentId={activeExperiment.id} />}
              </div>
            </>
          ) : (
            <EmptyState onNewRun={() => setNewRunOpen(true)} />
          )}
        </div>
      </div>

      <NewRunDialog open={newRunOpen} onClose={() => setNewRunOpen(false)} />
    </div>
  )
}

function EmptyState({ onNewRun }: { onNewRun: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
      <div className="h-12 w-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-4">
        <Zap size={22} className="text-primary" />
      </div>
      <p className="text-base font-semibold text-foreground mb-1">No experiment running</p>
      <p className="text-sm mb-4 max-w-xs">
        Launch a training command to start live monitoring with metrics parsing and LLM watchdog analysis.
      </p>
      <Button onClick={onNewRun} className="gap-1.5">
        <Plus size={14} /> New Run
      </Button>
    </div>
  )
}

function ModelPill({ selectedModel, models, nimModels, claudeModels, onSelect }: {
  selectedModel: string | null
  models: { name: string }[]
  nimModels: string[]
  claudeModels: string[]
  onSelect: (m: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-xs hover:bg-accent transition-colors"
      >
        <span className="text-muted-foreground">Watchdog:</span>
        <span className="max-w-[140px] truncate">{selectedModel ?? 'select model'}</span>
        <ChevronDown size={11} className="text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
          {models.length > 0 && models.map((m) => (
            <button
              key={m.name}
              onClick={() => { onSelect(m.name); setOpen(false) }}
              className={cn(
                'w-full px-3 py-2 text-xs text-left hover:bg-accent transition-colors',
                selectedModel === m.name && 'text-primary'
              )}
            >
              {m.name}
            </button>
          ))}
          {models.length > 0 && (nimModels.length > 0 || claudeModels.length > 0) && <div className="border-t border-border my-1" />}
          {nimModels.map((name) => (
            <button
              key={name}
              onClick={() => { onSelect(name); setOpen(false) }}
              className={cn(
                'w-full px-3 py-2 text-xs text-left hover:bg-accent transition-colors flex items-center gap-1.5',
                selectedModel === name && 'text-sky-400'
              )}
            >
              <Cloud size={11} className="shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          ))}
          {nimModels.length > 0 && claudeModels.length > 0 && <div className="border-t border-border my-1" />}
          {claudeModels.map((name) => (
            <button
              key={name}
              onClick={() => { onSelect(name); setOpen(false) }}
              className={cn(
                'w-full px-3 py-2 text-xs text-left hover:bg-accent transition-colors flex items-center gap-1.5',
                selectedModel === name && 'text-amber-400'
              )}
            >
              <Cloud size={11} className="shrink-0" />
              <span className="truncate">{name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
