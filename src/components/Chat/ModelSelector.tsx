import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Bot, Cloud } from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'

export function ModelSelector() {
  const { models, selectedModel, setSelectedModel, nimModels, claudeModels } = useStore()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const hasAny = models.length > 0 || nimModels.length > 0 || claudeModels.length > 0

  return (
    <div ref={ref} className="relative no-drag">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-colors',
          'border border-border hover:border-primary/50 hover:bg-accent',
          open && 'border-primary/50 bg-accent'
        )}
      >
        {selectedModel && (nimModels.includes(selectedModel) || claudeModels.includes(selectedModel))
          ? <Cloud size={14} className="text-sky-400" />
          : <Bot size={14} className="text-primary" />
        }
        <span className="text-foreground max-w-[180px] truncate">{selectedModel ?? 'Select model'}</span>
        <ChevronDown size={14} className={cn('text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-card border border-border rounded-lg shadow-xl z-50 py-1 overflow-hidden">
          {!hasAny && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No models available</p>
          )}

          {models.length > 0 && (
            <>
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Local · Ollama
              </p>
              {models.map((m) => (
                <button
                  key={m.name}
                  onClick={() => { setSelectedModel(m.name); setOpen(false) }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                    selectedModel === m.name && 'text-primary'
                  )}
                >
                  <span className="truncate">{m.name}</span>
                  {selectedModel === m.name && <span className="text-xs text-primary ml-2">active</span>}
                </button>
              ))}
            </>
          )}

          {nimModels.length > 0 && (
            <>
              {models.length > 0 && <div className="border-t border-border my-1" />}
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-400/70">
                Cloud · NVIDIA NIM
              </p>
              {nimModels.map((name) => (
                <button
                  key={name}
                  onClick={() => { setSelectedModel(name); setOpen(false) }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                    selectedModel === name && 'text-sky-400'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Cloud size={12} className="text-sky-400/60 shrink-0" />
                    <span className="truncate font-mono text-xs">{name}</span>
                  </div>
                  {selectedModel === name && <span className="text-xs text-sky-400 ml-2">active</span>}
                </button>
              ))}
            </>
          )}

          {claudeModels.length > 0 && (
            <>
              {(models.length > 0 || nimModels.length > 0) && <div className="border-t border-border my-1" />}
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                Cloud · Claude
              </p>
              {claudeModels.map((name) => (
                <button
                  key={name}
                  onClick={() => { setSelectedModel(name); setOpen(false) }}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors text-left',
                    selectedModel === name && 'text-amber-400'
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Cloud size={12} className="text-amber-400/70 shrink-0" />
                    <span className="truncate font-mono text-xs">{name}</span>
                  </div>
                  {selectedModel === name && <span className="text-xs text-amber-400 ml-2">active</span>}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}
