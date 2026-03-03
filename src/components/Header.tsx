import { useEffect, useState, useCallback } from 'react'
import './Header.css'

type SSHStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

interface SSHState {
  status: SSHStatus
  host: string
}

export function Header() {
  const [ssh, setSSH] = useState<SSHState>({ status: 'disconnected', host: 'kcl-hpc' })
  const [refreshing, setRefreshing] = useState(false)

  const pollStatus = useCallback(async () => {
    try {
      const result = await window.phoenixAPI.ssh.getStatus()
      setSSH({ status: result.status as SSHStatus, host: result.host })
    } catch {
      setSSH(prev => ({ ...prev, status: 'error' }))
    }
  }, [])

  // Poll every 5 seconds
  useEffect(() => {
    pollStatus()
    const id = setInterval(pollStatus, 5_000)
    return () => clearInterval(id)
  }, [pollStatus])

  const handleRefresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await window.phoenixAPI.ssh.testConnection()
      await pollStatus()
    } finally {
      setRefreshing(false)
    }
  }

  const dot = statusDot(ssh.status)

  return (
    <header className="panel-header">
      <div className="ssh-status">
        <span className={`status-dot ${dot.className}`} />
        <span className="status-label">{statusLabel(ssh)}</span>
      </div>
      <button
        className={`refresh-btn ${refreshing ? 'spinning' : ''}`}
        onClick={handleRefresh}
        title="刷新连接"
        aria-label="刷新连接"
      >
        ↻
      </button>
    </header>
  )
}

function statusDot(status: SSHStatus): { className: string } {
  switch (status) {
    case 'connected':   return { className: 'dot-green' }
    case 'connecting':  return { className: 'dot-orange' }
    case 'error':       return { className: 'dot-red' }
    default:            return { className: 'dot-red' }
  }
}

function statusLabel(ssh: SSHState): string {
  switch (ssh.status) {
    case 'connected':   return ssh.host
    case 'connecting':  return '重连中…'
    case 'error':       return '未连接'
    default:            return '未连接'
  }
}
