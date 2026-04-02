import { useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'

interface Props {
  experimentId: string
}

// Strip ANSI escape codes for display (basic version)
function stripAnsi(str: string): string {
  return str.replace(/\x1B\[[0-9;]*[mGKHFABCDJlh]/g, '')
            .replace(/\x1B\][^\x07]*\x07/g, '')
            .replace(/\x1B[()][AB012]/g, '')
}

// Stable fallbacks — never create new references inside selectors
const EMPTY_LINES: never[] = []

export function TerminalView({ experimentId }: Props) {
  const lines = useStore((s) => s.terminalLines[experimentId] ?? EMPTY_LINES)
  const experiment = useStore((s) => s.experiments.find((e) => e.id === experimentId))
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' })
    }
  }, [lines])

  function handleScroll() {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    autoScrollRef.current = atBottom
  }

  if (!experiment) return null

  return (
    <div className="flex flex-col h-full">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs leading-5"
        style={{ background: '#0a0d14' }}
      >
        {lines.length === 0 ? (
          <span className="text-muted-foreground">Waiting for output…</span>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                'whitespace-pre-wrap break-all',
                line.stream === 'stderr' ? 'text-red-400/90' : 'text-green-300/90'
              )}
            >
              {stripAnsi(line.text)}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/50 text-[10px] text-muted-foreground shrink-0">
        <span>{lines.length} lines</span>
        <span className={cn(
          'flex items-center gap-1',
          experiment.status === 'running' ? 'text-emerald-400' : 'text-muted-foreground'
        )}>
          <span className={cn(
            'h-1.5 w-1.5 rounded-full',
            experiment.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'
          )} />
          {experiment.status}
          {experiment.exitCode != null && experiment.status !== 'running' && ` (exit ${experiment.exitCode})`}
        </span>
      </div>
    </div>
  )
}
