import { ipcMain, dialog, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import Store from 'electron-store'

interface StoreSchema {
  fs_folder_path?: string
}

const store = new Store<StoreSchema>({ name: 'filesystem' })

// ── Safety ─────────────────────────────────────────────────────────────────

function getBase(): string {
  const p = store.get('fs_folder_path') as string | undefined
  if (!p) throw new Error('No folder connected. Ask the user to connect a folder first.')
  return p
}

function assertSafe(base: string, target: string) {
  const resolved = path.resolve(target)
  const resolvedBase = path.resolve(base)
  if (resolved !== resolvedBase && !resolved.startsWith(resolvedBase + path.sep)) {
    throw new Error('Path is outside the connected folder')
  }
}

function resolveSafe(base: string, relative: string): string {
  const abs = path.resolve(base, relative)
  assertSafe(base, abs)
  return abs
}

// ── IPC Handlers ──────────────────────────────────────────────────────────

export function registerFilesystemHandlers(mainWindow: BrowserWindow) {
  // Open native folder picker, return selected path
  ipcMain.handle('fs:selectFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose a folder to connect'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:connect', async (_, folderPath: string) => {
    if (!fs.existsSync(folderPath)) throw new Error('Folder does not exist')
    store.set('fs_folder_path', folderPath)
    return { success: true, path: folderPath }
  })

  ipcMain.handle('fs:disconnect', () => {
    store.delete('fs_folder_path')
    return { success: true }
  })

  ipcMain.handle('fs:getConnectedFolder', () => {
    return (store.get('fs_folder_path') as string | undefined) ?? null
  })

  // List files and folders at a relative path within the connected folder
  ipcMain.handle('fs:listFiles', (_, relativePath = '') => {
    const base = getBase()
    const target = relativePath ? resolveSafe(base, relativePath) : base
    const entries = fs.readdirSync(target, { withFileTypes: true })
    return entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => {
        const abs = path.join(target, e.name)
        const stat = fs.statSync(abs)
        return {
          name: e.name,
          relativePath: path.relative(base, abs).replace(/\\/g, '/'),
          isDirectory: e.isDirectory(),
          size: e.isFile() ? stat.size : null,
          extension: e.isFile() ? path.extname(e.name).slice(1).toLowerCase() || 'file' : null,
          modified: stat.mtime.toISOString()
        }
      })
  })

  // Recursively summarise folder: count files by extension
  ipcMain.handle('fs:getFolderSummary', () => {
    const base = getBase()
    const counts: Record<string, number> = {}
    let totalFiles = 0
    let totalFolders = 0

    function walk(dir: string, depth = 0) {
      if (depth > 4) return
      const entries = fs.readdirSync(dir, { withFileTypes: true }).filter(e => !e.name.startsWith('.'))
      for (const e of entries) {
        if (e.isDirectory()) {
          totalFolders++
          walk(path.join(dir, e.name), depth + 1)
        } else {
          totalFiles++
          const ext = path.extname(e.name).slice(1).toLowerCase() || 'no extension'
          counts[ext] = (counts[ext] ?? 0) + 1
        }
      }
    }

    walk(base)
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return { totalFiles, totalFolders, byExtension: sorted, folderPath: base }
  })

  ipcMain.handle('fs:createFolder', (_, relativePath: string) => {
    const base = getBase()
    const abs = resolveSafe(base, relativePath)
    fs.mkdirSync(abs, { recursive: true })
    return { success: true, path: path.relative(base, abs).replace(/\\/g, '/') }
  })

  // Move one or more files into a destination folder (created if needed)
  ipcMain.handle('fs:moveFiles', (_, files: string[], destRelative: string) => {
    const base = getBase()
    const destAbs = resolveSafe(base, destRelative)
    if (!fs.existsSync(destAbs)) fs.mkdirSync(destAbs, { recursive: true })

    const results: { file: string; success: boolean; error?: string }[] = []
    for (const rel of files) {
      try {
        const srcAbs = resolveSafe(base, rel)
        const name = path.basename(srcAbs)
        let destFile = path.join(destAbs, name)
        // Avoid overwrite — append suffix if needed
        let suffix = 1
        while (fs.existsSync(destFile)) {
          const ext = path.extname(name)
          const base2 = path.basename(name, ext)
          destFile = path.join(destAbs, `${base2}_${suffix}${ext}`)
          suffix++
        }
        fs.renameSync(srcAbs, destFile)
        results.push({ file: rel, success: true })
      } catch (err: unknown) {
        results.push({ file: rel, success: false, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return results
  })

  ipcMain.handle('fs:renameItem', (_, relativePath: string, newName: string) => {
    const base = getBase()
    const srcAbs = resolveSafe(base, relativePath)
    const destAbs = path.join(path.dirname(srcAbs), newName)
    assertSafe(base, destAbs)
    fs.renameSync(srcAbs, destAbs)
    return { success: true, newPath: path.relative(base, destAbs).replace(/\\/g, '/') }
  })
}
