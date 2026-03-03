import { ipcMain, clipboard, BrowserWindow, Notification } from 'electron'
import { sshManager } from './ssh-manager'
import { parseJobs } from './job-parser'
import { wandbService } from './wandb-service'
import { logStreamer } from './log-streamer'
import { storageService } from './storage-service'
import { getConfig, setConfig, getConfigKey, setConfigKey } from './config-store'

const KEYCHAIN_SERVICE = 'PhoenixPanel'
const KEYCHAIN_WANDB   = 'wandb-api-key'
const KEYCHAIN_NOTION  = 'notion-token'

let _cachedJobs: import('./job-parser').Job[] = []
export function getCachedJobs() { return _cachedJobs }

const _prevJobStates = new Map<string, string>()

export function registerIpcHandlers(getWin: () => BrowserWindow | null) {
  // ── SSH ──────────────────────────────────────────────────────────────────

  ipcMain.handle('ssh:status', () => ({
    status: sshManager.getStatus(),
    host: sshManager.getHost(),
    username: sshManager.getUsername(),
  }))

  ipcMain.handle('ssh:test-connection', async () => {
    try {
      const result = await sshManager.executeCommand('echo ok')
      return { ok: true, message: result.trim() }
    } catch (err: unknown) {
      return { ok: false, message: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── Jobs ─────────────────────────────────────────────────────────────────

  ipcMain.handle('jobs:get-all', async () => {
    try {
      const username = sshManager.getUsername()
      const raw = await sshManager.executeCommand(
        `squeue -u ${username} --format='%i|%j|%T|%M|%P|%C|%b' --noheader`
      )
      const jobs = parseJobs(raw)

      // Notify on job state transitions
      for (const job of jobs) {
        const prev = _prevJobStates.get(job.id)
        if (prev && prev !== job.state) {
          if (job.state === 'COMPLETED') {
            new Notification({ title: '✓ Job 完成', body: `${job.name} (#${job.id})` }).show()
          } else if (job.state === 'FAILED') {
            new Notification({ title: '✗ Job 失败', body: `${job.name} (#${job.id})` }).show()
          } else if (job.state === 'CANCELLED') {
            new Notification({ title: '⏸ Job 已取消', body: `${job.name} (#${job.id})` }).show()
          }
        }
        _prevJobStates.set(job.id, job.state)
      }

      _cachedJobs = jobs
      return { ok: true, jobs }
    } catch (err: unknown) {
      return { ok: false, jobs: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── WandB ─────────────────────────────────────────────────────────────────

  ipcMain.handle('wandb:get-runs', async () => wandbService.fetchNow())

  ipcMain.handle('wandb:get-status', () => ({
    error: wandbService.getLastError(),
    lastUpdated: wandbService.getLastUpdated()?.toISOString() ?? null,
    configured: !!wandbService.getConfig()?.apiKey,
  }))

  ipcMain.handle('wandb:set-config', async (_event, { apiKey, entity, project }: { apiKey: string; entity: string; project: string }) => {
    const keytar = await import('keytar').then(m => m.default ?? m)
    await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_WANDB, apiKey)
    await setConfig({ wandb: { entity, project } })
    wandbService.configure({ apiKey, entity, project })
    wandbService.stopPolling()
    wandbService.startPolling()
    return { ok: true }
  })

  ipcMain.handle('wandb:get-config', async () => {
    const keytar = await import('keytar').then(m => m.default ?? m)
    const apiKey = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_WANDB) ?? ''
    const cfg = await getConfigKey('wandb')
    return { apiKey, entity: cfg.entity, project: cfg.project }
  })

  // ── Logs ─────────────────────────────────────────────────────────────────

  ipcMain.handle('logs:start-stream', async (_event, { jobId, filePath }: { jobId: string; filePath: string }) => {
    const win = getWin()
    if (!win) return { ok: false, error: '窗口未就绪' }
    return logStreamer.startStream(jobId, filePath, win)
  })

  ipcMain.handle('logs:stop-stream', async () => { await logStreamer.stopStream() })
  ipcMain.handle('logs:active-job', () => logStreamer.getActiveJobId())

  ipcMain.handle('logs:get-progress', async (_event, { filePath }: { filePath: string }) => {
    try {
      const output = await sshManager.executeCommand(`tail -n 100 ${filePath}`)
      // Find last occurrence of progress pattern, e.g. "Epoch 11/90" or "[45/90]"
      const matches = [...output.matchAll(/(?:Epoch\s+|\[)(\d+)\/(\d+)/g)]
      if (matches.length === 0) return { ok: true, progress: null }
      const last = matches[matches.length - 1]
      return { ok: true, progress: { current: parseInt(last[1]), total: parseInt(last[2]) } }
    } catch {
      return { ok: false, progress: null }
    }
  })

  // ── Storage ───────────────────────────────────────────────────────────────

  ipcMain.handle('storage:get-quota', async () => {
    try {
      const cfg = await getConfigKey('storage')
      return await storageService.fetch(cfg.scratchPath, cfg.homeLimitGB, cfg.scratchLimitGB)
    } catch (err: unknown) {
      return { home: null, scratch: null, fetchedAt: new Date().toISOString(), error: String(err) }
    }
  })

  ipcMain.handle('storage:get-cache', () => storageService.getCache())

  // ── Config (Preferences) ──────────────────────────────────────────────────

  ipcMain.handle('config:get', async () => getConfig())

  ipcMain.handle('config:set', async (_event, partial: Record<string, unknown>) => {
    await setConfig(partial as never)
    // Apply SSH changes immediately
    if (partial.ssh) {
      const s = partial.ssh as { host?: string; username?: string }
      if (s.host || s.username) {
        sshManager.configure(s.host ?? sshManager.getHost(), s.username)
      }
    }
    return { ok: true }
  })

  ipcMain.handle('config:get-secrets', async () => {
    const keytar = await import('keytar').then(m => m.default ?? m)
    const wandbKey  = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_WANDB) ?? ''
    const notionKey = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_NOTION) ?? ''
    return { wandbKey, notionKey }
  })

  ipcMain.handle('config:set-secret', async (_event, { key, value }: { key: 'wandb' | 'notion'; value: string }) => {
    const keytar = await import('keytar').then(m => m.default ?? m)
    const keychainKey = key === 'wandb' ? KEYCHAIN_WANDB : KEYCHAIN_NOTION
    await keytar.setPassword(KEYCHAIN_SERVICE, keychainKey, value)
    return { ok: true }
  })

  ipcMain.handle('config:test-wandb', async () => {
    try {
      const keytar = await import('keytar').then(m => m.default ?? m)
      const apiKey = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_WANDB) ?? ''
      if (!apiKey) return { ok: false, message: '未设置 API Key' }
      const basicAuth = Buffer.from(`api:${apiKey}`).toString('base64')
      const resp = await fetch('https://api.wandb.ai/graphql', {
        method: 'POST',
        headers: { Authorization: `Basic ${basicAuth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ viewer { username } }' }),
        signal: AbortSignal.timeout(8000),
      })
      const json = await resp.json() as { data?: { viewer?: { username: string } } }
      const username = json.data?.viewer?.username
      return username ? { ok: true, message: `已连接：${username}` } : { ok: false, message: '验证失败' }
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : '网络错误' }
    }
  })

  // ── Quick Commands ─────────────────────────────────────────────────────────

  ipcMain.handle('commands:get-custom', async () => getConfigKey('customCommands'))

  ipcMain.handle('commands:add', async (_event, cmd: { label: string; command: string }) => {
    const existing = await getConfigKey('customCommands')
    const newCmd = { id: Date.now().toString(), ...cmd }
    await setConfigKey('customCommands', [...existing, newCmd])
    return newCmd
  })

  ipcMain.handle('commands:delete', async (_event, id: string) => {
    const existing = await getConfigKey('customCommands')
    await setConfigKey('customCommands', existing.filter(c => c.id !== id))
    return { ok: true }
  })

  // ── Clipboard ─────────────────────────────────────────────────────────────

  ipcMain.handle('clipboard:write', (_event, text: string) => { clipboard.writeText(text) })

  // ── Tray badge ────────────────────────────────────────────────────────────

  ipcMain.on('tray:update-badge', (_event, { runningCount, failedCount }: { runningCount: number; failedCount: number }) => {
    // Handled in main.ts via tray reference
    getWin()?.webContents.emit('tray-badge', runningCount, failedCount)
  })
}
