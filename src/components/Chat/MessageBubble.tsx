import { useState } from 'react'
import { Bot, User, Wrench, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Message } from '@/store'
import { cn } from '@/lib/utils'
import { Spinner } from '@/components/ui/spinner'

interface Props {
  message: Message
  streaming?: boolean
}

export function MessageBubble({ message, streaming }: Props) {
  if (message.role === 'tool_call') return <ToolCallBubble message={message} />
  if (message.role === 'tool') return null

  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-3 group', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={cn(
        'shrink-0 h-8 w-8 rounded-full flex items-center justify-center',
        isUser ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
      )}>
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>

      <div className={cn(
        'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
        isUser
          ? 'bg-primary/90 text-primary-foreground rounded-tr-sm'
          : 'bg-muted text-foreground rounded-tl-sm'
      )}>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {streaming && (
          <span className="inline-flex gap-0.5 ml-1 align-middle">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </span>
        )}
      </div>
    </div>
  )
}

function ToolCallBubble({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false)
  const status = message.toolStatus ?? 'running'
  const label = formatToolName(message.toolName ?? '')
  const args = message.toolArgs ?? {}
  const hasResult = !!message.toolResult && status !== 'running'

  const argSummary = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== '' &&
      !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => Array.isArray(v) ? `${k}: [${(v as unknown[]).length}]` : `${k}: ${JSON.stringify(v)}`)
    .join(', ')

  return (
    <div className="flex gap-3">
      <div className="shrink-0 h-8 w-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        <Wrench size={14} />
      </div>

      <div className="flex flex-col gap-1 max-w-[75%]">
        {/* Header row */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground">
          {status === 'running' && <Spinner className="h-3 w-3 shrink-0" />}
          {status === 'done' && <CheckCircle size={13} className="text-emerald-400 shrink-0" />}
          {status === 'error' && <AlertCircle size={13} className="text-red-400 shrink-0" />}
          <span className="flex-1 min-w-0">
            <span className="font-medium text-foreground">{label}</span>
            {argSummary && <span className="ml-1 opacity-60 truncate">({argSummary})</span>}
          </span>
          {hasResult && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-1"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              <span className="text-[10px]">{expanded ? 'hide' : 'data'}</span>
            </button>
          )}
        </div>

        {/* Raw result panel */}
        {expanded && message.toolResult && (
          <div className="px-3 py-2 rounded-lg bg-muted/30 border border-border/50 text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
            {message.toolResult}
          </div>
        )}
      </div>
    </div>
  )
}

function formatToolName(name: string) {
  const map: Record<string, string> = {
    list_emails: 'Listing emails',
    get_email: 'Reading email',
    archive_email: 'Archiving email',
    trash_email: 'Trashing email',
    mark_read: 'Marking as read',
    label_email: 'Labelling email',
    list_labels: 'Listing labels',
    get_folder_summary: 'Scanning folder',
    list_files: 'Listing files',
    create_folder: 'Creating folder',
    move_files: 'Moving files',
    rename_item: 'Renaming item'
  }
  return map[name] ?? name.replace(/_/g, ' ')
}
