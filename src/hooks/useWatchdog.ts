import { useEffect, useRef } from 'react'
import { useStore } from '@/store'

const CONTEXT_LINES = 40

function buildWatchdogPrompt(
  recentLines: string[],
  metrics: Record<string, { value: number; step: number }[]>,
  actions: { name: string; description: string; params: Record<string, string | null> }[]
): string {
  const metricsStr = Object.entries(metrics)
    .map(([k, pts]) => {
      const latest = pts[pts.length - 1]
      const prev = pts[pts.length - 3]
      const trend = prev
        ? latest.value < prev.value ? '↓' : latest.value > prev.value ? '↑' : '→'
        : ''
      return `  ${k}: ${latest.value.toFixed(4)} ${trend}`
    })
    .join('\n') || '  (no metrics parsed yet)'

  const actionsStr = actions.length > 0
    ? actions.map((a) => `  - ${a.name}(${Object.keys(a.params).join(', ')}): ${a.description}`).join('\n')
    : '  (no actions registered)'

  return `You are a watchdog agent for an ML training run.

Recent terminal output (last ${CONTEXT_LINES} lines):
\`\`\`
${recentLines.slice(-CONTEXT_LINES).join('\n')}
\`\`\`

Current parsed metrics:
${metricsStr}

Registered safe actions:
${actionsStr}

Analyze the training run. Watch for: NaN loss, exploding gradients, loss plateau, OOM errors, crashes.

Respond ONLY with valid JSON (no other text):
- If action needed: {"action": "<name>", "args": {}, "reason": "<explanation>"}
- If no action needed: {"action": null, "reason": "<brief status summary>"}

JSON response:`
}

export function useWatchdog(experimentId: string | null) {
  // Only subscribe to the values that determine whether/how often to run
  // — NOT to terminalLines or metrics, which change on every output line
  const selectedModel = useStore((s) => s.selectedModel)
  const watchdogEnabled = useStore((s) => s.watchdogEnabled)
  const watchdogIntervalSecs = useStore((s) => s.watchdogIntervalSecs)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runningRef = useRef(false)

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (!experimentId || !watchdogEnabled || !selectedModel) return

    // Check experiment is running right now (fresh state, no closure capture)
    const initial = useStore.getState()
    const initExp = initial.experiments.find((e) => e.id === experimentId)
    if (initExp?.status !== 'running') return
    // Video/multi-source runs do their own analysis loop in VideoMonitor
    if (initExp.sources?.length || initExp.sourceType) return

    function schedule() {
      timerRef.current = setTimeout(async () => {
        // Always read fresh state inside the timer — never use stale closure values
        const state = useStore.getState()
        const exp = state.experiments.find((e) => e.id === experimentId)
        if (exp?.status !== 'running' || !state.watchdogEnabled) return

        if (!runningRef.current) {
          runningRef.current = true
          try {
            await runAnalysis(experimentId!, state.selectedModel!)
          } finally {
            runningRef.current = false
          }
        }

        // Reschedule using current interval
        const current = useStore.getState()
        const stillRunning = current.experiments.find((e) => e.id === experimentId)?.status === 'running'
        if (stillRunning && current.watchdogEnabled) {
          schedule()
        }
      }, watchdogIntervalSecs * 1000)
    }

    schedule()

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [experimentId, watchdogEnabled, selectedModel, watchdogIntervalSecs])
}

async function runAnalysis(experimentId: string, model: string) {
  // Read ALL state fresh here — never stale
  const state = useStore.getState()
  const { addWatchdogEvent, updateWatchdogEvent } = state

  const lines = (state.terminalLines[experimentId] ?? []).map((l) => l.text)
  if (lines.length < 5) return

  const expMetrics = state.metrics[experimentId] ?? {}
  const prompt = buildWatchdogPrompt(lines, expMetrics, state.registeredActions)

  const eventId = crypto.randomUUID()
  addWatchdogEvent(experimentId, {
    id: eventId,
    timestamp: Date.now(),
    decision: { action: null, reason: 'Analyzing…' },
    status: 'analysis'
  })

  try {
    const isNimModel = state.nimModels.includes(model)
    const isClaudeModel = state.claudeModels.includes(model)
    const response = isNimModel
      ? await window.api.nim.complete({ model, messages: [{ role: 'user', content: prompt }] })
      : isClaudeModel
        ? await window.api.claude.complete({ model, messages: [{ role: 'user', content: prompt }] })
        : await window.api.ollama.complete({ model, messages: [{ role: 'user', content: prompt }] })

    if ('error' in response && response.error) {
      updateWatchdogEvent(experimentId, eventId, {
        decision: { action: null, reason: `Watchdog model error: ${response.error}` },
        status: 'failed'
      })
      return
    }

    const content = (response.message?.content ?? '').trim()
    if (!content) {
      updateWatchdogEvent(experimentId, eventId, {
        decision: { action: null, reason: 'Watchdog model returned an empty response' },
        status: 'failed'
      })
      return
    }
    let parsed: { action: string | null; reason: string; args?: Record<string, unknown> } | null = null

    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]) } catch { /* ignore */ }
    }

    if (!parsed) {
      updateWatchdogEvent(experimentId, eventId, {
        decision: { action: null, reason: content.slice(0, 300) },
        status: 'analysis'
      })
      return
    }

    // Re-read state to get latest registered actions
    const latest = useStore.getState()
    const actionExists = parsed.action && latest.registeredActions.some((a) => a.name === parsed!.action)

    const nextStatus = actionExists ? 'pending_approval' : 'analysis'

    updateWatchdogEvent(experimentId, eventId, {
      decision: parsed,
      status: nextStatus
    })

    if (nextStatus === 'pending_approval') {
      void window.api.notify.sendAlert({
        subject: 'LabGuard Alert: Action Suggested',
        text: [
          `Run: ${experimentId}`,
          `Action: ${parsed.action}`,
          `Reason: ${parsed.reason}`,
          `Args: ${JSON.stringify(parsed.args ?? {})}`
        ].join('\n')
      })
    }
  } catch (err) {
    updateWatchdogEvent(experimentId, eventId, {
      decision: { action: null, reason: 'Watchdog error: ' + String(err) },
      status: 'failed'
    })

    void window.api.notify.sendAlert({
      subject: 'LabGuard Alert: Watchdog Failed',
      text: `Run: ${experimentId}\nError: ${String(err)}`
    })
  }
}
