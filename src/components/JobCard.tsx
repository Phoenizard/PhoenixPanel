import { useState, useEffect } from 'react'
import type { Job } from '../types/global'
import { LogViewer } from './LogViewer'
import './JobCard.css'

interface Props {
  job: Job
  expandedJobId: string | null
  onExpandLog: (jobId: string | null) => void
}

const LOG_PATH = (jobId: string, username: string) =>
  `/scratch/users/${username}/logs/${jobId}.out`

export function JobCard({ job, expandedJobId, onExpandLog }: Props) {
  const [copied, setCopied] = useState(false)
  const [copiedId, setCopiedId] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const isExpanded = expandedJobId === job.id

  // Poll training progress for RUNNING jobs
  useEffect(() => {
    if (job.state !== 'RUNNING') return
    let cancelled = false

    const fetch = async () => {
      const { username } = await window.phoenixAPI.ssh.getStatus()
      const path = LOG_PATH(job.id, username)
      const res = await window.phoenixAPI.logs.getProgress(path)
      if (!cancelled && res.progress) setProgress(res.progress)
    }

    fetch()
    const timer = setInterval(fetch, 30_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [job.id, job.state])

  const handleCopyScancel = async () => {
    await window.phoenixAPI.clipboard.write(`scancel ${job.id}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleToggleLog = () => {
    onExpandLog(isExpanded ? null : job.id)
  }

  return (
    <li className={`job-card state-${job.state.toLowerCase()}`}>
      <div className="job-card-main">
        <span className={`state-dot dot-${job.state.toLowerCase()}`} />
        <div className="job-info">
          <span className="job-name">{job.name}</span>
          <span className="job-id">#{job.id}</span>
        </div>
        <div className="job-right">
          {progress && (
            <span className="job-progress">[{progress.current}/{progress.total}]</span>
          )}
          <span className="job-time">{job.timeUsed}</span>
        </div>
      </div>

      <div className="job-card-sub">
        <span className="job-meta">{job.partition}</span>
        <span className="job-meta">{job.gpuLabel}</span>
      </div>

      <div className="job-card-actions">
        <button className="action-btn" onClick={handleCopyScancel}>
          {copied ? '✓ 已复制' : `复制 scancel ${job.id}`}
        </button>
        <button
          className={`action-btn${copiedId ? ' action-btn-active' : ''}`}
          onClick={() => {
            window.phoenixAPI.clipboard.write(job.id)
            setCopiedId(true)
            setTimeout(() => setCopiedId(false), 1500)
          }}
        >
          {copiedId ? '✓' : '复制 ID'}
        </button>
        <button
          className={`action-btn ${isExpanded ? 'action-btn-active' : ''}`}
          onClick={handleToggleLog}
        >
          {isExpanded ? '收起日志 ↑' : '查看日志 ↓'}
        </button>
      </div>

      {isExpanded && (
        <LogViewer
          jobId={job.id}
          onClose={() => onExpandLog(null)}
        />
      )}
    </li>
  )
}
