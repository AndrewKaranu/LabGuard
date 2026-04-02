import { useState, useRef, useEffect, useCallback } from 'react'
import { useStore, WatchdogEvent, VideoSource } from '@/store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Camera, Monitor, Upload, Terminal as TerminalIcon,
  AlertTriangle, CheckCircle, Clock, Square, Play,
  RefreshCw, Video
} from 'lucide-react'

const EMPTY_EVENTS: never[] = []
const EMPTY_LINES: never[] = []
const ANALYSIS_INTERVAL_MS = 30_000

interface Props { experimentId: string }

type SourceStatus = 'idle' | 'loading' | 'live' | 'error'

function getSourceIcon(type: VideoSource['type']) {
  return { webcam: Camera, screencapture: Monitor, mp4: Upload, terminal: TerminalIcon }[type]
}

export function VideoMonitor({ experimentId }: Props) {
  const experiment     = useStore((s) => s.experiments.find((e) => e.id === experimentId))
  const watchdogEvents = useStore((s) => s.watchdogEvents[experimentId] ?? EMPTY_EVENTS)
  const selectedModel  = useStore((s) => s.selectedModel)
  const claudeModels   = useStore((s) => s.claudeModels)
  const nimModels      = useStore((s) => s.nimModels)
  const terminalLines  = useStore((s) => s.terminalLines)
  const addWatchdogEvent    = useStore((s) => s.addWatchdogEvent)
  const updateWatchdogEvent = useStore((s) => s.updateWatchdogEvent)
  const updateExperiment    = useStore((s) => s.updateExperiment)

  const isClaudeModel = !!(selectedModel && claudeModels.includes(selectedModel))
  const isNimModel    = !!(selectedModel && nimModels.includes(selectedModel))
  const isCloudModel  = isClaudeModel || isNimModel

  // Normalize to sources array (handles legacy single-source runs)
  const sources: VideoSource[] = experiment?.sources ??
    (experiment?.sourceType ? [{
      id: 'legacy',
      type: experiment.sourceType,
      videoFileName: experiment.videoFileName
    }] : [])

  const videoSources   = sources.filter((s) => s.type !== 'terminal')
  const terminalSource = sources.find((s) => s.type === 'terminal')

  const [sourceStatuses, setSourceStatuses] = useState<Record<string, SourceStatus>>({})
  const [screenSources, setScreenSources]   = useState<ScreenSource[]>([])
  const [pickingFor, setPickingFor]         = useState<string | null>(null)
  const [errorMessages, setErrorMessages]   = useState<Record<string, string>>({})
  const [analyzing, setAnalyzing]           = useState(false)
  const [nextAnalysisIn, setNextAnalysisIn] = useState<number | null>(null)
  const [globalStarted, setGlobalStarted]   = useState(false)

  // Multi-source refs
  const videoRefsMap       = useRef<Map<string, HTMLVideoElement>>(new Map())
  const streamsMap         = useRef<Map<string, MediaStream>>(new Map())
  const canvasRef          = useRef<HTMLCanvasElement>(null)
  const intervalRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const isLiveRef          = useRef(false)
  // Keep a ref to source statuses so the interval closure never reads stale state
  const sourceStatusesRef  = useRef<Record<string, SourceStatus>>({})
  // Keep ref to latest runAnalysis so the interval always calls the current version
  const runAnalysisRef     = useRef<() => Promise<void>>(async () => {})

  useEffect(() => () => stopAll(), [])

  function setStatus(sourceId: string, status: SourceStatus) {
    // Update ref synchronously so interval callbacks always see the latest value
    sourceStatusesRef.current = { ...sourceStatusesRef.current, [sourceId]: status }
    setSourceStatuses((prev) => ({ ...prev, [sourceId]: status }))
  }

  function setError(sourceId: string, msg: string) {
    setErrorMessages((prev) => ({ ...prev, [sourceId]: msg }))
    setStatus(sourceId, 'error')
  }

  function stopAll() {
    isLiveRef.current = false
    if (intervalRef.current)  { clearInterval(intervalRef.current);  intervalRef.current  = null }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null }
    for (const stream of streamsMap.current.values()) {
      stream.getTracks().forEach((t) => t.stop())
    }
    streamsMap.current.clear()
    setNextAnalysisIn(null)
  }

  function handleStop() {
    stopAll()
    setGlobalStarted(false)
    updateExperiment(experimentId, { status: 'stopped', stoppedAt: Date.now() })
  }

  // ── Frame capture ──────────────────────────────────────────────────────────

  function captureFrame(sourceId: string): string | null {
    const video  = videoRefsMap.current.get(sourceId)
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return null

    canvas.width  = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.75).split(',')[1] ?? null
  }

  // ── Analysis ───────────────────────────────────────────────────────────────

  const runAnalysis = useCallback(async () => {
    if (!selectedModel || !isCloudModel || !experiment || analyzing) return

    // Build sources for the API call — read from ref so we never see stale state
    const apiSources: FrameAnalysisSource[] = []

    for (const src of videoSources) {
      if (sourceStatusesRef.current[src.id] !== 'live') continue
      const imageBase64 = captureFrame(src.id)
      if (!imageBase64) continue
      const label = src.label ?? (src.type === 'webcam' ? 'Webcam' : src.type === 'screencapture' ? 'Screen capture' : src.videoFileName ?? 'Video')
      apiSources.push({ label, imageBase64 })
    }

    if (terminalSource) {
      const lines = (terminalLines[terminalSource.linkedExperimentId ?? ''] ?? EMPTY_LINES)
        .slice(-50).map((l) => l.text).join('\n')
      if (lines) apiSources.push({ label: 'Terminal output', terminalText: lines })
    }

    if (apiSources.length === 0) return

    setAnalyzing(true)

    const prompt = `You are monitoring a multi-source experiment feed. The user's instructions are:
"${experiment.monitoringInstructions ?? 'Monitor these sources and alert on anything unusual.'}"

Each source is labeled above. Analyze all of them together.

Respond ONLY with valid JSON:
{"action": null | "alert" | "stop", "reason": "concise 1-2 sentence description of what you observe across all sources and any concerns"}

Use "alert" if something needs attention, "stop" if the experiment should halt immediately, null if everything looks normal.`

    const eventId = crypto.randomUUID()
    addWatchdogEvent(experimentId, {
      id: eventId, timestamp: Date.now(),
      decision: { action: null, reason: 'Analyzing frame…' },
      status: 'analysis'
    })

    try {
      const result = isClaudeModel
        ? await window.api.claude.analyzeFrame({ model: selectedModel, sources: apiSources, prompt })
        : await window.api.nim.analyzeFrame({ model: selectedModel, sources: apiSources, prompt })

      if (result.error) {
        updateWatchdogEvent(experimentId, eventId, {
          decision: { action: null, reason: `Analysis error: ${result.error}` },
          status: 'failed'
        })
      } else {
        const text   = result.analysis ?? ''
        let parsed: { action: string | null; reason: string } = { action: null, reason: text }
        try {
          const match = text.match(/\{[\s\S]*\}/)
          if (match) parsed = JSON.parse(match[0])
        } catch { /* use raw text */ }

        const action = parsed.action ?? null
        updateWatchdogEvent(experimentId, eventId, {
          decision: { action, reason: parsed.reason ?? text },
          status: action ? 'pending_approval' : 'analysis'
        })

        // Email alert on notable findings
        if (action === 'alert' || action === 'stop') {
          void window.api.notify.sendAlert({
            subject: `LabGuard Video Alert: ${action === 'stop' ? 'STOP Required' : 'Attention Needed'} — ${experiment.name}`,
            text: [
              `Run: ${experiment.name}`,
              `Action: ${action}`,
              `Reason: ${parsed.reason}`,
              `Sources: ${apiSources.map((s) => s.label).join(', ')}`,
              `Time: ${new Date().toLocaleString()}`
            ].join('\n')
          })
        }
      }
    } catch (err) {
      updateWatchdogEvent(experimentId, eventId, {
        decision: { action: null, reason: `Error: ${err instanceof Error ? err.message : String(err)}` },
        status: 'failed'
      })
    } finally {
      setAnalyzing(false)
    }
  }, [selectedModel, isCloudModel, experiment, analyzing, experimentId, videoSources, terminalSource, terminalLines])

  // Keep ref pointing to the latest runAnalysis so interval callbacks don't hold stale closures
  useEffect(() => { runAnalysisRef.current = runAnalysis }, [runAnalysis])

  function startAnalysisLoop() {
    isLiveRef.current = true
    void runAnalysisRef.current()
    setNextAnalysisIn(ANALYSIS_INTERVAL_MS / 1000)

    intervalRef.current = setInterval(() => {
      if (!isLiveRef.current) return
      void runAnalysisRef.current()
      setNextAnalysisIn(ANALYSIS_INTERVAL_MS / 1000)
    }, ANALYSIS_INTERVAL_MS)

    countdownRef.current = setInterval(() => {
      setNextAnalysisIn((n) => (n !== null && n > 0 ? n - 1 : null))
    }, 1000)
  }

  // ── Per-source start ────────────────────────────────────────────────────────

  async function startWebcam(sourceId: string) {
    setStatus(sourceId, 'loading')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      streamsMap.current.set(sourceId, stream)
      const video = videoRefsMap.current.get(sourceId)
      if (video) {
        video.muted = true
        video.srcObject = stream
        await video.play()
      }
      setStatus(sourceId, 'live')
    } catch (err) {
      setError(sourceId, err instanceof Error ? err.message : 'Failed to access webcam')
    }
  }

  async function startScreenCapture(sourceId: string, desktopSourceId: string) {
    setPickingFor(null)
    setStatus(sourceId, 'loading')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: desktopSourceId }
        } as MediaTrackConstraints
      })
      streamsMap.current.set(sourceId, stream)
      const video = videoRefsMap.current.get(sourceId)
      if (video) {
        video.muted = true
        video.srcObject = stream
        await video.play()
      }
      setStatus(sourceId, 'live')
    } catch (err) {
      setError(sourceId, err instanceof Error ? err.message : 'Failed to capture screen')
    }
  }

  async function startMp4(sourceId: string) {
    // Show live state FIRST so the video element is visible before we play
    setStatus(sourceId, 'live')

    await new Promise((r) => setTimeout(r, 50)) // allow DOM to update

    const video = videoRefsMap.current.get(sourceId)
    if (!video) { setError(sourceId, 'Video element not ready'); return }

    const blobUrl = sessionStorage.getItem(`video-blob:${experimentId}:${sourceId}`)
      ?? sessionStorage.getItem(`video-blob:${experimentId}`) // legacy single-source key

    if (!blobUrl) { setError(sourceId, 'MP4 file not found. Please create a new run.'); return }

    try {
      video.muted = true
      video.srcObject = null  // clear any previous stream
      video.src = blobUrl
      video.loop = false

      // Wait for browser to decode enough frames before playing
      await new Promise<void>((resolve, reject) => {
        const onReady = () => { video.removeEventListener('canplay', onReady); video.removeEventListener('error', onErr); resolve() }
        const onErr   = () => { video.removeEventListener('canplay', onReady); video.removeEventListener('error', onErr); reject(new Error('Video load failed')) }
        video.addEventListener('canplay', onReady)
        video.addEventListener('error', onErr)
        video.load()
      })

      video.onended = () => {
        stopAll()
        updateExperiment(experimentId, { status: 'completed', stoppedAt: Date.now() })
      }

      await video.play()
    } catch (err) {
      setError(sourceId, err instanceof Error ? err.message : 'Failed to play video')
    }
  }

  async function pickScreenSources(sourceId: string) {
    const srcs = await window.api.screen.getSources()
    setScreenSources(srcs)
    setPickingFor(sourceId)
  }

  // ── Start all sources ───────────────────────────────────────────────────────

  async function startAll() {
    setGlobalStarted(true)
    const startPromises = videoSources.map(async (src) => {
      if (src.type === 'webcam') return startWebcam(src.id)
      if (src.type === 'mp4') return startMp4(src.id)
      if (src.type === 'screencapture') return pickScreenSources(src.id)
    })
    await Promise.allSettled(startPromises)
    // Start analysis loop once at least one source is attempting to go live
    startAnalysisLoop()
  }

  const allLive      = videoSources.length > 0 && videoSources.every((s) => sourceStatuses[s.id] === 'live')
  const anyLive      = videoSources.some((s) => sourceStatuses[s.id] === 'live') || (terminalSource != null && globalStarted)
  const isEnded      = experiment?.status === 'stopped' || experiment?.status === 'completed'
  const recentEvents = [...watchdogEvents].reverse().slice(0, 30)

  // Grid layout for video sources
  const videoCount = videoSources.length
  const gridClass  = videoCount <= 1 ? 'grid-cols-1' : videoCount === 2 ? 'grid-cols-2' : 'grid-cols-2'

  return (
    <div className="flex h-full min-h-0">
      {/* Left: feeds */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 border-r border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/20 shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <Video size={14} />
            <span className="font-medium">{experiment?.name}</span>
            {anyLive && !isEnded && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {anyLive && !isEnded && nextAnalysisIn !== null && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock size={11} /> Next analysis in {nextAnalysisIn}s
              </span>
            )}
            {analyzing && (
              <span className="flex items-center gap-1 text-xs text-sky-400">
                <RefreshCw size={11} className="animate-spin" /> Analyzing…
              </span>
            )}
            {anyLive && !isEnded && (
              <Button size="sm" variant="destructive" className="h-7 text-xs gap-1" onClick={handleStop}>
                <Square size={10} /> Stop
              </Button>
            )}
            {!globalStarted && !isEnded && (
              <Button size="sm" className="h-7 text-xs gap-1" onClick={startAll} disabled={!isCloudModel}>
                <Play size={10} /> Start monitoring
              </Button>
            )}
          </div>
        </div>

        {/* Screen source picker overlay */}
        {pickingFor && (
          <div className="absolute inset-0 z-50 bg-background/95 flex flex-col p-4 overflow-y-auto">
            <p className="text-sm font-medium mb-3">Select a screen or window to capture</p>
            <div className="grid grid-cols-2 gap-2">
              {screenSources.map((src) => (
                <button
                  key={src.id}
                  onClick={() => startScreenCapture(pickingFor, src.id)}
                  className="flex flex-col gap-1.5 p-2 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-colors text-left"
                >
                  <img src={src.thumbnail} alt={src.name} className="w-full rounded aspect-video object-cover bg-muted" />
                  <span className="text-xs text-muted-foreground truncate">{src.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Video grid */}
        <div className={cn('flex-1 min-h-0 grid gap-px bg-border', gridClass)}>
          {videoSources.map((src) => {
            const status = sourceStatuses[src.id] ?? 'idle'
            const Icon = getSourceIcon(src.type)
            const label = src.label ?? (src.type === 'webcam' ? 'Webcam' : src.type === 'screencapture' ? 'Screen' : src.videoFileName ?? 'Video')

            return (
              <div key={src.id} className="relative bg-black flex items-center justify-center min-h-0">
                {/* Always render video element — hidden via visibility so browser can decode */}
                <video
                  ref={(el) => {
                    if (el) videoRefsMap.current.set(src.id, el)
                    else videoRefsMap.current.delete(src.id)
                  }}
                  className={cn(
                    'max-w-full max-h-full w-full h-full object-contain',
                    status !== 'live' && 'invisible absolute inset-0'
                  )}
                  muted playsInline
                />

                {/* Source label */}
                {status === 'live' && (
                  <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded px-1.5 py-0.5">
                    <Icon size={10} className="text-white/70" />
                    <span className="text-[10px] text-white/70">{label}</span>
                  </div>
                )}

                {/* Overlay for non-live states */}
                {status !== 'live' && (
                  <div className="flex flex-col items-center gap-2 text-center p-4">
                    {status === 'idle' && (
                      <>
                        <div className="h-10 w-10 rounded-xl bg-muted/20 border border-border flex items-center justify-center">
                          <Icon size={18} className="text-muted-foreground" />
                        </div>
                        <span className="text-xs text-muted-foreground">{label}</span>
                      </>
                    )}
                    {status === 'loading' && (
                      <>
                        <RefreshCw size={20} className="text-muted-foreground animate-spin" />
                        <span className="text-xs text-muted-foreground">Connecting…</span>
                      </>
                    )}
                    {status === 'error' && (
                      <>
                        <AlertTriangle size={20} className="text-red-400" />
                        <span className="text-xs text-red-400">{errorMessages[src.id]}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {/* Terminal source display */}
          {terminalSource && (
            <TerminalSourcePanel
              experimentId={terminalSource.linkedExperimentId}
              label={terminalSource.label ?? 'Terminal'}
            />
          )}
        </div>

        {/* No cloud model warning */}
        {!isCloudModel && !isEnded && (
          <div className="px-4 py-2 bg-amber-400/5 border-t border-amber-400/20 shrink-0">
            <p className="text-xs text-amber-300/90 text-center">Select a Claude or NIM model to enable analysis</p>
          </div>
        )}

        {isEnded && (
          <div className="px-4 py-2 border-t border-border bg-card/20 shrink-0 flex items-center justify-center gap-2">
            <CheckCircle size={13} className="text-sky-400" />
            <span className="text-xs text-muted-foreground">Monitoring ended — {experiment?.status}</span>
          </div>
        )}
      </div>

      {/* Right: analysis feed */}
      <div className="w-72 shrink-0 flex flex-col min-h-0">
        <div className="px-4 py-2 border-b border-border bg-card/20 shrink-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Analysis feed</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
          {recentEvents.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              Analysis results will appear here once monitoring starts.
            </p>
          )}
          {recentEvents.map((event) => (
            <AnalysisCard key={event.id} event={event} />
          ))}
        </div>
      </div>

      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}

function TerminalSourcePanel({ experimentId, label }: { experimentId?: string; label: string }) {
  const lines = useStore((s) => experimentId ? (s.terminalLines[experimentId] ?? []) : [])
  const recent = lines.slice(-30)

  return (
    <div className="relative bg-[#0a0e1a] flex flex-col min-h-0 overflow-hidden">
      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/60 rounded px-1.5 py-0.5 z-10">
        <TerminalIcon size={10} className="text-white/70" />
        <span className="text-[10px] text-white/70">{label}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pt-8 pb-2 font-mono text-[10px] text-emerald-400/80 space-y-0.5">
        {recent.map((l, i) => (
          <div key={i} className={l.stream === 'stderr' ? 'text-red-400/70' : ''}>{l.text}</div>
        ))}
        {recent.length === 0 && (
          <p className="text-muted-foreground mt-4 text-center">No terminal output yet</p>
        )}
      </div>
    </div>
  )
}

function AnalysisCard({ event }: { event: WatchdogEvent }) {
  const action = event.decision.action
  return (
    <div className={cn(
      'rounded-lg border px-3 py-2.5 text-xs',
      action === 'stop' ? 'border-red-400/30 bg-red-400/5' :
      action === 'alert' ? 'border-amber-400/30 bg-amber-400/5' :
      event.status === 'failed' ? 'border-border bg-muted/20' :
      'border-border bg-card/30'
    )}>
      <div className="flex items-center justify-between mb-1.5">
        <span className={cn(
          'font-medium',
          action === 'stop' ? 'text-red-400' : action === 'alert' ? 'text-amber-400' :
          event.status === 'failed' ? 'text-muted-foreground' : 'text-emerald-400'
        )}>
          {action === 'stop' ? 'STOP' : action === 'alert' ? 'Alert' : event.status === 'failed' ? 'Error' : 'Normal'}
        </span>
        <span className="text-muted-foreground">{new Date(event.timestamp).toLocaleTimeString()}</span>
      </div>
      <p className="text-muted-foreground leading-relaxed">{event.decision.reason}</p>
    </div>
  )
}
