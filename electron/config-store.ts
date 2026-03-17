// Centralized config using electron-store v8
// All non-sensitive settings live here; secrets go to Keychain via keytar

export interface HistoryJob {
  id: string
  name: string
  partition: string
  gpuLabel: string
  state: 'COMPLETED' | 'FAILED' | 'CANCELLED'
  elapsed: string   // "2:30:15"
  endTime: string   // ISO 8601
}

export interface AppConfig {
  ssh: {
    host: string
    username: string  // overrides ~/.ssh/config if set
  }
  wandb: {
    entity: string
    project: string
  }
  polling: {
    jobsIntervalSec: number
    storageIntervalMin: number
  }
  notifications: {
    runFinished: boolean
    runCrashed: boolean
    jobFailed: boolean
    sshDisconnected: boolean
  }
  storage: {
    scratchPath: string
    scratchLimitGB: number
    homeLimitGB: number
  }
  customCommands: Array<{ id: string; label: string; command: string }>
  jobHistory: HistoryJob[]
}

const DEFAULTS: AppConfig = {
  ssh: { host: 'create', username: '' },
  wandb: { entity: 'pheonizard-university-of-nottingham', project: 'HPC-SIRSID' },
  polling: { jobsIntervalSec: 30, storageIntervalMin: 10 },
  notifications: { runFinished: true, runCrashed: true, jobFailed: true, sshDisconnected: true },
  storage: { scratchPath: '', scratchLimitGB: 200, homeLimitGB: 50 },
  customCommands: [],
  jobHistory: [],
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _store: any = null

async function getStore() {
  if (_store) return _store
  const Store = await import('electron-store').then(m => m.default ?? m)
  _store = new Store<AppConfig>({ defaults: DEFAULTS })
  return _store
}

export async function getConfig(): Promise<AppConfig> {
  const store = await getStore()
  return store.store
}

export async function setConfig(partial: Partial<AppConfig>): Promise<void> {
  const store = await getStore()
  for (const [key, value] of Object.entries(partial)) {
    store.set(key as keyof AppConfig, value)
  }
}

export async function getConfigKey<K extends keyof AppConfig>(key: K): Promise<AppConfig[K]> {
  const store = await getStore()
  return store.get(key)
}

export async function setConfigKey<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
  const store = await getStore()
  store.set(key, value)
}
