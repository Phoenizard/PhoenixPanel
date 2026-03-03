export {}

export interface Job {
  id: string; name: string
  state: 'RUNNING' | 'PENDING' | 'FAILED' | 'COMPLETED' | 'CANCELLED'
  timeUsed: string; partition: string; cpuCount: string; gpuCount: string; gpuLabel: string
}

export interface WandBRun {
  id: string; name: string
  state: 'running' | 'finished' | 'crashed' | 'killed'
  createdAt: string; duration: number; metrics: Record<string, number>; errorMessage?: string
}

export interface StorageInfo { used: number; limit: number; raw: string }
export interface StorageResult {
  home: StorageInfo | null; scratch: StorageInfo | null; fetchedAt: string; error?: string
}

export interface CustomCommand { id: string; label: string; command: string }

export interface AppConfig {
  ssh: { host: string; username: string }
  wandb: { entity: string; project: string }
  polling: { jobsIntervalSec: number; storageIntervalMin: number }
  notifications: { runFinished: boolean; runCrashed: boolean; jobFailed: boolean; sshDisconnected: boolean }
  storage: { scratchPath: string; scratchLimitGB: number; homeLimitGB: number }
  customCommands: CustomCommand[]
}

declare global {
  interface Window {
    phoenixAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (channel: string, listener: (...args: unknown[]) => void) => () => void

      ssh: {
        getStatus:      () => Promise<{ status: string; host: string; username: string }>
        testConnection: () => Promise<{ ok: boolean; message: string }>
      }
      jobs: {
        getAll: () => Promise<{ ok: boolean; jobs: Job[]; error?: string }>
      }
      wandb: {
        getRuns:   () => Promise<{ ok: boolean; runs: WandBRun[]; error?: string }>
        getStatus: () => Promise<{ error: string | null; lastUpdated: string | null; configured: boolean }>
        setConfig: (cfg: { apiKey: string; entity: string; project: string }) => Promise<{ ok: boolean }>
        getConfig: () => Promise<{ apiKey: string; entity: string; project: string }>
      }
      logs: {
        startStream:  (jobId: string, filePath: string) => Promise<{ ok: boolean; error?: string }>
        stopStream:   () => Promise<void>
        onLine:       (cb: (jobId: string, lines: string[]) => void) => () => void
        onError:      (cb: (jobId: string, message: string) => void) => () => void
        onEnded:      (cb: (jobId: string) => void) => () => void
        getProgress:  (filePath: string) => Promise<{ ok: boolean; progress: { current: number; total: number } | null }>
      }
      storage: {
        getQuota: () => Promise<StorageResult>
        getCache: () => Promise<StorageResult | null>
      }
      config: {
        get:        () => Promise<AppConfig>
        set:        (partial: Partial<AppConfig>) => Promise<{ ok: boolean }>
        getSecrets: () => Promise<{ wandbKey: string; notionKey: string }>
        setSecret:  (key: 'wandb' | 'notion', value: string) => Promise<{ ok: boolean }>
        testWandB:  () => Promise<{ ok: boolean; message: string }>
      }
      commands: {
        getCustom: () => Promise<CustomCommand[]>
        add:       (cmd: { label: string; command: string }) => Promise<CustomCommand>
        delete:    (id: string) => Promise<{ ok: boolean }>
      }
      clipboard: { write: (text: string) => Promise<void> }
      tray: { updateBadge: (runningCount: number, failedCount: number) => void }
    }
  }
}
