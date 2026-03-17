import { ipcMain, clipboard, BrowserWindow, Notification } from 'electron'
import { sshManager } from './ssh-manager'
import { parseJobs } from './job-parser'
import { wandbService } from './wandb-service'
import { logStreamer } from './log-streamer'
import { storageService } from './storage-service'
import { getConfig, setConfig, getConfigKey, setConfigKey } from './config-store'
import type { HistoryJob } from './config-store'

const KEYCHAIN_SERVICE = 'PhoenixPanel'
const KEYCHAIN_WANDB   = 'wandb-api-key'
const KEYCHAIN_NOTION  = 'notion-token'

let _cachedJobs: import('./job-parser').Job[] = []
export function getCachedJobs() { return _cachedJobs }

const _prevJobStates = new Map<string, string>()

function normalizeState(state: string): HistoryJob['state'] | null {
  if (state.startsWith('COMPLETED')) return 'COMPLETED'
  if (state.startsWith('FAILED')) return 'FAILED'
  if (state.startsWith('CANCELLED')) return 'CANCELLED'
  return null
}

function parseEndTime(end: string): string {
  if (!end || end === 'Unknown') return new Date().toISOString()
  try {
    // sacct End format: 2026-03-17T14:23:45
    return new Date(end).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function parseSacctRow(raw: string, fallback: import('./job-parser').Job): HistoryJob | null {
  const lines = raw.split('\n').filter(l => l.trim())
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 6) continue
    const [id, name, partition, state, elapsed, end] = parts
    if (id.includes('.')) continue
    const normalState = normalizeState(state)
    if (!normalState) continue
    return { id, name: name || fallback.name, partition: partition || fallback.partition, gpuLabel: fallback.gpuLabel || '', state: normalState, elapsed, endTime: parseEndTime(end) }
  }
  return null
}

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

      // Detect disappeared jobs and record them to history
      const disappeared = _cachedJobs.filter(j => !jobs.find(nj => nj.id === j.id))
      if (disappeared.length > 0) {
        const existing = await getConfigKey('jobHistory')
        let history = [...existing]
        for (const dj of disappeared) {
          try {
            const sacctRaw = await sshManager.executeCommand(
              `sacct -j ${dj.id} --format=JobID,JobName,Partition,State,Elapsed,End --noheader -n`
            )
            const parsed = parseSacctRow(sacctRaw, dj)
            if (parsed) {
              history = history.filter(h => h.id !== parsed.id)
              history.unshift(parsed)
              history = history.slice(0, 6)
            }
          } catch { /* ignore individual lookup errors */ }
        }
        await setConfigKey('jobHistory', history)
      }

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

  ipcMain.handle('jobs:init-history', async () => {
    try {
      const username = sshManager.getUsername()
      const raw = await sshManager.executeCommand(
        `sacct -u ${username} --format=JobID,JobName,Partition,State,Elapsed,End --noheader -n --starttime=now-7days`
      )
      const lines = raw.split('\n').filter(l => l.trim())
      const fetched: HistoryJob[] = []
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 6) continue
        const [id, name, partition, state, elapsed, end] = parts
        // Skip sub-jobs and non-terminal states
        if (id.includes('.')) continue
        if (['RUNNING', 'PENDING', 'batch', 'extern'].some(s => state.includes(s))) continue
        const normalState = normalizeState(state)
        if (!normalState) continue
        fetched.push({ id, name, partition, gpuLabel: '', state: normalState, elapsed, endTime: parseEndTime(end) })
      }
      // Take latest 6
      const fresh = fetched.slice(0, 6)
      const existing = await getConfigKey('jobHistory')
      // Merge: fresh entries win, dedup by id, keep at most 6 sorted by endTime desc
      const merged = [...fresh]
      for (const h of existing) {
        if (!merged.find(m => m.id === h.id)) merged.push(h)
      }
      merged.sort((a, b) => b.endTime.localeCompare(a.endTime))
      const final = merged.slice(0, 6)
      await setConfigKey('jobHistory', final)
      return final
    } catch (err: unknown) {
      return []
    }
  })

  ipcMain.handle('jobs:get-history', async () => {
    return getConfigKey('jobHistory')
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
