export interface OllamaTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string; items?: { type: string } }>
      required?: string[]
    }
  }
}

export const GMAIL_TOOLS: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'list_emails',
      description: 'List emails from Gmail. Use a query to filter by sender, subject, read status, etc.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Gmail search query e.g. "is:unread", "from:boss@example.com", "subject:invoice"' },
          maxResults: { type: 'number', description: 'How many emails to return (default 10, max 20)' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_email',
      description: 'Get the full content of a specific email by its ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The email ID from list_emails' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'archive_email',
      description: 'Archive an email (remove from inbox without deleting).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The email ID to archive' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'trash_email',
      description: 'Move an email to trash.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The email ID to trash' }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'mark_read',
      description: 'Mark an email as read or unread.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The email ID' },
          read: { type: 'boolean', description: 'true to mark as read, false to mark as unread' }
        },
        required: ['id', 'read']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'label_email',
      description: 'Apply or remove labels on an email.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The email ID' },
          addLabels: { type: 'array', description: 'Label names to add (will be created if they do not exist)', items: { type: 'string' } },
          removeLabels: { type: 'array', description: 'Label names to remove', items: { type: 'string' } }
        },
        required: ['id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_labels',
      description: 'List all Gmail labels in the account.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
]

export const FILESYSTEM_TOOLS: OllamaTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_folder_summary',
      description: 'Get an overview of the connected folder — total file count, folder count, and breakdown by file type.',
      parameters: { type: 'object', properties: {}, required: [] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and subfolders at a path within the connected folder.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path within the connected folder. Leave empty for the root.' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_folder',
      description: 'Create a new subfolder inside the connected folder.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path for the new folder, e.g. "Documents/2024"' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_files',
      description: 'Move one or more files into a destination subfolder (folder is created if it does not exist).',
      parameters: {
        type: 'object',
        properties: {
          files: { type: 'array', description: 'Relative paths of files to move', items: { type: 'string' } },
          destination: { type: 'string', description: 'Relative path of the destination folder' }
        },
        required: ['files', 'destination']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'rename_item',
      description: 'Rename a file or folder.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative path of the file or folder to rename' },
          new_name: { type: 'string', description: 'The new name (just the filename, not a full path)' }
        },
        required: ['path', 'new_name']
      }
    }
  }
]

/** Returns tools for explicitly activated platforms (must be both connected and selected by user) */
export function getActiveTools(
  connections: { id: string; connected: boolean }[],
  activePlatforms: string[]
): OllamaTool[] {
  const tools: OllamaTool[] = []
  const isActive = (id: string) =>
    activePlatforms.includes(id) && connections.find(c => c.id === id)?.connected
  if (isActive('gmail')) tools.push(...GMAIL_TOOLS)
  if (isActive('filesystem')) tools.push(...FILESYSTEM_TOOLS)
  return tools
}

/** System message using prompt-based tool calling (works with every model) */
export function buildToolSystemMessage(tools: OllamaTool[]): string {
  if (tools.length === 0) return ''

  const toolDefs = tools.map(t => {
    const params = Object.entries(t.function.parameters.properties)
      .map(([k, v]) => `    ${k} (${v.type}): ${v.description}`)
      .join('\n')
    const required = t.function.parameters.required ?? []
    return `• ${t.function.name}${required.length ? ' [required: ' + required.join(', ') + ']' : ''}
  ${t.function.description}
${params ? 'Parameters:\n' + params : '  No parameters required.'}`
  }).join('\n\n')

  return `You are LabGuard, an AI assistant with direct access to the user's connected services.

AVAILABLE TOOLS:
${toolDefs}

HOW TO CALL A TOOL:
Respond with ONLY this JSON on a single line — no markdown, no extra text:
{"tool":"tool_name","args":{"param":"value"}}

CRITICAL RULES:
1. READ vs ACTION — only call action tools (trash_email, archive_email, label_email, mark_read) if the user EXPLICITLY asked you to perform that action. Questions like "what was my last email?" or "show me my inbox" are READ-ONLY — use list_emails or get_email, then answer. Never trash, archive, or label anything unless directly instructed.
2. STOP after you have enough information. Once a tool returns the data needed to answer the question, write your final response in plain text. Do not call more tools "just in case".
3. Never say you cannot access email. You have direct access via the tools above.
4. Your final response must be plain text — never end a conversation with JSON.`
}
