import { useState, useEffect } from 'react'
import { Download, Trash2, CheckCircle, AlertCircle, Search, HardDrive, Plus, Eye, EyeOff, Cloud } from 'lucide-react'
import { useStore, OllamaModel } from '@/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const SUGGESTED = [
  {
    name: 'nemotron-mini:4b',
    label: 'Nemotron Mini 4B',
    description: "NVIDIA's compact reasoning model, strong at instruction following",
    size: '~2.7 GB',
    tags: ['Reasoning', 'NVIDIA']
  },
  {
    name: 'qwen2.5:4b',
    label: 'Qwen 2.5 4B',
    description: "Alibaba's fast multilingual model, great for chat and tasks",
    size: '~2.5 GB',
    tags: ['Multilingual', 'Fast']
  },
  {
    name: 'qwen2.5:9b',
    label: 'Qwen 2.5 9B',
    description: 'Larger Qwen variant — significantly better reasoning and accuracy',
    size: '~5.5 GB',
    tags: ['Multilingual', 'Accurate']
  }
]

function formatSize(bytes: number) {
  if (!bytes) return '—'
  const gb = bytes / 1e9
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1e6).toFixed(0)} MB`
}

export function ModelsView() {
  const {
    models, setModels, selectedModel, setSelectedModel,
    nimModels, nimApiKey, setNimModels, setNimApiKey,
    claudeModels, claudeApiKey, setClaudeModels, setClaudeApiKey
  } = useStore()
  const [pulling, setPulling] = useState<Record<string, boolean>>({})
  const [pullError, setPullError] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState<Record<string, boolean>>({})
  const [customModel, setCustomModel] = useState('')
  const [customPulling, setCustomPulling] = useState(false)
  const [customError, setCustomError] = useState<string | null>(null)
  const [customSuccess, setCustomSuccess] = useState(false)

  // NIM state
  const [nimKeyInput, setNimKeyInput] = useState('')
  const [nimKeyVisible, setNimKeyVisible] = useState(false)
  const [nimKeySaved, setNimKeySaved] = useState(false)
  const [nimModelInput, setNimModelInput] = useState('')
  const [nimModelError, setNimModelError] = useState<string | null>(null)

  // Claude state
  const [claudeKeyInput, setClaudeKeyInput] = useState('')
  const [claudeKeyVisible, setClaudeKeyVisible] = useState(false)
  const [claudeKeySaved, setClaudeKeySaved] = useState(false)
  const [claudeModelInput, setClaudeModelInput] = useState('')
  const [claudeModelError, setClaudeModelError] = useState<string | null>(null)

  // Email notification state
  const [notifyEnabled, setNotifyEnabled] = useState(true)
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpPasswordVisible, setSmtpPasswordVisible] = useState(false)
  const [fromEmail, setFromEmail] = useState('noreply@labguard.com')
  const [fromName, setFromName] = useState('LabGuard')
  const [toEmail, setToEmail] = useState('')
  const [notifySaved, setNotifySaved] = useState(false)
  const [notifyTestResult, setNotifyTestResult] = useState<string | null>(null)

  useEffect(() => {
    refreshModels()
    // Load persisted NIM data
    window.api.nim.getApiKey().then((key: string) => {
      if (key) setNimApiKey(key)
    })
    window.api.nim.getModels().then((models: string[]) => {
      setNimModels(models)
    })

    // Load persisted Claude data
    window.api.claude.getApiKey().then((key: string) => {
      if (key) setClaudeApiKey(key)
    })
    window.api.claude.getModels().then((models: string[]) => {
      setClaudeModels(models)
    })

    window.api.notify.getConfig().then((cfg) => {
      setNotifyEnabled(cfg.enabled)
      setSmtpHost(cfg.smtpHost)
      setSmtpPort(String(cfg.smtpPort))
      setSmtpUser(cfg.smtpUser)
      setSmtpPassword(cfg.smtpPassword)
      setFromEmail(cfg.fromEmail)
      setFromName(cfg.fromName)
      setToEmail(cfg.toEmail)
    })
  }, [])

  async function refreshModels() {
    const latest = await window.api.ollama.listModels()
    setModels(latest)
  }

  async function pullModel(name: string) {
    setPulling((p) => ({ ...p, [name]: true }))
    setPullError((e) => { const next = { ...e }; delete next[name]; return next })
    const result = await window.api.ollama.pullModel(name)
    setPulling((p) => ({ ...p, [name]: false }))
    if (result.success) {
      await refreshModels()
    } else {
      setPullError((e) => ({ ...e, [name]: result.error ?? 'Pull failed' }))
    }
  }

  async function deleteModel(name: string) {
    setDeleting((d) => ({ ...d, [name]: true }))
    const result = await window.api.ollama.deleteModel(name)
    if (result.success) {
      if (selectedModel === name) {
        const remaining = models.filter((m) => m.name !== name)
        setSelectedModel(remaining[0]?.name ?? '')
      }
      await refreshModels()
    }
    setDeleting((d) => ({ ...d, [name]: false }))
  }

  async function pullCustomModel() {
    const name = customModel.trim()
    if (!name) return
    setCustomPulling(true)
    setCustomError(null)
    setCustomSuccess(false)
    const result = await window.api.ollama.pullModel(name)
    setCustomPulling(false)
    if (result.success) {
      setCustomSuccess(true)
      setCustomModel('')
      await refreshModels()
      setTimeout(() => setCustomSuccess(false), 3000)
    } else {
      setCustomError(result.error ?? 'Pull failed')
    }
  }

  async function saveNimApiKey() {
    const key = nimKeyInput.trim()
    if (!key) return
    await window.api.nim.setApiKey(key)
    setNimApiKey(key)
    setNimKeySaved(true)
    setTimeout(() => setNimKeySaved(false), 3000)
  }

  async function addNimModel() {
    const name = nimModelInput.trim()
    if (!name) return
    setNimModelError(null)
    const updated: string[] = await window.api.nim.addModel(name)
    setNimModels(updated)
    setNimModelInput('')
  }

  async function removeNimModel(name: string) {
    const updated: string[] = await window.api.nim.removeModel(name)
    setNimModels(updated)
    if (selectedModel === name) setSelectedModel('')
  }

  async function saveClaudeApiKey() {
    const key = claudeKeyInput.trim()
    if (!key) return
    await window.api.claude.setApiKey(key)
    setClaudeApiKey(key)
    setClaudeKeySaved(true)
    setTimeout(() => setClaudeKeySaved(false), 3000)
  }

  async function addClaudeModel() {
    const name = claudeModelInput.trim()
    if (!name) return
    setClaudeModelError(null)
    const updated: string[] = await window.api.claude.addModel(name)
    setClaudeModels(updated)
    setClaudeModelInput('')
  }

  async function removeClaudeModel(name: string) {
    const updated: string[] = await window.api.claude.removeModel(name)
    setClaudeModels(updated)
    if (selectedModel === name) setSelectedModel('')
  }

  async function saveNotifyConfig() {
    const result = await window.api.notify.setConfig({
      enabled: notifyEnabled,
      smtpHost: smtpHost.trim(),
      smtpPort: Number(smtpPort) || 587,
      smtpUser: smtpUser.trim(),
      smtpPassword,
      fromEmail: fromEmail.trim(),
      fromName: fromName.trim(),
      toEmail: toEmail.trim()
    })
    setNotifyEnabled(result.config.enabled)
    setNotifySaved(true)
    setTimeout(() => setNotifySaved(false), 3000)
  }

  async function sendNotifyTest() {
    setNotifyTestResult('Sending test email...')
    const result = await window.api.notify.sendTest()
    setNotifyTestResult(result.success ? 'Test email sent' : `Test failed: ${result.error ?? 'unknown error'}`)
  }

  const installedNames = new Set(models.map((m) => m.name))
  const suggestedNotInstalled = SUGGESTED.filter((s) => !installedNames.has(s.name))

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border drag-region shrink-0">
        <h2 className="text-sm font-semibold">Models</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">

        {/* Installed models */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Installed · {models.length}
          </h3>
          {models.length === 0 ? (
            <p className="text-sm text-muted-foreground">No models installed yet.</p>
          ) : (
            <div className="space-y-2">
              {models.map((m: OllamaModel) => (
                <InstalledModelRow
                  key={m.name}
                  model={m}
                  isSelected={selectedModel === m.name}
                  isDeleting={!!deleting[m.name]}
                  onSelect={() => setSelectedModel(m.name)}
                  onDelete={() => deleteModel(m.name)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Suggested models */}
        {suggestedNotInstalled.length > 0 && (
          <section>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Suggested
            </h3>
            <div className="space-y-2">
              {suggestedNotInstalled.map((s) => (
                <SuggestedModelRow
                  key={s.name}
                  model={s}
                  isPulling={!!pulling[s.name]}
                  error={pullError[s.name]}
                  onPull={() => pullModel(s.name)}
                />
              ))}
            </div>
          </section>
        )}

        {/* Custom model */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Add any model
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Enter any model name from{' '}
            <a
              href="https://ollama.com/library"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              ollama.com/library
            </a>{' '}
            — e.g. <code className="bg-muted px-1 rounded">phi4:latest</code>
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={customModel}
                onChange={(e) => { setCustomModel(e.target.value); setCustomError(null); setCustomSuccess(false) }}
                onKeyDown={(e) => e.key === 'Enter' && pullCustomModel()}
                placeholder="model:tag"
                className="pl-8"
                disabled={customPulling}
              />
            </div>
            <Button
              onClick={pullCustomModel}
              disabled={!customModel.trim() || customPulling}
              className="gap-1.5 shrink-0"
              size="sm"
            >
              {customPulling ? <Spinner className="h-3.5 w-3.5" /> : <Download size={14} />}
              Pull
            </Button>
          </div>

          {customPulling && (
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Spinner className="h-3 w-3" /> Pulling <strong>{customModel}</strong> — this may take a few minutes…
            </p>
          )}
          {customError && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded-lg px-3 py-2 mt-2 text-xs">
              <AlertCircle size={13} /> {customError}
            </div>
          )}
          {customSuccess && (
            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 rounded-lg px-3 py-2 mt-2 text-xs">
              <CheckCircle size={13} /> Model pulled successfully
            </div>
          )}
        </section>

        {/* NVIDIA NIM */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              NVIDIA NIM
            </h3>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-sky-400 border-sky-400/40">Cloud</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Use free cloud-hosted models from NVIDIA's inference platform. Requires an API key from{' '}
            <a href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              build.nvidia.com
            </a>.
          </p>

          {/* API Key */}
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">API Key</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={nimKeyVisible ? 'text' : 'password'}
                  value={nimKeyInput || (nimApiKey ? '••••••••••••••••' : '')}
                  onChange={(e) => setNimKeyInput(e.target.value)}
                  onFocus={() => { if (!nimKeyInput && nimApiKey) setNimKeyInput(nimApiKey) }}
                  placeholder="nvapi-..."
                  className="pr-9 font-mono text-xs"
                />
                <button
                  onClick={() => setNimKeyVisible(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {nimKeyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <Button
                size="sm"
                onClick={saveNimApiKey}
                disabled={!nimKeyInput.trim()}
                className="shrink-0 gap-1.5"
              >
                {nimKeySaved ? <CheckCircle size={13} /> : null}
                {nimKeySaved ? 'Saved' : 'Save'}
              </Button>
            </div>
          </div>

          {/* Add model */}
          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Add model by ID</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Cloud size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={nimModelInput}
                  onChange={(e) => { setNimModelInput(e.target.value); setNimModelError(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && addNimModel()}
                  placeholder="e.g. nvidia/llama-3.1-nemotron-70b-instruct"
                  className="pl-8 text-xs font-mono"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={addNimModel}
                disabled={!nimModelInput.trim()}
                className="gap-1.5 shrink-0"
              >
                <Plus size={13} /> Add
              </Button>
            </div>
            {nimModelError && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded px-2 py-1.5 mt-2 text-xs">
                <AlertCircle size={12} /> {nimModelError}
              </div>
            )}
          </div>

          {/* NIM model list */}
          {nimModels.length > 0 && (
            <div className="space-y-2">
              {nimModels.map((name) => (
                <div
                  key={name}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border transition-colors',
                    selectedModel === name ? 'border-sky-400/50 bg-sky-400/5' : 'border-border bg-card'
                  )}
                >
                  <button
                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                    onClick={() => setSelectedModel(name)}
                  >
                    <div className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      selectedModel === name ? 'bg-sky-400' : 'bg-muted-foreground/40'
                    )} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate font-mono">{name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Cloud size={11} className="text-sky-400/70" />
                        <span className="text-xs text-sky-400/70">NVIDIA NIM</span>
                        {selectedModel === name && <Badge variant="default" className="text-[10px] py-0 px-1.5">active</Badge>}
                      </div>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeNimModel(name)}
                    title="Remove model"
                  >
                    <Trash2 size={14} className="text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Anthropic Claude */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Anthropic Claude
            </h3>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-amber-400 border-amber-400/40">Cloud</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Connect Claude API and use the latest Haiku, Sonnet, and Opus model aliases.
          </p>

          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">API Key</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={claudeKeyVisible ? 'text' : 'password'}
                  value={claudeKeyInput || (claudeApiKey ? '••••••••••••••••' : '')}
                  onChange={(e) => setClaudeKeyInput(e.target.value)}
                  onFocus={() => { if (!claudeKeyInput && claudeApiKey) setClaudeKeyInput(claudeApiKey) }}
                  placeholder="sk-ant-..."
                  className="pr-9 font-mono text-xs"
                />
                <button
                  onClick={() => setClaudeKeyVisible(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {claudeKeyVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              <Button
                size="sm"
                onClick={saveClaudeApiKey}
                disabled={!claudeKeyInput.trim()}
                className="shrink-0 gap-1.5"
              >
                {claudeKeySaved ? <CheckCircle size={13} /> : null}
                {claudeKeySaved ? 'Saved' : 'Save'}
              </Button>
            </div>
          </div>

          <div className="mb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Add model ID</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Cloud size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={claudeModelInput}
                  onChange={(e) => { setClaudeModelInput(e.target.value); setClaudeModelError(null) }}
                  onKeyDown={(e) => e.key === 'Enter' && addClaudeModel()}
                  placeholder="e.g. claude-3-7-sonnet-latest"
                  className="pl-8 text-xs font-mono"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={addClaudeModel}
                disabled={!claudeModelInput.trim()}
                className="gap-1.5 shrink-0"
              >
                <Plus size={13} /> Add
              </Button>
            </div>
            {claudeModelError && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded px-2 py-1.5 mt-2 text-xs">
                <AlertCircle size={12} /> {claudeModelError}
              </div>
            )}
          </div>

          {claudeModels.length > 0 && (
            <div className="space-y-2">
              {claudeModels.map((name) => (
                <div
                  key={name}
                  className={cn(
                    'flex items-center justify-between p-3 rounded-lg border transition-colors',
                    selectedModel === name ? 'border-amber-400/50 bg-amber-400/5' : 'border-border bg-card'
                  )}
                >
                  <button
                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                    onClick={() => setSelectedModel(name)}
                  >
                    <div className={cn(
                      'h-2 w-2 rounded-full shrink-0',
                      selectedModel === name ? 'bg-amber-400' : 'bg-muted-foreground/40'
                    )} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate font-mono">{name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Cloud size={11} className="text-amber-400/70" />
                        <span className="text-xs text-amber-400/70">Anthropic Claude</span>
                        {selectedModel === name && <Badge variant="default" className="text-[10px] py-0 px-1.5">active</Badge>}
                      </div>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeClaudeModel(name)}
                    title="Remove model"
                  >
                    <Trash2 size={14} className="text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Email alerts */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Email Alerts (SMTP)
            </h3>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5">Notifications</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Send watchdog alerts by email when failures or action recommendations occur.
          </p>

          <div className="mb-3 flex items-center gap-2">
            <input
              id="notify-enabled"
              type="checkbox"
              checked={notifyEnabled}
              onChange={(e) => setNotifyEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            <label htmlFor="notify-enabled" className="text-xs text-foreground">
              Enable SMTP email notifications
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="SMTP host" className="font-mono text-xs" />
            <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="SMTP port" className="font-mono text-xs" />
            <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="SMTP user" className="font-mono text-xs" />
            <div className="relative">
              <Input
                type={smtpPasswordVisible ? 'text' : 'password'}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder="SMTP password"
                className="font-mono text-xs pr-8"
              />
              <button
                onClick={() => setSmtpPasswordVisible(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {smtpPasswordVisible ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
            <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="From name" className="text-xs" />
            <Input value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="From email" className="font-mono text-xs" />
            <div className="col-span-2">
              <Input value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="Recipient email" className="font-mono text-xs" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={saveNotifyConfig} className="gap-1.5">
              {notifySaved ? <CheckCircle size={13} /> : null}
              {notifySaved ? 'Saved' : 'Save SMTP Config'}
            </Button>
            <Button size="sm" variant="outline" onClick={sendNotifyTest}>
              Send Test Email
            </Button>
          </div>

          {notifyTestResult && (
            <p className="text-xs text-muted-foreground mt-2">{notifyTestResult}</p>
          )}
        </section>

      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function InstalledModelRow({
  model, isSelected, isDeleting, onSelect, onDelete
}: {
  model: OllamaModel
  isSelected: boolean
  isDeleting: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className={cn(
      'flex items-center justify-between p-3 rounded-lg border transition-colors',
      isSelected ? 'border-primary/50 bg-primary/5' : 'border-border bg-card'
    )}>
      <button className="flex items-center gap-3 flex-1 text-left min-w-0" onClick={onSelect}>
        <div className={cn(
          'h-2 w-2 rounded-full shrink-0',
          isSelected ? 'bg-primary' : 'bg-muted-foreground/40'
        )} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{model.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <HardDrive size={11} className="text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{formatSize(model.size)}</span>
            {isSelected && <Badge variant="default" className="text-[10px] py-0 px-1.5">active</Badge>}
          </div>
        </div>
      </button>

      <div className="flex items-center gap-1 shrink-0 ml-2">
        {confirmDelete ? (
          <>
            <Button
              variant="destructive"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={onDelete}
              disabled={isDeleting}
            >
              {isDeleting ? <Spinner className="h-3 w-3" /> : 'Delete'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmDelete(true)}
            title="Remove model"
            disabled={isDeleting}
          >
            <Trash2 size={14} className="text-muted-foreground" />
          </Button>
        )}
      </div>
    </div>
  )
}

function SuggestedModelRow({
  model, isPulling, error, onPull
}: {
  model: typeof SUGGESTED[number]
  isPulling: boolean
  error?: string
  onPull: () => void
}) {
  return (
    <div className="p-3 rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium">{model.label}</p>
            {model.tags.map((t) => (
              <Badge key={t} variant="outline" className="text-[10px] py-0 px-1.5">{t}</Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            <code className="bg-muted px-1 rounded">{model.name}</code> · {model.size}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={onPull}
          disabled={isPulling}
          className="gap-1.5 shrink-0 h-8 text-xs"
        >
          {isPulling ? <Spinner className="h-3.5 w-3.5" /> : <Download size={13} />}
          {isPulling ? 'Pulling…' : 'Pull'}
        </Button>
      </div>
      {isPulling && (
        <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
          <Spinner className="h-3 w-3" /> Downloading — this may take a few minutes…
        </p>
      )}
      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-400/10 rounded px-2 py-1.5 mt-2 text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}
    </div>
  )
}
