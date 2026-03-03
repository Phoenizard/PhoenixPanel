import { BrowserWindow } from 'electron'
import { sshManager } from './ssh-manager'
import { NodeSSH } from 'node-ssh'

const MAX_LINES = 500

interface ActiveStream {
  jobId: string
  filePath: string
  ssh: NodeSSH
  dispose: () => void
}

class LogStreamer {
  private active: ActiveStream | null = null

  async startStream(jobId: string, filePath: string, win: BrowserWindow): Promise<{ ok: boolean; error?: string }> {
    // Stop any existing stream first
    await this.stopStream()

    const config = sshManager.getSSHConfig()
    const ssh = new NodeSSH()

    try {
      await ssh.connect({
        host: config.hostname,
        username: config.user,
        privateKeyPath: config.identityFile,
      })
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : '连接失败' }
    }

    let lineBuffer: string[] = []
    let disposed = false

    const dispose = () => {
      if (disposed) return
      disposed = true
      try { ssh.dispose() } catch { /* ignore */ }
      if (this.active?.jobId === jobId) this.active = null
    }

    this.active = { jobId, filePath, ssh, dispose }

    // Run tail -f in background, streaming output line by line
    ssh.execCommand(`tail -f -n 50 ${filePath}`, {
      onStdout: (chunk: Buffer) => {
        if (disposed || win.isDestroyed()) return
        const lines = chunk.toString().split('\n')
        for (const line of lines) {
          if (line === '') continue
          lineBuffer.push(line)
          if (lineBuffer.length > MAX_LINES) lineBuffer.shift()
        }
        win.webContents.send('logs:line', { jobId, lines })
      },
      onStderr: (chunk: Buffer) => {
        if (disposed || win.isDestroyed()) return
        win.webContents.send('logs:error', { jobId, message: chunk.toString() })
      },
    }).then(() => {
      // Stream ended (file deleted or connection closed)
      if (!disposed && !win.isDestroyed()) {
        win.webContents.send('logs:ended', { jobId })
      }
      dispose()
    }).catch((err: unknown) => {
      if (!disposed && !win.isDestroyed()) {
        win.webContents.send('logs:error', {
          jobId,
          message: err instanceof Error ? err.message : '流读取失败',
        })
      }
      dispose()
    })

    return { ok: true }
  }

  async stopStream(): Promise<void> {
    if (this.active) {
      this.active.dispose()
      this.active = null
    }
  }

  getActiveJobId(): string | null {
    return this.active?.jobId ?? null
  }
}

export const logStreamer = new LogStreamer()
