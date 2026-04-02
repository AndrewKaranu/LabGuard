import { useStore, Experiment } from '@/store'
import { cn } from '@/lib/utils'
import { Activity, Square, Clock, CheckCircle, XCircle, FlaskConical, Settings2, RotateCcw, Trash2, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Sidebar({
  onNewRun,
  onRestartRun,
  onDeleteRun
}: {
  onNewRun: () => void
  onRestartRun: (exp: Experiment) => void
  onDeleteRun: (exp: Experiment) => void
}) {
  const { experiments, activeExperimentId, setActiveExperiment, activeSection, setActiveSection } = useStore()

  return (
    <div className="flex flex-col h-full border-r border-border w-52 shrink-0 bg-card/30">
      <div className="px-2 py-2 border-b border-border space-y-1">
        <button
          onClick={() => setActiveSection('runs')}
          className={cn(
            'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors',
            activeSection === 'runs'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
          )}
        >
          <FlaskConical size={13} /> Runs
        </button>
        <button
          onClick={() => setActiveSection('settings')}
          className={cn(
            'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors',
            activeSection === 'settings'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent/60'
          )}
        >
          <Settings2 size={13} /> Model Settings
        </button>
      </div>

      <div className="px-3 pt-2 pb-1 border-b border-border">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Runs</p>
          <Button size="sm" className="h-6 px-2 text-[10px]" onClick={onNewRun}>New Run</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {experiments.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">No runs yet. Click + New Run.</p>
        ) : (
          experiments.slice().reverse().map((exp) => (
            <ExperimentItem
              key={exp.id}
              experiment={exp}
              isActive={exp.id === activeExperimentId}
              onClick={() => setActiveExperiment(exp.id)}
              onRestart={() => onRestartRun(exp)}
              onDelete={() => onDeleteRun(exp)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function ExperimentItem({
  experiment, isActive, onClick, onRestart, onDelete
}: {
  experiment: Experiment
  isActive: boolean
  onClick: () => void
  onRestart: () => void
  onDelete: () => void
}) {
  const { status, name, startedAt } = experiment

  const isVideo = !!experiment.sourceType
  const statusIcon = isVideo && status === 'running'
    ? <Video size={11} className="text-violet-400 animate-pulse" />
    : {
      running: <Activity size={11} className="text-emerald-400 animate-pulse" />,
      stopped: <Square size={11} className="text-muted-foreground" />,
      completed: <CheckCircle size={11} className="text-sky-400" />,
      error: <XCircle size={11} className="text-red-400" />
    }[status]

  const elapsed = experiment.stoppedAt
    ? formatDuration(experiment.stoppedAt - startedAt)
    : formatDuration(Date.now() - startedAt)

  const canRestart = status !== 'running' && !experiment.command.startsWith('pipe:') && !experiment.command.startsWith('video:') && !experiment.sources?.length

  return (
    <div
      className={cn(
        'w-full flex items-start gap-2 px-3 py-2.5 text-left transition-colors hover:bg-accent',
        isActive && 'bg-accent border-r-2 border-primary'
      )}
    >
      <button onClick={onClick} className="flex items-start gap-2 text-left flex-1 min-w-0">
        <div className="mt-0.5 shrink-0">{statusIcon}</div>
        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-xs font-medium truncate',
            isActive ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {name}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock size={9} className="text-muted-foreground/60 shrink-0" />
            <span className="text-[10px] text-muted-foreground/70">{elapsed}</span>
          </div>
        </div>
      </button>

      {canRestart && (
        <button
          onClick={onRestart}
          title="Restart run"
          className="shrink-0 mt-0.5 p-1 rounded hover:bg-background/60 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw size={11} />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        title={status === 'running' ? 'Stop and delete run' : 'Delete run'}
        className="shrink-0 mt-0.5 p-1 rounded hover:bg-background/60 text-muted-foreground hover:text-red-400"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
