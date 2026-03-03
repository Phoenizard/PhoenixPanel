import { app, BrowserWindow, Tray, nativeImage, screen, ipcMain, type NativeImage } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import http from 'node:http'
import { registerIpcHandlers, getCachedJobs } from './ipc-handlers'
import { sshManager } from './ssh-manager'
import { wandbService } from './wandb-service'
import { logStreamer } from './log-streamer'
import { getConfigKey } from './config-store'

const CLI_PORT = 47890

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

let win: BrowserWindow | null
let tray: Tray | null

function createTrayIcon(): NativeImage {
  // Generate a 16x16 gray circle icon dynamically (no image file needed)
  const size = 16
  const canvas = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx
      const dy = y - cy
      const idx = (y * size + x) * 4
      if (dx * dx + dy * dy <= r * r) {
        canvas[idx] = 180     // R
        canvas[idx + 1] = 180 // G
        canvas[idx + 2] = 180 // B
        canvas[idx + 3] = 255 // A
      } else {
        canvas[idx + 3] = 0   // transparent
      }
    }
  }

  return nativeImage.createFromBuffer(canvas, { width: size, height: size })
}

function positionWindow(win: BrowserWindow, tray: Tray) {
  const trayBounds = tray.getBounds()
  const winBounds = win.getBounds()
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y })

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2)
  let y = Math.round(trayBounds.y + trayBounds.height + 4)

  const { bounds } = display
  x = Math.max(bounds.x, Math.min(x, bounds.x + bounds.width - winBounds.width))
  y = Math.max(bounds.y, Math.min(y, bounds.y + bounds.height - winBounds.height))

  win.setPosition(x, y, false)
}

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 680,
    show: false,
    frame: false,
    transparent: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.on('blur', () => {
    logStreamer.stopStream()
    win?.hide()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function createTray() {
  const icon = createTrayIcon()
  tray = new Tray(icon)
  tray.setToolTip('PhoenixPanel')

  tray.on('click', () => {
    if (!win) return
    if (win.isVisible()) {
      win.hide()
    } else {
      positionWindow(win, tray!)
      win.show()
      win.focus()
    }
  })
}

app.on('window-all-closed', () => {
  // Keep running in tray — do not quit on window close
})

// Tray badge update — called from renderer via IPC after each job poll
ipcMain.on('tray:update-badge', (_event, { runningCount, failedCount }: { runningCount: number; failedCount: number }) => {
  if (!tray) return
  if (failedCount > 0) {
    tray.setTitle(`${failedCount}`)
  } else if (runningCount > 0) {
    tray.setTitle(`${runningCount}`)
  } else {
    tray.setTitle('')
  }
})

function startCliServer() {
  const server = http.createServer((_req, res) => {
    const jobs = getCachedJobs()
    const runs = wandbService.getLastRuns()
    const lastUpdated = wandbService.getLastUpdated()?.toISOString() ?? null

    const body = JSON.stringify({ jobs, runs, lastUpdated })
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(body)
  })
  server.listen(CLI_PORT, '127.0.0.1')
}

app.whenReady().then(() => {
  app.dock?.hide()
  registerIpcHandlers(() => win)
  createWindow()
  createTray()
  startCliServer()
  sshManager.connect().catch(() => { /* retry is scheduled internally */ })

  // Load saved WandB config from Keychain + config-store and start polling
  Promise.all([
    import('keytar').then(m => (m.default ?? m).getPassword('PhoenixPanel', 'wandb-api-key')),
    getConfigKey('wandb'),
  ]).then(([apiKey, wandbCfg]) => {
    if (apiKey) {
      wandbService.configure({ apiKey, entity: wandbCfg.entity, project: wandbCfg.project })
      wandbService.startPolling()
    }
  })
})
