import { useRef, useEffect } from 'react'
import { Plug, Check, FolderOpen } from 'lucide-react'
import { useStore } from '@/store'
import { cn } from '@/lib/utils'

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  gmail: (
    <svg viewBox="0 0 48 48" className="h-4 w-4">
      <path fill="#4285F4" d="M6 10.5v27l10.5-10.5z" />
      <path fill="#34A853" d="M42 10.5v27L31.5 27z" />
      <path fill="#FBBC05" d="M6 10.5l18 13.5 18-13.5H6z" />
      <path fill="#EA4335" d="M6 37.5l10.5-10.5 7.5 5.625 7.5-5.625L42 37.5H6z" />
    </svg>
  ),
  filesystem: <FolderOpen size={15} className="text-amber-400" />
}

interface Props {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
}

export function ToolPicker({ open, onClose, anchorRef }: Props) {
  const { connections, activePlatforms, togglePlatform } = useStore()
  const panelRef = useRef<HTMLDivElement>(null)

  const connected = connections.filter(c => c.connected)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose()
    }
    if (open) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose, anchorRef])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="absolute bottom-full mb-2 left-0 w-64 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden"
    >
      <div className="px-3 py-2 border-b border-border">
        <p className="text-xs font-semibold text-foreground">Add tools to this chat</p>
        <p className="text-xs text-muted-foreground mt-0.5">Model will have access to selected services</p>
      </div>

      {connected.length === 0 ? (
        <div className="px-3 py-4 text-center">
          <p className="text-xs text-muted-foreground">No services connected yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Go to Connections to set one up.</p>
        </div>
      ) : (
        <div className="p-1.5 space-y-0.5">
          {connected.map(conn => {
            const active = activePlatforms.includes(conn.id)
            return (
              <button
                key={conn.id}
                onClick={() => togglePlatform(conn.id)}
                className={cn(
                  'w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'hover:bg-accent text-foreground'
                )}
              >
                <div className="flex items-center gap-2.5">
                  {SERVICE_ICONS[conn.id] ?? <Plug size={14} />}
                  <span className="font-medium">{conn.label}</span>
                </div>
                <div className={cn(
                  'h-4 w-4 rounded border flex items-center justify-center transition-colors',
                  active ? 'bg-primary border-primary' : 'border-border'
                )}>
                  {active && <Check size={10} className="text-primary-foreground" strokeWidth={3} />}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
