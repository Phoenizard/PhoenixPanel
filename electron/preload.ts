import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld('phoenixAPI', {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.off(channel, wrapped)
  },

  ssh: {
    getStatus:      () => ipcRenderer.invoke('ssh:status'),
    testConnection: () => ipcRenderer.invoke('ssh:test-connection'),
  },

  jobs: {
    getAll: () => ipcRenderer.invoke('jobs:get-all'),
  },

  wandb: {
    getRuns:     () => ipcRenderer.invoke('wandb:get-runs'),
    getStatus:   () => ipcRenderer.invoke('wandb:get-status'),
    setConfig:   (cfg: { apiKey: string; entity: string; project: string }) => ipcRenderer.invoke('wandb:set-config', cfg),
    getConfig:   () => ipcRenderer.invoke('wandb:get-config'),
  },

  logs: {
    startStream: (jobId: string, filePath: string) => ipcRenderer.invoke('logs:start-stream', { jobId, filePath }),
    stopStream:  () => ipcRenderer.invoke('logs:stop-stream'),
    onLine:  (cb: (jobId: string, lines: string[]) => void) => {
      const fn = (_e: Electron.IpcRendererEvent, d: { jobId: string; lines: string[] }) => cb(d.jobId, d.lines)
      ipcRenderer.on('logs:line', fn); return () => ipcRenderer.off('logs:line', fn)
    },
    onError: (cb: (jobId: string, message: string) => void) => {
      const fn = (_e: Electron.IpcRendererEvent, d: { jobId: string; message: string }) => cb(d.jobId, d.message)
      ipcRenderer.on('logs:error', fn); return () => ipcRenderer.off('logs:error', fn)
    },
    onEnded: (cb: (jobId: string) => void) => {
      const fn = (_e: Electron.IpcRendererEvent, d: { jobId: string }) => cb(d.jobId)
      ipcRenderer.on('logs:ended', fn); return () => ipcRenderer.off('logs:ended', fn)
    },
    getProgress: (filePath: string) => ipcRenderer.invoke('logs:get-progress', { filePath }),
  },

  storage: {
    getQuota: () => ipcRenderer.invoke('storage:get-quota'),
    getCache: () => ipcRenderer.invoke('storage:get-cache'),
  },

  config: {
    get:        () => ipcRenderer.invoke('config:get'),
    set:        (partial: Record<string, unknown>) => ipcRenderer.invoke('config:set', partial),
    getSecrets: () => ipcRenderer.invoke('config:get-secrets'),
    setSecret:  (key: 'wandb' | 'notion', value: string) => ipcRenderer.invoke('config:set-secret', { key, value }),
    testWandB:  () => ipcRenderer.invoke('config:test-wandb'),
  },

  commands: {
    getCustom: () => ipcRenderer.invoke('commands:get-custom'),
    add:       (cmd: { label: string; command: string }) => ipcRenderer.invoke('commands:add', cmd),
    delete:    (id: string) => ipcRenderer.invoke('commands:delete', id),
  },

  clipboard: {
    write: (text: string) => ipcRenderer.invoke('clipboard:write', text),
  },

  tray: {
    updateBadge: (runningCount: number, failedCount: number) =>
      ipcRenderer.send('tray:update-badge', { runningCount, failedCount }),
  },
})
