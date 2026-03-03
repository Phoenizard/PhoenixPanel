import { useEffect, useState, useCallback } from 'react'
import type { StorageResult, StorageInfo } from '../types/global'
import './StorageWidget.css'

const POLL_INTERVAL_MS = 10 * 60_000

function ProgressBar({ info, label }: { info: StorageInfo; label: string }) {
  const pct = Math.min((info.used / info.limit) * 100, 100)
  const colorClass = pct >= 90 ? 'bar-red' : pct >= 70 ? 'bar-orange' : 'bar-green'

  return (
    <div className="storage-row">
      <div className="storage-labels">
        <span className="storage-label">{label}</span>
        <span className="storage-value">
          {info.used.toFixed(1)} / {info.limit} GB
        </span>
      </div>
      <div className="storage-track">
        <div className={`storage-fill ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function StorageWidget() {
  const [data, setData] = useState<StorageResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [stale, setStale] = useState(false)

  const fetch = useCallback(async (background = false) => {
    if (!background) setLoading(true)
    try {
      const result = await window.phoenixAPI.storage.getQuota()
      setData(result)
      setStale(false)
    } catch {
      // keep stale data
      setStale(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Load cache immediately, then fetch fresh data
    window.phoenixAPI.storage.getCache().then(cached => {
      if (cached) { setData(cached); setStale(true) }
    })
    fetch()
    const id = setInterval(() => fetch(true), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetch])

  const hasData = data?.home || data?.scratch

  return (
    <section className="storage-widget">
      <div className="section-header">
        <span className="section-title">
          STORAGE
          {stale && data && <span className="stale-badge">缓存</span>}
        </span>
        <button
          className={`refresh-btn ${loading ? 'spinning' : ''}`}
          onClick={() => fetch()}
          disabled={loading}
          title="刷新存储信息"
        >↻</button>
      </div>

      {!hasData && loading && (
        <div className="storage-loading">
          <div className="skeleton-card" style={{ height: 40, margin: '0 8px' }} />
        </div>
      )}

      {!hasData && !loading && (
        <div className="empty-state" style={{ padding: '10px 16px' }}>无法获取存储信息</div>
      )}

      {hasData && (
        <div className="storage-bars">
          {data?.home && <ProgressBar info={data.home} label="Home" />}
          {data?.scratch && <ProgressBar info={data.scratch} label="Scratch" />}
        </div>
      )}
    </section>
  )
}
