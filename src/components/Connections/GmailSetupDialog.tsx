import { useState } from 'react'
import { ExternalLink, AlertCircle, CheckCircle } from 'lucide-react'
import { Dialog, DialogHeader, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useStore } from '@/store'

interface Props {
  open: boolean
  onClose: () => void
}

export function GmailSetupDialog({ open, onClose }: Props) {
  const { setConnectionStatus } = useStore()
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [state, setState] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'credentials' | 'oauth'>('credentials')

  async function connect() {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Both Client ID and Client Secret are required')
      return
    }
    setState('connecting')
    setError(null)
    setStep('oauth')

    const result = await window.api.gmail.connect(clientId.trim(), clientSecret.trim())
    if (result.success) {
      setState('success')
      setConnectionStatus('gmail', true)
      setTimeout(onClose, 1500)
    } else {
      setError(result.error ?? 'Connection failed')
      setState('error')
      setStep('credentials')
    }
  }

  function handleClose() {
    if (state === 'connecting') return
    setState('idle')
    setStep('credentials')
    setError(null)
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} className="max-w-md">
      <DialogHeader onClose={handleClose}>
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
            <svg viewBox="0 0 48 48" className="h-5 w-5">
              <path fill="#EA4335" d="M24 4.5a19.5 19.5 0 1 0 0 39 19.5 19.5 0 0 0 0-39z" opacity=".1" />
              <path fill="#4285F4" d="M6 10.5v27l10.5-10.5z" />
              <path fill="#34A853" d="M42 10.5v27L31.5 27z" />
              <path fill="#FBBC05" d="M6 10.5l18 13.5 18-13.5H6z" />
              <path fill="#EA4335" d="M6 37.5l10.5-10.5 7.5 5.625 7.5-5.625L42 37.5H6z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold">Connect Gmail</h2>
            <p className="text-xs text-muted-foreground">OAuth 2.0 — your credentials stay local</p>
          </div>
        </div>
      </DialogHeader>

      <DialogBody>
        {state === 'success' ? (
          <div className="flex flex-col items-center py-4 gap-3 text-center">
            <CheckCircle size={36} className="text-emerald-400" />
            <p className="font-medium">Gmail connected!</p>
            <p className="text-sm text-muted-foreground">Closing...</p>
          </div>
        ) : step === 'oauth' ? (
          <div className="flex flex-col items-center py-4 gap-3 text-center">
            <Spinner className="h-8 w-8 text-primary" />
            <p className="font-medium">Waiting for authorization</p>
            <p className="text-sm text-muted-foreground">
              A browser window has opened. Sign in with Google and approve the permissions.
            </p>
          </div>
        ) : (
          <>
            {/* Instructions */}
            <div className="bg-muted/50 rounded-lg p-3 mb-4 text-xs text-muted-foreground space-y-1.5">
              <p className="font-medium text-foreground text-sm">Setup required</p>
              <p>1. Go to <strong>Google Cloud Console</strong> → APIs &amp; Services → Credentials</p>
              <p>2. Create an <strong>OAuth 2.0 Client ID</strong> (Desktop application)</p>
              <p>
                3. No redirect URI needed — Desktop apps allow all localhost automatically
              </p>
              <p>4. Paste the Client ID and Secret below</p>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline mt-1"
              >
                Open Google Cloud Console <ExternalLink size={10} />
              </a>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-lg px-3 py-2 mb-3 text-sm">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Client ID</label>
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxxxxxx.apps.googleusercontent.com"
                  disabled={state === 'connecting'}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Client Secret</label>
                <Input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="GOCSPX-..."
                  disabled={state === 'connecting'}
                />
              </div>
            </div>
          </>
        )}
      </DialogBody>

      {state !== 'success' && step !== 'oauth' && (
        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={state === 'connecting'}>Cancel</Button>
          <Button onClick={connect} disabled={state === 'connecting' || !clientId || !clientSecret} className="gap-2">
            {state === 'connecting' && <Spinner />}
            Connect
          </Button>
        </DialogFooter>
      )}
    </Dialog>
  )
}
