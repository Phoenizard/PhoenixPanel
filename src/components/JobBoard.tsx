import { useEffect, useState, useCallback } from 'react'
import type { Job } from '../types/global'
import { JobCard } from './JobCard'
import './JobBoard.css'

const POLL_INTERVAL = 30_000

export function JobBoard() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      const res = await window.phoenixAPI.jobs.getAll()
      if (res.ok) {
        setJobs(res.jobs)
        setError(null)
        setLastUpdated(new Date())
        const running = res.jobs.filter(j => j.state === 'RUNNING').length
        const failed  = res.jobs.filter(j => j.state === 'FAILED').length
        window.phoenixAPI.tray.updateBadge(running, failed)
      } else {
        setError(res.error ?? '获取 Job 数据失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
    const id = setInterval(fetchJobs, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [fetchJobs])

  const runningCount = jobs.filter(j => j.state === 'RUNNING').length

  return (
    <section className="job-board">
      <div className="section-header">
        <span className="section-title">
          JOBS
          {runningCount > 0 && (
            <span className="running-badge">{runningCount} running</span>
          )}
        </span>
        {lastUpdated && (
          <span className="last-updated">
            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {error && (
        <div className="error-banner">{error}</div>
      )}

      {loading && !error && (
        <div className="skeleton-list">
          {[1, 2].map(i => <div key={i} className="skeleton-card" />)}
        </div>
      )}

      {!loading && jobs.length === 0 && !error && (
        <div className="empty-state">暂无 Job，空闲中 ☕</div>
      )}

      {!loading && jobs.length > 0 && (
        <ul className="job-list">
          {jobs.map(job => (
            <JobCard
            key={job.id}
            job={job}
            expandedJobId={expandedJobId}
            onExpandLog={setExpandedJobId}
          />
          ))}
        </ul>
      )}
    </section>
  )
}
