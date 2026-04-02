import { useState } from 'react'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { Play, Wifi, Copy, Check, ChevronDown, ChevronRight, BookOpen } from 'lucide-react'

// ── Agent integration prompt ────────────────────────────────────────────────

const AGENT_PROMPT = `I want to add LabGuard monitoring to my training script.

LabGuard is a local ML experiment guardian that watches training output in real time and can call safe "action" functions I define during a run. To integrate it:

**Step 1 — Copy labguard_sdk.py into this project** (same directory as the training script).

**Step 2 — Add the import and connect() call** at the very top of the training script, before any training code:

\`\`\`python
from labguard_sdk import action, connect
connect()  # connects to LabGuard on localhost:7821
\`\`\`

**Step 3 — Decorate 3–5 safe, callable functions with @action**. Good candidates:
- Reducing the learning rate
- Saving a model checkpoint
- Gracefully stopping training (set a flag, let the loop finish cleanly)
- Switching the scheduler
- Adjusting gradient accumulation steps

**Rules for @action functions:**
- Must be safe to call mid-training without corrupting state
- Must have a docstring — it becomes the description shown in LabGuard
- Should have sensible default values for all parameters
- Should print a confirmation message so it appears in the terminal output
- Do NOT add @action to anything that deletes data, modifies the dataset, or requires restarting the process

**Example for a PyTorch training script:**

\`\`\`python
from labguard_sdk import action, connect
connect()

@action
def reduce_lr(factor: float = 0.5):
    """Reduce the learning rate by a factor"""
    for group in optimizer.param_groups:
        group['lr'] *= factor
    print(f"[LabGuard] LR reduced to {optimizer.param_groups[0]['lr']:.2e}", flush=True)

@action
def save_checkpoint():
    """Save the current model state to disk"""
    torch.save({
        'epoch': current_epoch,
        'model_state_dict': model.state_dict(),
        'optimizer_state_dict': optimizer.state_dict(),
    }, f'checkpoint_epoch{current_epoch}.pt')
    print(f"[LabGuard] Checkpoint saved at epoch {current_epoch}", flush=True)

@action
def stop_training():
    """Gracefully stop training after the current step"""
    global should_stop
    should_stop = True
    print("[LabGuard] Stop requested — will exit after this step", flush=True)
\`\`\`

Please add LabGuard integration to my training script following these rules. Make sure connect() is called before the training loop starts.`

// ── Component ───────────────────────────────────────────────────────────────

export function ActionsPanel() {
  const registeredActions = useStore((s) => s.registeredActions)
  const onlineCount = registeredActions.filter((a) => a.online).length
  const [calling, setCalling] = useState<Record<string, boolean>>({})
  const [results, setResults] = useState<Record<string, { success: boolean; output: string }>>({})
  const [guideCopied, setGuideCopied] = useState(false)
  const [guideOpen, setGuideOpen] = useState(registeredActions.length === 0)

  async function callAction(name: string) {
    setCalling((c) => ({ ...c, [name]: true }))
    const result = await window.api.lab.callAction(name, {})
    setCalling((c) => ({ ...c, [name]: false }))
    setResults((r) => ({ ...r, [name]: result }))
  }

  function copyGuide() {
    navigator.clipboard.writeText(AGENT_PROMPT)
    setGuideCopied(true)
    setTimeout(() => setGuideCopied(false), 2000)
  }

  return (
    <div className="overflow-y-auto h-full p-4 space-y-4">

      {/* Registered actions */}
      {registeredActions.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Wifi size={13} className="text-emerald-400" />
            <p className="text-xs text-muted-foreground">
              {onlineCount}/{registeredActions.length} action{registeredActions.length !== 1 ? 's' : ''} online
            </p>
          </div>

          {registeredActions.map((action) => {
            const result = results[action.name]
            const isCalling = calling[action.name]
            return (
              <div key={action.name} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-sm font-mono text-primary font-medium">{action.name}</code>
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] py-0 px-1.5',
                          action.online ? 'text-emerald-400 border-emerald-400/40' : 'text-muted-foreground'
                        )}
                      >
                        {action.online ? 'online' : 'offline'}
                      </Badge>
                      {Object.keys(action.params).length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {Object.entries(action.params).map(([k, v]) => (
                            <Badge key={k} variant="outline" className="text-[10px] py-0 px-1.5 font-mono">
                              {k}{v !== null ? `=${v}` : ''}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {action.description && (
                      <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0 h-8 text-xs"
                    onClick={() => callAction(action.name)}
                    disabled={isCalling || !action.online}
                  >
                    {isCalling ? <Spinner className="h-3 w-3" /> : <Play size={12} />}
                    {isCalling ? 'Running…' : action.online ? 'Run' : 'Offline'}
                  </Button>
                </div>
                {result && (
                  <div className={cn(
                    'mt-2 text-xs font-mono rounded px-2 py-1.5',
                    result.success ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'
                  )}>
                    {result.success ? '✓ ' : '✗ '}{result.output || (result.success ? 'Done' : 'Failed')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Agent integration guide — always available */}
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setGuideOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-card/60 hover:bg-accent transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <BookOpen size={13} className="text-primary" />
            <span className="text-xs font-medium">Agent integration guide</span>
            <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5">
              copy into Cursor / Copilot / Claude
            </span>
          </div>
          {guideOpen
            ? <ChevronDown size={13} className="text-muted-foreground" />
            : <ChevronRight size={13} className="text-muted-foreground" />
          }
        </button>

        {guideOpen && (
          <div className="border-t border-border">
            <div className="px-3 py-2.5 bg-muted/20">
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Paste this prompt into your AI coding assistant to automatically add LabGuard
                actions to any training script. Make sure <code className="bg-muted px-1 rounded">labguard_sdk.py</code> is
                in the project first.
              </p>

              <div className="relative">
                <pre className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap bg-muted/50 rounded-lg p-3 pr-10 font-mono overflow-x-auto max-h-64 overflow-y-auto">
                  {AGENT_PROMPT}
                </pre>
                <button
                  onClick={copyGuide}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-card border border-border hover:bg-accent transition-colors"
                  title="Copy prompt"
                >
                  {guideCopied
                    ? <Check size={13} className="text-emerald-400" />
                    : <Copy size={13} className="text-muted-foreground" />
                  }
                </button>
              </div>

              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs h-7" onClick={copyGuide}>
                  {guideCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  {guideCopied ? 'Copied!' : 'Copy prompt'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
