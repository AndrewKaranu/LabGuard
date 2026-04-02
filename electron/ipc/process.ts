import { ipcMain, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'

interface RunningProcess {
  id: string
  process: ChildProcess
  command: string
  workDir: string
}

const processes = new Map<string, RunningProcess>()

export function registerProcessHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('lab:spawn', (_, command: string, workDir: string) => {
    const id = randomUUID()

    const child = spawn(command, {
      cwd: workDir || process.cwd(),
      shell: true,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        FORCE_COLOR: '1',
        TERM: 'xterm-256color',
        COLUMNS: '120'
      }
    })

    processes.set(id, { id, process: child, command, workDir })

    child.stdout?.on('data', (data: Buffer) => {
      mainWindow.webContents.send('lab:stdout', id, data.toString())
    })

    child.stderr?.on('data', (data: Buffer) => {
      mainWindow.webContents.send('lab:stderr', id, data.toString())
    })

    child.on('exit', (code, signal) => {
      processes.delete(id)
      mainWindow.webContents.send('lab:exit', id, code, signal)
    })

    child.on('error', (err) => {
      mainWindow.webContents.send('lab:stderr', id, `Process error: ${err.message}\n`)
      mainWindow.webContents.send('lab:exit', id, 1, null)
    })

    return { id, pid: child.pid }
  })

  ipcMain.handle('lab:stop', (_, id: string) => {
    const running = processes.get(id)
    if (!running) return { success: false, error: 'Process not found' }
    running.process.kill('SIGTERM')
    setTimeout(() => {
      if (processes.has(id)) running.process.kill('SIGKILL')
    }, 3000)
    return { success: true }
  })

  ipcMain.handle('lab:listProcesses', () => {
    return Array.from(processes.values()).map(({ id, command, workDir }) => ({ id, command, workDir }))
  })
}
