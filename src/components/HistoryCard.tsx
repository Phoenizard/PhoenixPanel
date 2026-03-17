import type { HistoryJob } from '../types/global'
import './JobCard.css'

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function stateDotClass(state: HistoryJob['state']): string {
  if (state === 'COMPLETED') return 'dot-completed'
  if (state === 'FAILED') return 'dot-failed'
  return 'dot-cancelled'
}

interface Props { job: HistoryJob }

export function HistoryCard({ job }: Props) {
  return (
    <li className="job-card">
      <div className="job-card-main">
        <span className={`state-dot ${stateDotClass(job.state)}`} />
        <div className="job-info">
          <span className="job-name">{job.name}</span>
          <span className="job-id">#{job.id}</span>
        </div>
        <div className="job-right">
          <span className="job-time">{job.elapsed}</span>
        </div>
      </div>
      <div className="job-card-sub">
        <span className="job-meta">{job.partition}</span>
        {job.gpuLabel && <span className="job-meta">{job.gpuLabel}</span>}
        <span className="job-meta">{relativeTime(job.endTime)}</span>
        <span className="job-meta" style={{ marginLeft: 'auto', textTransform: 'uppercase', fontSize: '10px' }}>{job.state}</span>
      </div>
    </li>
  )
}
