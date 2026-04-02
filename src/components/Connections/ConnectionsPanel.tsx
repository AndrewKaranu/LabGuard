import { useState, useEffect } from 'react'
import { Plus, Unplug, Zap, FolderOpen } from 'lucide-react'
import { useStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GmailSetupDialog } from './GmailSetupDialog'
import { FolderSetupDialog } from './FolderSetupDialog'

export function ConnectionsPanel() {
  const { connections, setConnectionStatus } = useStore()
  const [gmailDialogOpen, setGmailDialogOpen] = useState(false)
  const [folderDialogOpen, setFolderDialogOpen] = useState(false)

  useEffect(() => {
    // Sync Gmail status
    window.api.gmail.isConnected().then((connected: boolean) => {
      setConnectionStatus('gmail', connected)
    })
    // Sync filesystem status
    window.api.fs.getConnectedFolder().then((folderPath: string | null) => {
      if (folderPath) setConnectionStatus('filesystem', true, { folderPath })
      else setConnectionStatus('filesystem', false)
    })
  }, [])

  async function disconnect(id: string) {
    if (id === 'gmail') {
      await window.api.gmail.disconnect()
      setConnectionStatus('gmail', false)
    } else if (id === 'filesystem') {
      await window.api.fs.disconnect()
      setConnectionStatus('filesystem', false)
    }
  }

  function openSetup(id: string) {
    if (id === 'gmail') setGmailDialogOpen(true)
    else if (id === 'filesystem') setFolderDialogOpen(true)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border drag-region">
        <h2 className="text-sm font-semibold">Connections</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {connections.map((conn) => (
          <div
            key={conn.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                {conn.type === 'gmail' && (
                  <svg viewBox="0 0 48 48" className="h-4 w-4">
                    <path fill="#4285F4" d="M6 10.5v27l10.5-10.5z" />
                    <path fill="#34A853" d="M42 10.5v27L31.5 27z" />
                    <path fill="#FBBC05" d="M6 10.5l18 13.5 18-13.5H6z" />
                    <path fill="#EA4335" d="M6 37.5l10.5-10.5 7.5 5.625 7.5-5.625L42 37.5H6z" />
                  </svg>
                )}
                {conn.type === 'filesystem' && (
                  <FolderOpen size={15} className="text-amber-400" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{conn.label}</p>
                {conn.connected && conn.meta?.folderPath ? (
                  <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {conn.meta.folderPath.split(/[\\/]/).pop()}
                  </p>
                ) : (
                  <Badge variant={conn.connected ? 'success' : 'outline'} className="mt-0.5">
                    {conn.connected ? 'Connected' : 'Not connected'}
                  </Badge>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {conn.connected ? (
                <Button variant="ghost" size="icon" onClick={() => disconnect(conn.id)} title="Disconnect">
                  <Unplug size={15} className="text-muted-foreground" />
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => openSetup(conn.id)} className="gap-1 text-xs">
                  <Plus size={13} /> Connect
                </Button>
              )}
            </div>
          </div>
        ))}

        <div className="flex items-center justify-between p-3 rounded-lg border border-dashed border-border/50 opacity-50">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-md bg-muted/50 flex items-center justify-center">
              <Zap size={14} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">More coming soon</p>
              <p className="text-xs text-muted-foreground">Calendar, Drive, Slack...</p>
            </div>
          </div>
        </div>
      </div>

      <GmailSetupDialog open={gmailDialogOpen} onClose={() => setGmailDialogOpen(false)} />
      <FolderSetupDialog open={folderDialogOpen} onClose={() => setFolderDialogOpen(false)} />
    </div>
  )
}
