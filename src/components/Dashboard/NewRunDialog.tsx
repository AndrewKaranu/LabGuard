import { useState } from 'react'
import { Dialog, DialogHeader, DialogBody } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStore, VideoSource } from '@/store'
import { Play, GitBranch, Copy, Check, Video, Camera, Monitor, Upload, Terminal, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
}

type Mode = 'launch' | 'attach' | 'video'
type VideoSourceType = 'webcam' | 'screencapture' | 'mp4' | 'terminal'

interface PendingSource {
  id: string
  type: VideoSourceType
  mp4File?: File
  linkedExperimentId?: string
}

const SOURCE_OPTIONS: { id: VideoSourceType; label: string; icon: React.ElementType }[] = [
  { id: 'webcam', label: 'Webcam', icon: Camera },
  { id: 'screencapture', label: 'Screen', icon: Monitor },
  { id: 'mp4', label: 'MP4 file', icon: Upload },
  { id: 'terminal', label: 'Terminal run', icon: Terminal }
]

export function NewRunDialog({ open, onClose }: Props) {
  const { addExperiment, setActiveExperiment, setActiveTab, claudeModels, nimModels, experiments } = useStore()

  const [mode, setMode] = useState<Mode>('launch')

  // Terminal/pipe state
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [workDir, setWorkDir] = useState('')
  const [launching, setLaunching] = useState(false)
  const [copied, setCopied] = useState(false)
  const [baseCommand, setBaseCommand] = useState('python train.py')

  // Video state
  const [videoName, setVideoName] = useState('')
  const [instructions, setInstructions] = useState('')
  const [sources, setSources] = useState<PendingSource[]>([{ id: crypto.randomUUID(), type: 'webcam' }])

  const hasCloudModel = claudeModels.length > 0 || nimModels.length > 0
  const terminalExperiments = experiments.filter((e) => !e.sources && !e.sourceType)

  // ── Terminal launch ──────────────────────────────────────────────────────

  async function launch() {
    const cmd = command.trim()
    if (!cmd) return
    setLaunching(true)
    const result = await window.api.lab.spawn(cmd, workDir.trim() || '.')
    const expName = name.trim() || cmd.split(' ')[0].split('/').pop() || 'run'
    addExperiment({
      id: result.id, name: expName, command: cmd,
      workDir: workDir.trim() || '.', status: 'running',
      pid: result.pid, startedAt: Date.now()
    })
    setActiveExperiment(result.id)
    setActiveTab('terminal')
    setLaunching(false)
    reset(); onClose()
  }

  // ── Video launch ─────────────────────────────────────────────────────────

  function startVideoRun() {
    const id = crypto.randomUUID()
    const firstMp4 = sources.find((s) => s.type === 'mp4')
    const expName = videoName.trim() || (firstMp4 ? firstMp4.mp4File?.name ?? 'Video monitor' : 'Video monitor')

    // Store blob URLs in sessionStorage before creating experiment
    for (const src of sources) {
      if (src.type === 'mp4' && src.mp4File) {
        sessionStorage.setItem(`video-blob:${id}:${src.id}`, URL.createObjectURL(src.mp4File))
      }
    }

    const videoSources: VideoSource[] = sources.map((s) => ({
      id: s.id,
      type: s.type,
      videoFileName: s.mp4File?.name,
      linkedExperimentId: s.linkedExperimentId
    }))

    addExperiment({
      id, name: expName, command: `video:multi`, workDir: '.',
      status: 'running', startedAt: Date.now(),
      sources: videoSources,
      monitoringInstructions: instructions.trim() || undefined
    })

    setActiveExperiment(id)
    setActiveTab('video' as never)
    reset(); onClose()
  }

  function reset() {
    setName(''); setCommand(''); setWorkDir('')
    setVideoName(''); setInstructions('')
    setSources([{ id: crypto.randomUUID(), type: 'webcam' }])
  }

  // ── Source management ────────────────────────────────────────────────────

  function addSource() {
    setSources((prev) => [...prev, { id: crypto.randomUUID(), type: 'webcam' }])
  }

  function removeSource(id: string) {
    setSources((prev) => prev.filter((s) => s.id !== id))
  }

  function updateSource(id: string, patch: Partial<PendingSource>) {
    setSources((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s))
  }

  // Validation
  const sourcesValid = sources.length > 0 &&
    sources.every((s) =>
      (s.type !== 'mp4' || !!s.mp4File) &&
      (s.type !== 'terminal' || !!s.linkedExperimentId)
    )

  // ── Pipe attach helpers ───────────────────────────────────────────────────

  function quoteForCmd(value: string) {
    return `"${value.replace(/"/g, '\\"')}"`
  }

  function buildAttachCommand() {
    const runName = name.trim() || 'my-run'
    const base = baseCommand.trim() || 'python train.py'
    return `cmd /c "${base} 2>&1 | python -u .\\labguard_tail.py ${quoteForCmd(runName)}"`
  }

  function copyTailCommand() {
    navigator.clipboard.writeText(buildAttachCommand())
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const MODES = [
    { id: 'launch' as Mode, label: 'Launch', icon: Play },
    { id: 'attach' as Mode, label: 'Attach pipe', icon: GitBranch },
    { id: 'video' as Mode, label: 'Video source', icon: Video }
  ]

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader onClose={onClose}>
        <h2 className="text-base font-semibold">New experiment run</h2>
      </DialogHeader>
      <DialogBody>
        {/* Mode tabs */}
        <div className="flex gap-0.5 bg-muted/40 rounded-lg p-0.5 mb-5">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setMode(id)} className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors',
              mode === id ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            )}>
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        {/* ── Launch ── */}
        {mode === 'launch' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Run name <span className="font-normal">(optional)</span></label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. baseline-v1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Command <span className="text-red-400">*</span></label>
              <Input value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && launch()} placeholder="e.g. python train.py --epochs 50" className="font-mono text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Working directory <span className="font-normal">(optional)</span></label>
              <Input value={workDir} onChange={(e) => setWorkDir(e.target.value)} placeholder="Leave blank to use current directory" className="font-mono text-sm" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button size="sm" onClick={launch} disabled={!command.trim() || launching} className="gap-1.5">
                <Play size={13} /> {launching ? 'Launching…' : 'Launch'}
              </Button>
            </div>
          </div>
        )}

        {/* ── Attach ── */}
        {mode === 'attach' && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Pipe an existing script's output through <code className="bg-muted px-1 rounded">labguard_tail.py</code> — LabGuard attaches automatically.
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Run name <span className="font-normal">(optional)</span></label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. finetune-v2" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Base training command</label>
              <Input value={baseCommand} onChange={(e) => setBaseCommand(e.target.value)} placeholder="python train.py" className="font-mono text-sm" />
            </div>
            <div>
              <div className="relative bg-muted/60 rounded-lg px-3 py-2.5 font-mono text-xs text-foreground">
                {buildAttachCommand()}
                <button onClick={copyTailCommand} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent transition-colors">
                  {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} className="text-muted-foreground" />}
                </button>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-sky-400/5 border border-sky-400/20 rounded-lg px-3 py-2.5">
              <div className="h-1.5 w-1.5 rounded-full bg-sky-400 animate-pulse mt-1.5 shrink-0" />
              <p className="text-xs text-sky-300/90">Waiting for connection… run will appear in the sidebar automatically.</p>
            </div>
            <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div>
          </div>
        )}

        {/* ── Video ── */}
        {mode === 'video' && (
          <div className="space-y-4">
            {!hasCloudModel && (
              <div className="bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2.5">
                <p className="text-xs text-amber-300/90">Video analysis requires a cloud model (Claude or NIM). Add an API key in Model Settings first.</p>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Run name <span className="font-normal">(optional)</span></label>
              <Input value={videoName} onChange={(e) => setVideoName(e.target.value)} placeholder="e.g. Lab experiment #3" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Monitoring instructions <span className="text-red-400">*</span>
              </label>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Describe what to watch for across all sources. e.g. 'This is a titration on screen 1 and the training dashboard on screen 2. Alert if the solution turns pink or if val loss diverges from train loss.'"
                rows={3}
                className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Applied to all sources in each analysis cycle.</p>
            </div>

            {/* Sources */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">Sources <span className="text-red-400">*</span></label>
                {sources.length < 4 && (
                  <button onClick={addSource} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
                    <Plus size={11} /> Add source
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {sources.map((src, i) => (
                  <SourceCard
                    key={src.id}
                    source={src}
                    index={i}
                    canRemove={sources.length > 1}
                    terminalExperiments={terminalExperiments}
                    onChange={(patch) => updateSource(src.id, patch)}
                    onRemove={() => removeSource(src.id)}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                onClick={startVideoRun}
                disabled={!hasCloudModel || !instructions.trim() || !sourcesValid}
                className="gap-1.5"
              >
                <Video size={13} /> Start monitoring
              </Button>
            </div>
          </div>
        )}
      </DialogBody>
    </Dialog>
  )
}

function SourceCard({ source, index, canRemove, terminalExperiments, onChange, onRemove }: {
  source: PendingSource
  index: number
  canRemove: boolean
  terminalExperiments: { id: string; name: string }[]
  onChange: (patch: Partial<PendingSource>) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card/30 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Source {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Type picker */}
      <div className="grid grid-cols-4 gap-1">
        {SOURCE_OPTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onChange({ type: id, mp4File: undefined, linkedExperimentId: undefined })}
            className={cn(
              'flex flex-col items-center gap-1 py-2 rounded-md border text-[10px] transition-colors',
              source.type === id
                ? 'border-primary/60 bg-primary/5 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-border/60'
            )}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* MP4 file picker */}
      {source.type === 'mp4' && (
        <label className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed text-xs cursor-pointer transition-colors',
          source.mp4File ? 'border-primary/50 bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-border/60'
        )}>
          <Upload size={12} className="shrink-0" />
          <span className="truncate">{source.mp4File ? source.mp4File.name : 'Click to select an MP4…'}</span>
          <input type="file" accept="video/mp4,video/*" className="hidden" onChange={(e) => onChange({ mp4File: e.target.files?.[0] ?? undefined })} />
        </label>
      )}

      {/* Terminal run linker */}
      {source.type === 'terminal' && (
        terminalExperiments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No terminal runs available. Launch a command run first.</p>
        ) : (
          <select
            value={source.linkedExperimentId ?? ''}
            onChange={(e) => onChange({ linkedExperimentId: e.target.value || undefined })}
            className="w-full rounded-md border border-border bg-secondary px-2 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50"
          >
            <option value="">Select a run…</option>
            {terminalExperiments.map((exp) => (
              <option key={exp.id} value={exp.id}>{exp.name}</option>
            ))}
          </select>
        )
      )}
    </div>
  )
}
