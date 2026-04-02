import { useState, useRef, useEffect } from 'react'
import { Send, Trash2, MessageSquare } from 'lucide-react'
import { useStore, RunChatMessage } from '@/store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildRunSystemPrompt } from '@/lib/runContext'

const EMPTY_LINES: never[] = []
const EMPTY_METRICS: Record<string, never[]> = {}
const EMPTY_EVENTS: never[] = []
const EMPTY_CHAT: never[] = []

interface Props {
  experimentId: string
}

export function RunChat({ experimentId }: Props) {
  const experiment = useStore((s) => s.experiments.find((e) => e.id === experimentId))
  const terminalLines = useStore((s) => s.terminalLines[experimentId] ?? EMPTY_LINES)
  const metrics = useStore((s) => s.metrics[experimentId] ?? EMPTY_METRICS)
  const watchdogEvents = useStore((s) => s.watchdogEvents[experimentId] ?? EMPTY_EVENTS)
  const chatMessages = useStore((s) => s.runChatHistory[experimentId] ?? EMPTY_CHAT)
  const selectedModel = useStore((s) => s.selectedModel)
  const nimModels = useStore((s) => s.nimModels)
  const claudeModels = useStore((s) => s.claudeModels)
  const addRunChatMessage = useStore((s) => s.addRunChatMessage)
  const clearRunChat = useStore((s) => s.clearRunChat)

  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isNimModel = !!(selectedModel && nimModels.includes(selectedModel))
  const isClaudeModel = !!(selectedModel && claudeModels.includes(selectedModel))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingContent])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  async function sendMessage() {
    if (!input.trim() || !selectedModel || isStreaming || !experiment) return
    const content = input.trim()
    setInput('')

    const userMsg: RunChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    }
    addRunChatMessage(experimentId, userMsg)
    setIsStreaming(true)
    setStreamingContent('')

    const systemPrompt = buildRunSystemPrompt(experiment, terminalLines, metrics, watchdogEvents)

    // Build message history for the API
    const history: { role: string; content: string }[] = [
      { role: 'system', content: systemPrompt },
      ...chatMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content }
    ]

    try {
      if (isNimModel) {
        await runNimStreaming(history)
      } else if (isClaudeModel) {
        await runClaudeStreaming(history)
      } else {
        await runOllamaStreaming(history)
      }
    } catch (err) {
      console.error('RunChat error:', err)
      addRunChatMessage(experimentId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        timestamp: Date.now()
      })
      setIsStreaming(false)
      setStreamingContent('')
    }
  }

  async function runOllamaStreaming(history: { role: string; content: string }[]) {
    let accumulated = ''
    const unsub = window.api.ollama.onChunk((chunk) => {
      accumulated += chunk
      setStreamingContent(accumulated)
    })
    window.api.ollama.onChatDone(() => {
      unsub()
      addRunChatMessage(experimentId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: accumulated,
        timestamp: Date.now()
      })
      setStreamingContent('')
      setIsStreaming(false)
    })
    try {
      await window.api.ollama.chat({ model: selectedModel!, messages: history, stream: true })
    } catch (err) {
      unsub()
      throw err
    }
  }

  async function runNimStreaming(history: { role: string; content: string }[]) {
    let accumulated = ''
    const unsub = window.api.nim.onChunk((chunk) => {
      accumulated += chunk
      setStreamingContent(accumulated)
    })
    window.api.nim.onChatDone(() => {
      unsub()
      addRunChatMessage(experimentId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: accumulated,
        timestamp: Date.now()
      })
      setStreamingContent('')
      setIsStreaming(false)
    })
    window.api.nim.onError((msg) => {
      unsub()
      addRunChatMessage(experimentId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${msg}`,
        timestamp: Date.now()
      })
      setStreamingContent('')
      setIsStreaming(false)
    })
    try {
      await window.api.nim.chat({ model: selectedModel!, messages: history })
    } catch (err) {
      unsub()
      throw err
    }
  }

  async function runClaudeStreaming(history: { role: string; content: string }[]) {
    let accumulated = ''
    const unsub = window.api.claude.onChunk((chunk) => {
      accumulated += chunk
      setStreamingContent(accumulated)
    })
    window.api.claude.onChatDone(() => {
      unsub()
      addRunChatMessage(experimentId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: accumulated,
        timestamp: Date.now()
      })
      setStreamingContent('')
      setIsStreaming(false)
    })
    window.api.claude.onError((msg) => {
      unsub()
      addRunChatMessage(experimentId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Error: ${msg}`,
        timestamp: Date.now()
      })
      setStreamingContent('')
      setIsStreaming(false)
    })
    try {
      await window.api.claude.chat({ model: selectedModel!, messages: history })
    } catch (err) {
      unsub()
      throw err
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const allMessages = [...chatMessages]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/20 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-primary" />
          <span className="text-sm font-medium">Chat with this run</span>
          <span className="text-xs text-muted-foreground">· context: logs, metrics & analysis</span>
        </div>
        {allMessages.length > 0 && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => clearRunChat(experimentId)} title="Clear chat">
            <Trash2 size={13} className="text-muted-foreground" />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {allMessages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <MessageSquare size={32} className="mb-3 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground mb-1">Ask about this run</p>
            <p className="text-xs max-w-xs">
              The model has full context: logs, metrics, and watchdog analysis. Try "What's the training loss trend?" or "Are there any errors in the logs?"
            </p>
          </div>
        )}

        {allMessages.map((msg) => (
          <div key={msg.id} className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}>
            <div className={cn(
              'h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-medium',
              msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            )}>
              {msg.role === 'user' ? 'U' : 'AI'}
            </div>
            <div className={cn(
              'rounded-xl px-3 py-2 text-sm max-w-[80%] whitespace-pre-wrap',
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            )}>
              {msg.content}
            </div>
          </div>
        ))}

        {isStreaming && streamingContent && (
          <div className="flex gap-3">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-medium text-muted-foreground">
              AI
            </div>
            <div className="rounded-xl px-3 py-2 text-sm max-w-[80%] bg-muted text-foreground whitespace-pre-wrap">
              {streamingContent}
              <span className="inline-block w-1 h-3 ml-0.5 bg-foreground/60 animate-pulse rounded-sm" />
            </div>
          </div>
        )}

        {isStreaming && !streamingContent && (
          <div className="flex gap-3">
            <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
              <span className="inline-flex gap-0.5">
                {[0, 1, 2].map(i => (
                  <span key={i} className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 shrink-0">
        <div className={cn(
          'relative flex items-end gap-2 rounded-xl border border-border bg-secondary p-2 transition-colors',
          'focus-within:border-primary/50'
        )}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={!selectedModel ? 'Select a model to start' : 'Ask about this run…'}
            disabled={!selectedModel || isStreaming}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 min-h-[32px] py-1 px-2"
            style={{ maxHeight: '160px', overflow: 'auto' }}
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || !selectedModel || isStreaming}
            className="shrink-0 h-8 w-8"
          >
            <Send size={14} />
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-1.5">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  )
}
