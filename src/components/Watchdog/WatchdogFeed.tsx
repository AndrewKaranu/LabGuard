import { useStore, WatchdogEvent } from '@/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { CheckCircle, XCircle, AlertTriangle, Info, Zap } from 'lucide-react'

interface Props {
  experimentId: string
}

const EMPTY_EVENTS: never[] = []

export function WatchdogFeed({ experimentId }: Props) {
  // Selector returns the raw array — reverse in render, not in selector
  const rawEvents = useStore((s) => s.watchdogEvents[experimentId] ?? EMPTY_EVENTS)
  const events = [...rawEvents].reverse()
  const updateWatchdogEvent = useStore((s) => s.updateWatchdogEvent)
  const registeredActions = useStore((s) => s.registeredActions)

  async function approve(event: WatchdogEvent) {
    if (!event.decision.action) return
    updateWatchdogEvent(experimentId, event.id, { status: 'approved' })
    try {
      const result = await window.api.lab.callAction(
        event.decision.action,
        event.decision.args ?? {}
      )
      updateWatchdogEvent(experimentId, event.id, {
        status: result.success ? 'executed' : 'failed',
        output: result.output
      })
    } catch (err) {
      updateWatchdogEvent(experimentId, event.id, { status: 'failed', output: String(err) })
    }
  }

  function reject(event: WatchdogEvent) {
    updateWatchdogEvent(experimentId, event.id, { status: 'rejected' })
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-8">
        <Zap size={28} className="mb-3 text-muted-foreground/50" />
        <p className="text-sm font-medium text-foreground mb-1">Watchdog standing by</p>
        <p className="text-xs max-w-xs">
          The LLM will analyze your training output every 20s and surface anomalies or suggest safe actions.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full p-4 space-y-3">
      {events.map((event) => (
        <WatchdogCard
          key={event.id}
          event={event}
          onApprove={() => approve(event)}
          onReject={() => reject(event)}
          hasAction={!!event.decision.action && registeredActions.some((a) => a.name === event.decision.action)}
        />
      ))}
    </div>
  )
}

function WatchdogCard({
  event, onApprove, onReject, hasAction
}: {
  event: WatchdogEvent
  onApprove: () => void
  onReject: () => void
  hasAction: boolean
}) {
  const time = new Date(event.timestamp).toLocaleTimeString()
  const { decision, status } = event

  const statusConfig = {
    analysis: { icon: <Info size={13} />, color: 'text-sky-400', label: 'Analysis' },
    pending_approval: { icon: <AlertTriangle size={13} />, color: 'text-amber-400', label: 'Action suggested' },
    approved: { icon: <Spinner className="h-3 w-3" />, color: 'text-emerald-400', label: 'Executing…' },
    rejected: { icon: <XCircle size={13} />, color: 'text-muted-foreground', label: 'Rejected' },
    executed: { icon: <CheckCircle size={13} />, color: 'text-emerald-400', label: 'Executed' },
    failed: { icon: <XCircle size={13} />, color: 'text-red-400', label: 'Failed' }
  }

  const cfg = statusConfig[status]

  return (
    <div className={cn(
      'rounded-lg border p-3 space-y-2',
      status === 'pending_approval' ? 'border-amber-400/30 bg-amber-400/5' : 'border-border bg-card'
    )}>
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1.5 text-xs font-medium', cfg.color)}>
          {cfg.icon} {cfg.label}
        </div>
        <span className="text-[10px] text-muted-foreground">{time}</span>
      </div>

      <p className="text-xs text-foreground/90 leading-relaxed">{decision.reason}</p>

      {decision.action && (
        <div className="flex items-center gap-2 text-xs">
          <code className="bg-muted px-1.5 py-0.5 rounded text-primary font-mono">
            {decision.action}({Object.entries(decision.args ?? {}).map(([k, v]) => `${k}=${v}`).join(', ')})
          </code>
        </div>
      )}

      {status === 'pending_approval' && hasAction && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" className="h-7 text-xs gap-1.5" onClick={onApprove}>
            <CheckCircle size={12} /> Approve
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onReject}>
            Reject
          </Button>
        </div>
      )}

      {event.output && (
        <div className={cn(
          'text-xs font-mono rounded px-2 py-1.5 mt-1',
          status === 'failed' ? 'bg-red-400/10 text-red-300' : 'bg-muted text-muted-foreground'
        )}>
          {event.output}
        </div>
      )}
    </div>
  )
}
