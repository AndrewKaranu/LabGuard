import { useEffect, useState } from 'react'
import { Bot, Download, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useStore } from '@/store'

const SUGGESTED_MODELS = [
  { name: 'llama3.2:3b', description: '3B — fast, good for most tasks', size: '~2 GB' },
  { name: 'llama3.2:8b', description: '8B — balanced performance', size: '~5 GB' },
  { name: 'mistral:7b', description: '7B — great instruction following', size: '~4 GB' },
  { name: 'phi3:mini', description: '3.8B — lightweight & capable', size: '~2.3 GB' }
]

type Step = 'checking' | 'starting' | 'start_failed' | 'not_installed' | 'installing' | 'select_model' | 'pulling' | 'ready'

export function OllamaSetup() {
  const onComplete = () => {} // state is set via setOllamaStatus('ready')
  const { setOllamaStatus, setModels, setSelectedModel } = useStore()
  const [step, setStep] = useState<Step>('checking')
  const [installError, setInstallError] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [pullingModel, setPullingModel] = useState<string | null>(null)
  const [pullError, setPullError] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<{ name: string }[]>([])

  useEffect(() => {
    checkOllama()
  }, [])

  async function checkOllama() {
    setStep('checking')
    const status = await window.api.ollama.checkStatus()
    if (status.running) {
      await loadModels()
    } else if (status.installed) {
      // Installed but not running — start it automatically
      setStep('starting')
      setStartError(null)
      const result = await window.api.ollama.start()
      if (result.success) {
        await loadModels()
      } else {
        setStartError(result.error ?? 'Could not start Ollama')
        setStep('start_failed')
      }
    } else {
      setStep('not_installed')
      setOllamaStatus('not_installed')
    }
  }

  async function loadModels() {
    const models = await window.api.ollama.listModels()
    setModels(models)
    setAvailableModels(models)
    if (models.length > 0) {
      setSelectedModel(models[0].name)
      setOllamaStatus('ready')
      onComplete()
    } else {
      setStep('select_model')
    }
  }

  async function installOllama() {
    setStep('installing')
    setOllamaStatus('installing')
    setInstallError(null)
    const result = await window.api.ollama.install()
    if (result.success) {
      setStep('select_model')
    } else {
      setInstallError(result.error ?? 'Installation failed')
      setStep('not_installed')
      setOllamaStatus('not_installed')
    }
  }

  async function pullModel(modelName: string) {
    setPullingModel(modelName)
    setPullError(null)
    setStep('pulling')
    const result = await window.api.ollama.pullModel(modelName)
    if (result.success) {
      setSelectedModel(modelName)
      setOllamaStatus('ready')
      onComplete()
    } else {
      setPullError(result.error ?? 'Pull failed')
      setStep('select_model')
    }
    setPullingModel(null)
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center max-w-lg mx-auto">
      <div className="mb-6 p-4 rounded-full bg-primary/10 text-primary">
        <Bot size={40} />
      </div>

      <h1 className="text-2xl font-bold mb-2">Welcome to LabGuard</h1>

      {step === 'checking' && (
        <>
          <p className="text-muted-foreground mb-6">Checking for Ollama...</p>
          <Spinner className="h-8 w-8 text-primary" />
        </>
      )}

      {step === 'starting' && (
        <>
          <p className="text-muted-foreground mb-2">Starting Ollama...</p>
          <p className="text-xs text-muted-foreground mb-6">Found an installation — spinning it up</p>
          <Spinner className="h-8 w-8 text-primary" />
        </>
      )}

      {step === 'start_failed' && (
        <>
          <p className="text-muted-foreground mb-2">Ollama is installed but could not be started.</p>
          {startError && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-lg px-4 py-2 mb-4 text-sm">
              <AlertCircle size={14} />
              {startError}
            </div>
          )}
          <p className="text-xs text-muted-foreground mb-6">
            Try running <code className="bg-muted px-1 rounded">ollama serve</code> in a terminal, then click retry.
          </p>
          <Button onClick={checkOllama} className="gap-2">
            <RefreshCw size={14} /> Retry
          </Button>
        </>
      )}

      {step === 'not_installed' && (
        <>
          <p className="text-muted-foreground mb-2">
            LabGuard needs <strong className="text-foreground">Ollama</strong> to run the local watchdog model.
          </p>
          {installError && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-lg px-4 py-2 mb-4 text-sm">
              <AlertCircle size={14} />
              {installError}
            </div>
          )}
          <p className="text-xs text-muted-foreground mb-6">
            This will run: <code className="bg-muted px-1 rounded">winget install Ollama.Ollama</code> (or brew/sh on Mac/Linux)
          </p>
          <Button onClick={installOllama} className="gap-2">
            <Download size={16} /> Install Ollama
          </Button>
          <button
            onClick={() => window.open('https://ollama.com', '_blank')}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Install manually instead
          </button>
          <Button variant="ghost" size="sm" onClick={checkOllama} className="mt-2 gap-1 text-xs">
            <RefreshCw size={12} /> I already installed it
          </Button>
        </>
      )}

      {step === 'installing' && (
        <>
          <p className="text-muted-foreground mb-2">Installing Ollama...</p>
          <p className="text-xs text-muted-foreground mb-6">This may take a minute</p>
          <Spinner className="h-8 w-8 text-primary" />
        </>
      )}

      {step === 'select_model' && (
        <>
          <p className="text-muted-foreground mb-6">
            {availableModels.length > 0
              ? 'Ollama is ready. Pull a model to get started.'
              : 'No models found. Pull one to get started.'}
          </p>
          {pullError && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-lg px-4 py-2 mb-4 text-sm w-full">
              <AlertCircle size={14} />
              {pullError}
            </div>
          )}
          <div className="w-full space-y-2">
            {availableModels.length > 0 && (
              <>
                <p className="text-sm font-medium text-left mb-1">Installed models</p>
                {availableModels.map((m) => (
                  <button
                    key={m.name}
                    onClick={() => { setSelectedModel(m.name); setOllamaStatus('ready'); onComplete() }}
                    className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-colors text-left"
                  >
                    <span className="text-sm font-medium">{m.name}</span>
                    <CheckCircle size={16} className="text-emerald-400" />
                  </button>
                ))}
                <p className="text-sm font-medium text-left mt-4 mb-1">Suggested models</p>
              </>
            )}
            {SUGGESTED_MODELS.filter((s) => !availableModels.find((m) => m.name === s.name)).map((model) => (
              <button
                key={model.name}
                onClick={() => pullModel(model.name)}
                className="w-full flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-colors text-left"
              >
                <div>
                  <p className="text-sm font-medium">{model.name}</p>
                  <p className="text-xs text-muted-foreground">{model.description}</p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">{model.size}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'pulling' && (
        <>
          <p className="text-muted-foreground mb-2">Pulling <strong className="text-foreground">{pullingModel}</strong>...</p>
          <p className="text-xs text-muted-foreground mb-6">This may take several minutes depending on your connection</p>
          <Spinner className="h-8 w-8 text-primary" />
        </>
      )}
    </div>
  )
}
