import { NodeSSH } from 'node-ssh'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

export type SSHStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

// Commands that are permitted to execute (readonly / diagnostic only)
const ALLOWED_PREFIXES = [
  'squeue',
  'sacct',
  'quota',
  'df',
  'du',
  'tail',
  'cat',
  'echo',
]

function isCommandAllowed(cmd: string): boolean {
  const trimmed = cmd.trimStart()
  return ALLOWED_PREFIXES.some(prefix => trimmed.startsWith(prefix))
}

interface SSHConfigEntry {
  hostname: string
  user: string
  identityFile: string
}

function parseSSHConfig(alias: string): SSHConfigEntry {
  const defaults: SSHConfigEntry = {
    hostname: alias,
    user: os.userInfo().username,
    identityFile: path.join(os.homedir(), '.ssh', 'id_rsa'),
  }

  const configPath = path.join(os.homedir(), '.ssh', 'config')
  if (!fs.existsSync(configPath)) return defaults

  const lines = fs.readFileSync(configPath, 'utf-8').split('\n')
  let inBlock = false
  const result = { ...defaults }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue

    if (/^Host\s+/i.test(line)) {
      const hostValue = line.replace(/^Host\s+/i, '').trim()
      inBlock = hostValue === alias
      continue
    }

    if (!inBlock) continue

    const kv = line.match(/^(\w+)\s+(.+)$/)
    if (!kv) continue
    const [, key, value] = kv

    switch (key.toLowerCase()) {
      case 'hostname':     result.hostname = value.trim(); break
      case 'user':         result.user = value.trim(); break
      case 'identityfile': result.identityFile = value.trim().replace(/^~/, os.homedir()); break
    }
  }

  return result
}

class SSHManager {
  private ssh: NodeSSH = new NodeSSH()
  private status: SSHStatus = 'disconnected'
  private retryCount = 0
  private readonly maxRetries = 5
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private alias: string = 'create'
  private config: SSHConfigEntry

  constructor() {
    this.config = parseSSHConfig(this.alias)
  }

  configure(alias: string, username?: string) {
    this.alias = alias
    this.config = parseSSHConfig(alias)
    if (username) this.config.user = username
  }

  getStatus(): SSHStatus {
    return this.status
  }

  getHost(): string {
    return this.alias
  }

  getUsername(): string {
    return this.config.user
  }

  getSSHConfig(): SSHConfigEntry {
    return this.config
  }

  async connect(): Promise<void> {
    if (this.status === 'connected' || this.status === 'connecting') return

    this.status = 'connecting'
    // Re-parse config in case it changed
    this.config = parseSSHConfig(this.alias)

    try {
      await this.ssh.connect({
        host: this.config.hostname,
        username: this.config.user,
        privateKeyPath: this.config.identityFile,
      })
      this.status = 'connected'
      this.retryCount = 0
      if (this.retryTimer) {
        clearTimeout(this.retryTimer)
        this.retryTimer = null
      }
    } catch (err) {
      this.status = 'error'
      this.scheduleRetry()
      throw err
    }
  }

  private scheduleRetry() {
    if (this.retryCount >= this.maxRetries) return
    if (this.retryTimer) return

    this.retryCount++
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null
      this.status = 'disconnected'
      try {
        await this.connect()
      } catch {
        // scheduleRetry is called inside connect() on failure
      }
    }, 30_000)
  }

  async disconnect(): Promise<void> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    this.ssh.dispose()
    this.status = 'disconnected'
    this.retryCount = 0
  }

  async executeCommand(cmd: string): Promise<string> {
    if (!isCommandAllowed(cmd)) {
      throw new Error(`Command not allowed: "${cmd.split(' ')[0]}" is not in the SSH whitelist`)
    }

    if (this.status !== 'connected') {
      await this.connect()
    }

    const result = await this.ssh.execCommand(cmd)
    if (result.stderr && !result.stdout) {
      throw new Error(result.stderr)
    }
    return result.stdout
  }
}

export const sshManager = new SSHManager()
