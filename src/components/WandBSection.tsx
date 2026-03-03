import { useEffect, useState, useCallback } from 'react'
import type { WandBRun } from '../types/global'
import './WandBSection.css'

const METRIC_PRIORITY = ['val/best_pred_top1', 'val/top1', 'val/top5']
const POLL_INTERVAL = 2 * 60_000

function pickMetric(metrics: Record<string, number>) {
  for (const key of METRIC_PRIORITY) {
    if (metrics[key] !== undefined) return { key, value: metrics[key] }
  }
  return null
}

function fmtMetric(v: number) {
  return v.toFixed(2) + '%'
}

function fmtDuration(seconds: number) {
  if (!seconds || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function relativeTime(iso: string) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins} 分钟前`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} 小时前`
  return `${Math.floor(hrs / 24)} 天前`
}

function stateIcon(state: WandBRun['state']) {
  switch (state) {
    case 'finished': return '✓'
    case 'crashed':  return '✗'
    case 'running':  return '⏳'
    case 'killed':   return '⏸'
  }
}

function stateClass(state: WandBRun['state']) {
  switch (state) {
    case 'finished': return 'state-finished'
    case 'crashed':  return 'state-crashed'
    case 'running':  return 'state-running'
    case 'killed':   return 'state-killed'
  }
}

// ── Setup form (shown when API key not configured) ────────────────────────

function SetupForm({ onSave }: { onSave: () => void }) {
  const [apiKey, setApiKey] = useState('')
  const [entity, setEntity] = useState('pheonizard-university-of-nottingham')
  const [project, setProject] = useState('HPC-SIRSID')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    await window.phoenixAPI.wandb.setConfig({ apiKey: apiKey.trim(), entity, project })
    setSaving(false)
    onSave()
  }

  return (
    <div className="wandb-setup">
      <p className="setup-hint">填入 WandB API Key 以启用实验监控</p>
      <input
        className="setup-input"
        type="password"
        placeholder="wandb_v1_..."
        value={apiKey}
        onChange={e => setApiKey(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSave()}
      />
      <div className="setup-row">
        <input
          className="setup-input setup-input-sm"
          placeholder="Entity"
          value={entity}
          onChange={e => setEntity(e.target.value)}
        />
        <input
          className="setup-input setup-input-sm"
          placeholder="Project"
          value={project}
          onChange={e => setProject(e.target.value)}
        />
      </div>
      <button className="setup-btn" onClick={handleSave} disabled={saving || !apiKey.trim()}>
        {saving ? '保存中…' : '保存'}
      </button>
    </div>
  )
}

// ── Run card ──────────────────────────────────────────────────────────────

function RunCard({ run }: { run: WandBRun }) {
  const primary = pickMetric(run.metrics)
  const showTop5 = primary?.key === 'val/top1' && run.metrics['val/top5'] !== undefined

  return (
    <li className={`run-card ${stateClass(run.state)}`}>
      <div className="run-main">
        <span className="run-state-icon">{stateIcon(run.state)}</span>
        <span className="run-name">{run.name}</span>
        <span className="run-time">{relativeTime(run.createdAt)}</span>
      </div>
      <div className="run-sub">
        <span className="run-duration">{fmtDuration(run.duration)}</span>
        {primary && (
          <span className="run-metric">
            {primary.key.split('/').pop()}: <strong>{fmtMetric(primary.value)}</strong>
            {showTop5 && (
              <span className="run-metric-secondary">
                {' '}/ top5: {fmtMetric(run.metrics['val/top5'])}
              </span>
            )}
          </span>
        )}
      </div>
    </li>
  )
}

// ── Main section ──────────────────────────────────────────────────────────

export function WandBSection() {
  const [runs, setRuns] = useState<WandBRun[]>([])
  const [configured, setConfigured] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  const checkConfig = useCallback(async () => {
    const status = await window.phoenixAPI.wandb.getStatus()
    setConfigured(status.configured)
    return status.configured
  }, [])

  const fetchRuns = useCallback(async () => {
    try {
      const res = await window.phoenixAPI.wandb.getRuns()
      if (res.ok) {
        setRuns(res.runs)
        setError(null)
        setLastUpdated(new Date().toISOString())
      } else {
        if (res.error === 'NO_KEY') {
          setConfigured(false)
        } else if (res.error === 'INVALID_KEY') {
          setError('API Key 无效，请重新填写')
        } else if (res.error === 'RATE_LIMIT') {
          setError('请求频率超限，10 分钟后重试')
        } else {
          setError(res.error ?? 'WandB 数据获取失败')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '未知错误')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkConfig().then(ok => {
      if (ok) fetchRuns()
      else setLoading(false)
    })
  }, [checkConfig, fetchRuns])

  useEffect(() => {
    if (!configured) return
    const id = setInterval(fetchRuns, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [configured, fetchRuns])

  const handleConfigSaved = async () => {
    setLoading(true)
    await checkConfig()
    await fetchRuns()
  }

  const minutesAgo = lastUpdated
    ? Math.floor((Date.now() - new Date(lastUpdated).getTime()) / 60_000)
    : null

  return (
    <section className="wandb-section">
      <div className="section-header">
        <span className="section-title">WANDB</span>
        {lastUpdated && error && (
          <span className="last-updated">上次更新：{minutesAgo} 分钟前</span>
        )}
      </div>

      {(!configured || showSetup) && !loading && (
        <SetupForm onSave={() => { setShowSetup(false); handleConfigSaved() }} />
      )}

      {configured && !showSetup && error && (
        <div className="error-banner">
          {error}
          <button className="reset-btn" onClick={() => setShowSetup(true)}>重新设置</button>
        </div>
      )}

      {configured && loading && (
        <div className="skeleton-list">
          {[1, 2].map(i => <div key={i} className="skeleton-card skeleton-run" />)}
        </div>
      )}

      {configured && !loading && runs.length === 0 && !error && (
        <div className="empty-state">暂无 Run 记录</div>
      )}

      {configured && runs.length > 0 && (
        <ul className="run-list">
          {runs.map(run => <RunCard key={run.id} run={run} />)}
        </ul>
      )}
    </section>
  )
}
