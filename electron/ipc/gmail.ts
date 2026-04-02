import { ipcMain, BrowserWindow, shell } from 'electron'
import { google } from 'googleapis'
import * as http from 'http'
import Store from 'electron-store'

// ── Store ──────────────────────────────────────────────────────────────────

interface StoreSchema {
  gmail_tokens?: {
    access_token: string
    refresh_token: string
    expiry_date: number
  }
  gmail_client_id?: string
  gmail_client_secret?: string
}

const store = new Store<StoreSchema>()

// ── OAuth Config ──────────────────────────────────────────────────────────
// Users set their own Google Cloud OAuth client credentials via the UI.
// Redirect URI must be registered in Google Cloud Console.

const REDIRECT_URI = 'http://127.0.0.1:3456/oauth/callback'
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels'
]

function getOAuth2Client() {
  const clientId = store.get('gmail_client_id', '')
  const clientSecret = store.get('gmail_client_secret', '')
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
}

function getAuthorizedClient() {
  const oauth2Client = getOAuth2Client()
  const tokens = store.get('gmail_tokens')
  if (!tokens) throw new Error('Gmail not connected')
  oauth2Client.setCredentials(tokens)
  return oauth2Client
}

// ── OAuth Flow ─────────────────────────────────────────────────────────────

function startOAuthFlow(mainWindow: BrowserWindow, clientId: string, clientSecret: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
    const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' })

    // Spin up a one-shot local server to catch the callback
    const server = http.createServer(async (req, res) => {
      if (!req.url?.startsWith('/oauth/callback')) return
      const url = new URL(req.url, 'http://localhost:3456')
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      res.writeHead(200, { 'Content-Type': 'text/html' })
      if (error || !code) {
        res.end('<html><body><h2>Authorization failed. You can close this tab.</h2></body></html>')
        server.close()
        reject(new Error(error ?? 'No code received'))
        return
      }

      res.end('<html><body><h2>Connected! You can close this tab.</h2></body></html>')
      server.close()

      try {
        const { tokens } = await oauth2Client.getToken(code)
        store.set('gmail_tokens', {
          access_token: tokens.access_token ?? '',
          refresh_token: tokens.refresh_token ?? '',
          expiry_date: tokens.expiry_date ?? 0
        })
        resolve()
      } catch (err) {
        reject(err)
      }
    })

    server.listen(3456, '127.0.0.1', () => {
      shell.openExternal(authUrl)
    })

    server.on('error', (err) => {
      reject(new Error(`OAuth server error: ${err.message}`))
    })

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close()
      reject(new Error('OAuth timeout'))
    }, 5 * 60 * 1000)
  })
}

// ── IPC Handlers ──────────────────────────────────────────────────────────

export function registerGmailHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('gmail:connect', async (_, clientId: string, clientSecret: string) => {
    try {
      if (!clientId || !clientSecret) throw new Error('Missing client credentials')
      store.set('gmail_client_id', clientId)
      store.set('gmail_client_secret', clientSecret)
      await startOAuthFlow(mainWindow, clientId, clientSecret)
      return { success: true }
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('gmail:disconnect', () => {
    store.delete('gmail_tokens')
    return { success: true }
  })

  ipcMain.handle('gmail:isConnected', () => {
    const tokens = store.get('gmail_tokens')
    return !!tokens?.access_token
  })

  ipcMain.handle('gmail:listEmails', async (_, opts: {
    maxResults?: number
    pageToken?: string
    query?: string
    labelIds?: string[]
  }) => {
    const auth = getAuthorizedClient()
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.messages.list({
      userId: 'me',
      maxResults: opts.maxResults ?? 20,
      pageToken: opts.pageToken,
      q: opts.query,
      labelIds: opts.labelIds
    })
    return { messages: res.data.messages ?? [], nextPageToken: res.data.nextPageToken }
  })

  ipcMain.handle('gmail:getEmail', async (_, id: string) => {
    const auth = getAuthorizedClient()
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
    return res.data
  })

  ipcMain.handle('gmail:labelEmail', async (_, id: string, addLabelIds: string[], removeLabelIds: string[] = []) => {
    const auth = getAuthorizedClient()
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.messages.modify({ userId: 'me', id, requestBody: { addLabelIds, removeLabelIds } })
    return res.data
  })

  ipcMain.handle('gmail:archiveEmail', async (_, id: string) => {
    const auth = getAuthorizedClient()
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.messages.modify({ userId: 'me', id, requestBody: { removeLabelIds: ['INBOX'] } })
    return res.data
  })

  ipcMain.handle('gmail:trashEmail', async (_, id: string) => {
    const auth = getAuthorizedClient()
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.messages.trash({ userId: 'me', id })
    return res.data
  })

  ipcMain.handle('gmail:markRead', async (_, id: string, read: boolean) => {
    const auth = getAuthorizedClient()
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.messages.modify({
      userId: 'me', id,
      requestBody: read ? { removeLabelIds: ['UNREAD'] } : { addLabelIds: ['UNREAD'] }
    })
    return res.data
  })

  ipcMain.handle('gmail:listLabels', async () => {
    const auth = getAuthorizedClient()
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.labels.list({ userId: 'me' })
    return res.data.labels ?? []
  })

  ipcMain.handle('gmail:createLabel', async (_, name: string, color?: string) => {
    const auth = getAuthorizedClient()
    const gmail = google.gmail({ version: 'v1', auth })
    const res = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
        ...(color ? { color: { backgroundColor: color, textColor: '#ffffff' } } : {})
      }
    })
    return res.data
  })
}
