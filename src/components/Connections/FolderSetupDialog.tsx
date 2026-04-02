import { useState } from 'react'
import { FolderOpen, CheckCircle, AlertCircle, FolderCheck } from 'lucide-react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useStore } from '@/store'

interface Props {
  open: boolean
  onClose: () => void
}

export function FolderSetupDialog({ open, onClose }: Props) {
  const { setConnectionStatus } = useStore()
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'picking' | 'connecting' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function pickFolder() {
    setState('picking')
    setError(null)
    const folderPath = await window.api.fs.selectFolder()
    setState('idle')
    if (folderPath) setSelectedPath(folderPath)
  }

  async function connect() {
    if (!selectedPath) return
    setState('connecting')
    setError(null)
    try {
      await window.api.fs.connect(selectedPath)
      setConnectionStatus('filesystem', true, { folderPath: selectedPath })
      setState('success')
      setTimeout(handleClose, 1500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect folder')
      setState('error')
    }
  }

  function handleClose() {
    if (state === 'connecting' || state === 'picking') return
    setState('idle')
    setError(null)
    setSelectedPath(null)
    onClose()
  }

  const folderName = selectedPath?.split(/[\\/]/).pop()

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader onClose={handleClose}>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <FolderOpen size={16} className="text-amber-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Connect Folder</h2>
            <p className="text-xs text-muted-foreground">Agent will be able to organise files in this folder</p>
          </div>
        </div>
      </DialogHeader>

      <DialogBody>
        {state === 'success' ? (
          <div className="flex flex-col items-center py-6 gap-3 text-center">
            <CheckCircle size={36} className="text-emerald-400" />
            <p className="font-medium">Folder connected!</p>
            <p className="text-sm text-muted-foreground truncate max-w-xs">{selectedPath}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Choose a folder to give the agent access to. It can list, move, rename, and organise files within that folder — it cannot access anything outside it.
            </p>

            {/* Folder picker */}
            <button
              onClick={pickFolder}
              disabled={state === 'connecting'}
              className="w-full flex items-center gap-3 p-4 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-accent/50 transition-colors text-left"
            >
              {selectedPath ? (
                <>
                  <FolderCheck size={20} className="text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{folderName}</p>
                    <p className="text-xs text-muted-foreground truncate">{selectedPath}</p>
                  </div>
                </>
              ) : (
                <>
                  <FolderOpen size={20} className="text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Choose a folder</p>
                    <p className="text-xs text-muted-foreground">Click to open the folder picker</p>
                  </div>
                </>
              )}
            </button>

            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-lg px-3 py-2 mt-3 text-sm">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            {selectedPath && (
              <div className="mt-3 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">The agent will be able to:</p>
                <p>• List and browse files in this folder</p>
                <p>• Create subfolders and move files into them</p>
                <p>• Rename files and folders</p>
                <p className="text-red-400/80 mt-1">• It cannot delete files or access folders outside this one</p>
              </div>
            )}
          </>
        )}
      </DialogBody>

      {state !== 'success' && (
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={state === 'connecting'}>Cancel</Button>
          <Button
            onClick={connect}
            disabled={!selectedPath || state === 'connecting' || state === 'picking'}
            className="gap-2"
          >
            {state === 'connecting' && <Spinner />}
            Connect Folder
          </Button>
        </DialogFooter>
      )}
    </Dialog>
  )
}
