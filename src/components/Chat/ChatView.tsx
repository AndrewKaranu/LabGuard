import { useState, useRef, useEffect } from 'react'
import { Send, Trash2, Plug } from 'lucide-react'
import { useStore, Message } from '@/store'
import { ModelSelector } from './ModelSelector'
import { MessageBubble } from './MessageBubble'
import { ToolPicker } from './ToolPicker'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getActiveTools, buildToolSystemMessage } from '@/lib/tools'
import { executeTool } from '@/lib/toolExecutor'

export function ChatView() {
  const {
    messages, selectedModel, isStreaming, streamingContent,
    connections, activePlatforms, conversationHistory, nimModels, claudeModels,
    addMessage, updateMessage, setStreaming, appendStreamChunk,
    commitStreamedMessage, clearMessages, setConversationHistory
  } = useStore()

  const isNimModel = !!(selectedModel && nimModels.includes(selectedModel))
  const isClaudeModel = !!(selectedModel && claudeModels.includes(selectedModel))

  const [input, setInput] = useState('')
  const [toolPickerOpen, setToolPickerOpen] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toolPickerAnchorRef = useRef<HTMLButtonElement>(null)

  const activeTools = getActiveTools(connections, activePlatforms)
  const hasTools = activeTools.length > 0

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [input])

  async function sendMessage() {
    const content = input.trim()
    if (!content || !selectedModel || isStreaming) return
    setInput('')
    setToolPickerOpen(false)

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: Date.now()
    }
    addMessage(userMsg)
    setStreaming(true)

    let apiMessages: { role: string; content: string }[]

    if (hasTools) {
      // Use persisted conversation history so tool turns are preserved across messages
      const hasSystemMsg = conversationHistory.some(m => m.role === 'system')
      apiMessages = [
        ...(hasSystemMsg ? [] : [{ role: 'system', content: buildToolSystemMessage(activeTools) }]),
        ...conversationHistory,
        { role: 'user', content }
      ]
    } else {
      apiMessages = [...messages, userMsg]
        .filter(m => m.role !== 'tool_call')
        .map(m => ({ role: m.role, content: m.content }))
    }

    try {
      if (hasTools) {
        await runAgenticLoop(apiMessages, content)
      } else {
        await runStreamingChat(apiMessages)
      }
    } catch (err) {
      console.error('Chat error:', err)
      // Ensure we never stay stuck in loading state
      commitStreamedMessage()
    }
  }

  async function runAgenticLoop(history: { role: string; content: string }[], originalQuestion: string) {
    const MAX_ITERATIONS = 8

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = isNimModel
        ? await window.api.nim.complete({ model: selectedModel!, messages: history })
        : isClaudeModel
          ? await window.api.claude.complete({ model: selectedModel!, messages: history })
          : await window.api.ollama.complete({ model: selectedModel!, messages: history })

      if ('error' in response && response.error) {
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Error: ${response.error}`,
          timestamp: Date.now()
        })
        setStreaming(false)
        return
      }

      const content = (response.message?.content ?? '').trim()
      const toolCall = parseToolCall(content)

      if (toolCall) {
        history.push({ role: 'assistant', content })

        const displayId = crypto.randomUUID()
        addMessage({
          id: displayId,
          role: 'tool_call',
          content: '',
          toolName: toolCall.tool,
          toolArgs: toolCall.args,
          toolStatus: 'running',
          timestamp: Date.now()
        })

        const result = await executeTool(toolCall.tool, toolCall.args)
        const isError = result.startsWith('Error')
        updateMessage(displayId, { toolStatus: isError ? 'error' : 'done', toolResult: result })

        history.push({
          role: 'user',
          content: `Tool result for ${toolCall.tool}:\n${result}\n\nThe user asked: "${originalQuestion}"\nUsing ONLY the data above, write your response. If the result is a list, reproduce it in full — do not say "here they are" without including the actual items. Do NOT call further tools unless strictly necessary.`
        })
      } else {
        // Final response — commit the content we already have, no second API call
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content,
          timestamp: Date.now()
        })
        // Persist the full history (including all tool turns) for the next message
        history.push({ role: 'assistant', content })
        setConversationHistory(history)
        setStreaming(false)
        return
      }
    }

    // Hit max iterations — commit whatever we have
    setConversationHistory(history)
    setStreaming(false)
  }

  /** Scan content for any JSON object with a "tool" key — works regardless of surrounding text */
  function parseToolCall(content: string): { tool: string; args: Record<string, unknown> } | null {
    const stripped = content.replace(/```(?:json)?/gi, '').trim()
    let start = stripped.indexOf('{')
    while (start !== -1) {
      let depth = 0
      let end = -1
      for (let i = start; i < stripped.length; i++) {
        if (stripped[i] === '{') depth++
        else if (stripped[i] === '}') { depth--; if (depth === 0) { end = i; break } }
      }
      if (end !== -1) {
        try {
          const parsed = JSON.parse(stripped.slice(start, end + 1))
          if (typeof parsed.tool === 'string') return { tool: parsed.tool, args: parsed.args ?? {} }
        } catch { /* keep scanning */ }
      }
      start = stripped.indexOf('{', start + 1)
    }
    return null
  }

  async function runStreamingChat(history: { role: string; content: string }[]) {
    if (isNimModel) {
      const unsubChunk = window.api.nim.onChunk((chunk: string) => appendStreamChunk(chunk))
      window.api.nim.onChatDone(() => { unsubChunk(); commitStreamedMessage() })
      window.api.nim.onError((msg: string) => {
        unsubChunk()
        addMessage({ id: crypto.randomUUID(), role: 'assistant', content: `Error: ${msg}`, timestamp: Date.now() })
        setStreaming(false)
      })
      try {
        await window.api.nim.chat({ model: selectedModel!, messages: history })
      } catch (err) {
        unsubChunk()
        throw err
      }
    } else if (isClaudeModel) {
      const unsubChunk = window.api.claude.onChunk((chunk: string) => appendStreamChunk(chunk))
      window.api.claude.onChatDone(() => { unsubChunk(); commitStreamedMessage() })
      window.api.claude.onError((msg: string) => {
        unsubChunk()
        addMessage({ id: crypto.randomUUID(), role: 'assistant', content: `Error: ${msg}`, timestamp: Date.now() })
        setStreaming(false)
      })
      try {
        await window.api.claude.chat({ model: selectedModel!, messages: history })
      } catch (err) {
        unsubChunk()
        throw err
      }
    } else {
      const unsubChunk = window.api.ollama.onChunk((chunk: string) => appendStreamChunk(chunk))
      window.api.ollama.onChatDone(() => { unsubChunk(); commitStreamedMessage() })
      try {
        await window.api.ollama.chat({ model: selectedModel!, messages: history, stream: true })
      } catch (err) {
        unsubChunk()
        throw err
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const showEmpty = messages.length === 0 && !isStreaming

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border drag-region">
        <ModelSelector />
        <div className="flex items-center gap-2 no-drag">
          {hasTools && (
            <div className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-md px-2 py-1">
              <Plug size={11} />
              {activePlatforms.join(', ')}
            </div>
          )}
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" onClick={clearMessages} title="Clear chat">
              <Trash2 size={15} className="text-muted-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {showEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            <p className="text-lg font-medium text-foreground mb-1">
              {hasTools ? 'Chat with your tools' : 'Start a conversation'}
            </p>
            <p className="text-sm">
              {hasTools
                ? `${activePlatforms.join(' & ')} tools are active — ask anything`
                : 'Ask anything, or click the plug icon to add connected services'}
            </p>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isStreaming && streamingContent && (
          <MessageBubble
            message={{ id: 'streaming', role: 'assistant', content: streamingContent, timestamp: Date.now() }}
            streaming
          />
        )}

        {isStreaming && !streamingContent && (
          <div className="flex gap-3">
            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
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
      <div className="px-4 pb-4">
        <div className={cn(
          'relative flex items-end gap-2 rounded-xl border border-border bg-secondary p-2 transition-colors',
          'focus-within:border-primary/50'
        )}>
          {/* Tool picker */}
          <div className="relative shrink-0">
            <button
              ref={toolPickerAnchorRef}
              onClick={() => setToolPickerOpen(o => !o)}
              title="Add tools"
              className={cn(
                'h-8 w-8 flex items-center justify-center rounded-lg transition-colors',
                hasTools
                  ? 'text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                toolPickerOpen && 'bg-accent text-foreground'
              )}
            >
              <Plug size={15} />
            </button>
            <ToolPicker
              open={toolPickerOpen}
              onClose={() => setToolPickerOpen(false)}
              anchorRef={toolPickerAnchorRef}
            />
          </div>

          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !selectedModel ? 'Select a model to start'
              : hasTools ? `Ask anything — ${activePlatforms.join(', ')} active…`
              : 'Message the model…'
            }
            disabled={!selectedModel || isStreaming}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50 min-h-[36px] py-1.5 px-2"
            style={{ maxHeight: '200px', overflow: 'auto' }}
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
        <p className="text-center text-xs text-muted-foreground mt-2">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  )
}
