/**
 * Executes a tool call from the model and returns a plain-text result
 * to feed back as a 'tool' role message.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case 'list_emails': {
        const result = await window.api.gmail.listEmails({
          query: args.query as string | undefined,
          maxResults: (args.maxResults as number | undefined) ?? 10
        })
        const ids = (result.messages ?? []) as { id: string }[]
        if (ids.length === 0) return 'No emails found.'
        // Fetch summaries for each
        const summaries = await Promise.all(
          ids.slice(0, 15).map(async ({ id }) => {
            const msg = await window.api.gmail.getEmail(id)
            const headers: { name: string; value: string }[] = msg.payload?.headers ?? []
            const subject = headers.find(h => h.name === 'Subject')?.value ?? '(no subject)'
            const from = headers.find(h => h.name === 'From')?.value ?? 'unknown'
            const isUnread = msg.labelIds?.includes('UNREAD') ?? false
            return `ID:${id} | From: ${from} | Subject: ${subject} | Unread: ${isUnread} | Snippet: ${msg.snippet ?? ''}`
          })
        )
        return summaries.join('\n')
      }

      case 'get_email': {
        const msg = await window.api.gmail.getEmail(args.id as string)
        const headers: { name: string; value: string }[] = msg.payload?.headers ?? []
        const subject = headers.find(h => h.name === 'Subject')?.value ?? '(no subject)'
        const from = headers.find(h => h.name === 'From')?.value ?? 'unknown'
        const date = headers.find(h => h.name === 'Date')?.value ?? ''
        const body = extractBody(msg)
        return `Subject: ${subject}\nFrom: ${from}\nDate: ${date}\n\n${body}`
      }

      case 'archive_email': {
        await window.api.gmail.archiveEmail(args.id as string)
        return `Email ${args.id} archived.`
      }

      case 'trash_email': {
        await window.api.gmail.trashEmail(args.id as string)
        return `Email ${args.id} moved to trash.`
      }

      case 'mark_read': {
        await window.api.gmail.markRead(args.id as string, args.read as boolean)
        return `Email ${args.id} marked as ${args.read ? 'read' : 'unread'}.`
      }

      case 'label_email': {
        const labels = await window.api.gmail.listLabels()
        const addNames: string[] = (args.addLabels as string[] | undefined) ?? []
        const removeNames: string[] = (args.removeLabels as string[] | undefined) ?? []

        const resolveOrCreate = async (name: string) => {
          const existing = labels.find(l => l.name.toLowerCase() === name.toLowerCase())
          if (existing) return existing.id
          const created = await window.api.gmail.createLabel(name)
          return created.id
        }

        const addIds = await Promise.all(addNames.map(resolveOrCreate))
        const removeIds = removeNames
          .map(n => labels.find(l => l.name.toLowerCase() === n.toLowerCase())?.id)
          .filter(Boolean) as string[]

        await window.api.gmail.labelEmail(args.id as string, addIds, removeIds)
        return `Labels updated on email ${args.id}. Added: [${addNames.join(', ')}] Removed: [${removeNames.join(', ')}]`
      }

      case 'list_labels': {
        const labels = await window.api.gmail.listLabels()
        return labels.map(l => `${l.name} (ID: ${l.id})`).join('\n')
      }

      // ── Filesystem tools ──────────────────────────────────────────────────

      case 'get_folder_summary': {
        const summary = await window.api.fs.getFolderSummary()
        const byExt = summary.byExtension
          .slice(0, 10)
          .map(([ext, count]) => `  ${ext}: ${count} file${count !== 1 ? 's' : ''}`)
          .join('\n')
        return `Folder: ${summary.folderPath}\nTotal files: ${summary.totalFiles} | Subfolders: ${summary.totalFolders}\n\nBy type:\n${byExt}`
      }

      case 'list_files': {
        const entries = await window.api.fs.listFiles(args.path as string | undefined)
        if (entries.length === 0) return 'Folder is empty.'
        const lines = entries.map(e => {
          if (e.isDirectory) return `[DIR]  ${e.name}/`
          const size = e.size != null ? `${(e.size / 1024).toFixed(1)} KB` : ''
          return `[${(e.extension ?? 'file').toUpperCase().padEnd(6)}] ${e.name}  ${size}`
        })
        return lines.join('\n')
      }

      case 'create_folder': {
        const result = await window.api.fs.createFolder(args.path as string)
        return `Created folder: ${result.path}`
      }

      case 'move_files': {
        const results = await window.api.fs.moveFiles(
          args.files as string[],
          args.destination as string
        )
        const ok = results.filter(r => r.success).map(r => r.file)
        const fail = results.filter(r => !r.success)
        let out = `Moved ${ok.length} file${ok.length !== 1 ? 's' : ''} to "${args.destination}".`
        if (fail.length > 0) out += `\nFailed: ${fail.map(r => `${r.file} (${r.error})`).join(', ')}`
        return out
      }

      case 'rename_item': {
        const result = await window.api.fs.renameItem(args.path as string, args.new_name as string)
        return `Renamed to: ${result.newPath}`
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (err: unknown) {
    return `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`
  }
}

/** Extract plain text body from a Gmail message */
function extractBody(msg: GmailMessage): string {
  const findText = (parts: GmailMessagePart[] | undefined): string => {
    if (!parts) return ''
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'))
      }
      const nested = findText(part.parts)
      if (nested) return nested
    }
    return ''
  }

  if (msg.payload?.body?.data) {
    return atob(msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))
  }
  return findText(msg.payload?.parts) || msg.snippet || '(no body)'
}
