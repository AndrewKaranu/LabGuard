import { ipcMain } from 'electron'
import Store from 'electron-store'
import nodemailer from 'nodemailer'

interface NotifyStore {
  enabled: boolean
  smtpHost: string
  smtpPort: number
  smtpUser: string
  smtpPassword: string
  fromEmail: string
  fromName: string
  toEmail: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildHtml(subject: string, text: string): string {
  const lines = text.split(/\r?\n/).map((l) => escapeHtml(l))
  const body = lines.map((l) => `<div>${l || '&nbsp;'}</div>`).join('')

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b1220;color:#e2e8f0;font-family:Segoe UI,Arial,sans-serif;">
    <div style="max-width:680px;margin:24px auto;padding:0 12px;">
      <div style="border:1px solid #1e293b;border-radius:12px;overflow:hidden;background:#0f172a;">
        <div style="padding:12px 16px;background:#111827;border-bottom:1px solid #1e293b;">
          <div style="font-size:12px;color:#94a3b8;letter-spacing:.08em;text-transform:uppercase;">LabGuard Alert</div>
          <div style="font-size:18px;font-weight:700;color:#f8fafc;margin-top:4px;">${escapeHtml(subject)}</div>
        </div>
        <div style="padding:16px 16px 18px 16px;line-height:1.6;font-size:14px;">${body}</div>
      </div>
    </div>
  </body>
</html>`
}

const store = new Store<NotifyStore>({
  name: 'notify',
  defaults: {
    enabled: true,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpUser: 'andrewkaranu03@gmail.com',
    smtpPassword: 'xzar osrb tubk uqpk',
    fromEmail: 'noreply@labguard.com',
    fromName: 'LabGuard',
    toEmail: 'andrewkaranu03@gmail.com'
  }
})

function getConfig() {
  return {
    enabled: store.get('enabled', true),
    smtpHost: store.get('smtpHost', 'smtp.gmail.com'),
    smtpPort: store.get('smtpPort', 587),
    smtpUser: store.get('smtpUser', ''),
    smtpPassword: store.get('smtpPassword', ''),
    fromEmail: store.get('fromEmail', ''),
    fromName: store.get('fromName', 'LabGuard'),
    toEmail: store.get('toEmail', '')
  }
}

async function sendEmail(subject: string, text: string, html?: string) {
  const cfg = getConfig()
  if (!cfg.enabled) return { success: false, error: 'Email notifications are disabled' }
  if (!cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPassword || !cfg.toEmail) {
    return { success: false, error: 'SMTP config is incomplete' }
  }

  try {
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpPort === 465,
      auth: {
        user: cfg.smtpUser,
        pass: cfg.smtpPassword
      }
    })

    const from = cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail

    await transporter.sendMail({
      from,
      to: cfg.toEmail,
      subject,
      text,
      html: html ?? buildHtml(subject, text)
    })

    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function registerNotifyHandlers() {
  ipcMain.handle('notify:getConfig', () => getConfig())

  ipcMain.handle('notify:setConfig', (_, patch: Partial<NotifyStore>) => {
    if (typeof patch.enabled === 'boolean') store.set('enabled', patch.enabled)
    if (typeof patch.smtpHost === 'string') store.set('smtpHost', patch.smtpHost.trim())
    if (typeof patch.smtpPort === 'number' && patch.smtpPort > 0) store.set('smtpPort', patch.smtpPort)
    if (typeof patch.smtpUser === 'string') store.set('smtpUser', patch.smtpUser.trim())
    if (typeof patch.smtpPassword === 'string') store.set('smtpPassword', patch.smtpPassword)
    if (typeof patch.fromEmail === 'string') store.set('fromEmail', patch.fromEmail.trim())
    if (typeof patch.fromName === 'string') store.set('fromName', patch.fromName.trim())
    if (typeof patch.toEmail === 'string') store.set('toEmail', patch.toEmail.trim())

    return { success: true, config: getConfig() }
  })

  ipcMain.handle('notify:sendTest', async () => {
    return sendEmail(
      'LabGuard Test Notification',
      'This is a test email from LabGuard SMTP notifications.\nIf you received this, SMTP settings are working.'
    )
  })

  ipcMain.handle('notify:sendAlert', async (_, payload: { subject: string; text: string; html?: string }) => {
    return sendEmail(payload.subject, payload.text, payload.html)
  })
}
