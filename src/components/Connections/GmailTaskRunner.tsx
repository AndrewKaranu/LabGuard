import { useState } from 'react'
import { Mail, Play, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { useStore } from '@/store'

interface EmailSummary {
  id: string
  subject: string
  from: string
  snippet: string
}

interface AiAction {
  emailId: string
  subject: string
  action: 'archive' | 'label' | 'markRead' | 'trash' | 'none'
  label?: string
  reason: string
}

type RunState = 'idle' | 'fetching' | 'analyzing' | 'applying' | 'done' | 'error'

export function GmailTaskRunner() {
  const { selectedModel, connections } = useStore()
  const [runState, setRunState] = useState<RunState>('idle')
  const [emails, setEmails] = useState<EmailSummary[]>([])
  const [actions, setActions] = useState<AiAction[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [expandedActions, setExpandedActions] = useState(false)

  const gmailConnected = connections.find((c) => c.id === 'gmail')?.connected

  async function runOrganize() {
    if (!selectedModel || !gmailConnected) return
    setRunState('fetching')
    setErrorMsg(null)
    setActions([])

    try {
      // 1. Fetch latest 15 inbox emails
      const listResult = await window.api.gmail.listEmails({ maxResults: 15, labelIds: ['INBOX'] })
      const msgIds: { id: string }[] = listResult.messages ?? []

      // 2. Get details for each
      const fetched: EmailSummary[] = []
      for (const { id } of msgIds) {
        const full = await window.api.gmail.getEmail(id)
        const headers: { name: string; value: string }[] = full.payload?.headers ?? []
        const subject = headers.find((h: { name: string }) => h.name === 'Subject')?.value ?? '(no subject)'
        const from = headers.find((h: { name: string }) => h.name === 'From')?.value ?? 'Unknown'
        fetched.push({ id, subject, from, snippet: full.snippet ?? '' })
      }
      setEmails(fetched)

      if (fetched.length === 0) {
        setRunState('done')
        return
      }

      // 3. Ask AI to classify each email
      setRunState('analyzing')
      const emailList = fetched
        .map((e, i) => `${i + 1}. ID:${e.id} | From: ${e.from} | Subject: ${e.subject} | Snippet: ${e.snippet}`)
        .join('\n')

      const prompt = `You are an email organizer. Analyze these inbox emails and decide what action to take for each.

Emails:
${emailList}

For each email, respond with a JSON array. Each item must have:
- emailId: the ID string
- subject: short subject label
- action: one of "archive", "label", "markRead", "trash", "none"
- label: (only if action is "label") a short label name like "Newsletter" or "Finance"
- reason: one sentence explaining why

Rules:
- Newsletters/promotions → archive or label "Newsletter"
- Receipts/invoices → label "Finance"
- Spam/junk → trash
- Important/personal → none (keep in inbox)
- Already read automated alerts → archive

Respond ONLY with valid JSON. No markdown, no explanation outside the array.`

      // Stream the AI response and collect it
      let aiResponse = ''
      const unsubChunk = window.api.ollama.onChunk((chunk: string) => { aiResponse += chunk })

      await new Promise<void>((resolve, reject) => {
        window.api.ollama.onChatDone(() => { unsubChunk(); resolve() })
        window.api.ollama.chat({
          model: selectedModel,
          messages: [{ role: 'user', content: prompt }],
          stream: true
        }).catch(reject)
      })

      // 4. Parse AI actions
      let parsed: AiAction[] = []
      try {
        // Extract JSON array from response
        const match = aiResponse.match(/\[[\s\S]*\]/)
        if (match) parsed = JSON.parse(match[0])
      } catch {
        throw new Error('Could not parse AI response. Try again.')
      }

      const validActions = parsed.filter((a) => a.action !== 'none')
      setActions(validActions)

      // 5. Apply actions
      setRunState('applying')
      for (const action of validActions) {
        try {
          if (action.action === 'archive') {
            await window.api.gmail.archiveEmail(action.emailId)
          } else if (action.action === 'trash') {
            await window.api.gmail.trashEmail(action.emailId)
          } else if (action.action === 'markRead') {
            await window.api.gmail.markRead(action.emailId, true)
          } else if (action.action === 'label' && action.label) {
            // Get or create label
            const labels: { id: string; name: string }[] = await window.api.gmail.listLabels()
            let labelId = labels.find((l) => l.name.toLowerCase() === action.label!.toLowerCase())?.id
            if (!labelId) {
              const created: { id: string } = await window.api.gmail.createLabel(action.label!)
              labelId = created.id
            }
            await window.api.gmail.labelEmail(action.emailId, [labelId])
          }
        } catch {
          // Non-fatal — continue with other actions
        }
      }

      setRunState('done')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setRunState('error')
    }
  }

  if (!gmailConnected) return null

  return (
    <div className="border-t border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail size={15} className="text-muted-foreground" />
          <span className="text-sm font-medium">AI Email Organizer</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={runOrganize}
          disabled={runState === 'fetching' || runState === 'analyzing' || runState === 'applying' || !selectedModel}
          className="gap-1.5 text-xs h-7"
        >
          {(runState === 'fetching' || runState === 'analyzing' || runState === 'applying')
            ? <><Spinner className="h-3 w-3" /> {runState === 'fetching' ? 'Fetching...' : runState === 'analyzing' ? 'Analyzing...' : 'Applying...'}</>
            : <><Play size={11} /> Organize Inbox</>
          }
        </Button>
      </div>

      {runState === 'error' && errorMsg && (
        <div className="flex items-start gap-2 text-red-400 bg-red-400/10 rounded-lg px-3 py-2 text-xs">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {errorMsg}
        </div>
      )}

      {runState === 'done' && (
        <div>
          {actions.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400 text-xs">
              <CheckCircle size={13} />
              Inbox is already organized — no actions needed.
            </div>
          ) : (
            <>
              <button
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
                onClick={() => setExpandedActions((v) => !v)}
              >
                <CheckCircle size={13} className="text-emerald-400" />
                {actions.length} action{actions.length !== 1 ? 's' : ''} applied
                {expandedActions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>

              {expandedActions && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {actions.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs p-2 rounded-md bg-muted/50">
                      <Badge
                        variant={a.action === 'trash' ? 'destructive' : a.action === 'archive' ? 'outline' : 'default'}
                        className="shrink-0 mt-0.5"
                      >
                        {a.action}{a.label ? `: ${a.label}` : ''}
                      </Badge>
                      <div>
                        <p className="font-medium text-foreground truncate max-w-[200px]">{a.subject}</p>
                        <p className="text-muted-foreground">{a.reason}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
