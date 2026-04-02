import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { registerOllamaHandlers } from './ipc/ollama'
import { registerProcessHandlers } from './ipc/process'
import { registerRegistryHandlers } from './ipc/registry'
import { registerNimHandlers } from './ipc/nim'
import { registerClaudeHandlers } from './ipc/claude'
import { registerNotifyHandlers } from './ipc/notify'
import { registerScreenHandlers } from './ipc/screen'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#080d1a',
      symbolColor: '#94a3b8',
      height: 40
    },
    backgroundColor: '#080d1a',
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()
  registerOllamaHandlers()
  registerProcessHandlers(mainWindow!)
  registerRegistryHandlers(mainWindow!)
  registerNimHandlers(mainWindow!)
  registerClaudeHandlers(mainWindow!)
  registerNotifyHandlers()
  registerScreenHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.restore()
  else mainWindow?.maximize()
})
ipcMain.on('window:close', () => mainWindow?.close())
