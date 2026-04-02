import type { Experiment, TerminalLine, MetricPoint, WatchdogEvent } from '@/store'

/**
 * Builds a system prompt for chatting with a training run.
 * Includes run metadata, metric summaries, recent terminal output, and watchdog analysis.
 */
export function buildRunSystemPrompt(
  experiment: Experiment,
  terminalLines: TerminalLine[],
  metrics: Record<string, MetricPoint[]>,
  watchdogEvents: WatchdogEvent[]
): string {
  const parts: string[] = []

  // ── Run metadata ──────────────────────────────────────────────────────────
  const duration = experiment.stoppedAt
    ? formatDuration(experiment.stoppedAt - experiment.startedAt)
    : formatDuration(Date.now() - experiment.startedAt)

  parts.push(`You are an expert ML training assistant analyzing a training run.

## Run: ${experiment.name}
- **Command**: \`${experiment.command}\`
- **Status**: ${experiment.status}
- **Started**: ${new Date(experiment.startedAt).toLocaleString()}
${experiment.stoppedAt ? `- **Ended**: ${new Date(experiment.stoppedAt).toLocaleString()}` : ''}
- **Duration**: ${duration}
${experiment.exitCode != null ? `- **Exit code**: ${experiment.exitCode}` : ''}`)

  // ── Metrics summary ───────────────────────────────────────────────────────
  const metricNames = Object.keys(metrics)
  if (metricNames.length > 0) {
    const lines: string[] = ['## Metrics']
    for (const name of metricNames) {
      const series = metrics[name]
      if (!series.length) continue
      const values = series.map((p) => p.value)
      const last = values[values.length - 1]
      const min = Math.min(...values)
      const max = Math.max(...values)
      const trend = values.length >= 2
        ? (values[values.length - 1] > values[0] ? '↑' : values[values.length - 1] < values[0] ? '↓' : '→')
        : ''
      lines.push(`- **${name}**: latest=${last.toFixed(4)}, min=${min.toFixed(4)}, max=${max.toFixed(4)}, steps=${series.length} ${trend}`)
    }
    parts.push(lines.join('\n'))
  }

  // ── Watchdog analysis ─────────────────────────────────────────────────────
  if (watchdogEvents.length > 0) {
    const lines: string[] = ['## Watchdog Analysis']
    const recent = watchdogEvents.slice(-10)
    for (const event of recent) {
      const time = new Date(event.timestamp).toLocaleTimeString()
      lines.push(`- [${time}] **${event.decision.action ?? 'analysis'}**: ${event.decision.reason}${event.output ? ` → ${event.output}` : ''}`)
    }
    parts.push(lines.join('\n'))
  }

  // ── Recent terminal output ────────────────────────────────────────────────
  const recentLines = terminalLines.slice(-100)
  if (recentLines.length > 0) {
    const logText = recentLines.map((l) => l.text).join('\n')
    parts.push(`## Recent Terminal Output (last ${recentLines.length} lines)\n\`\`\`\n${logText}\n\`\`\``)
  }

  parts.push(`Answer questions about this training run based on the data above. Be concise and specific. If asked to diagnose issues, reference the actual log output and metrics.`)

  return parts.join('\n\n')
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}
