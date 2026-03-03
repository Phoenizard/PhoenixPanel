import { useEffect, useState } from 'react'
import type { AppConfig } from '../types/global'
import './Preferences.css'

interface Props {
  onClose: () => void
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`toggle ${value ? 'toggle-on' : 'toggle-off'}`}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    >
      <span className="toggle-thumb" />
    </button>
  )
}

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string
  onChange: (v: number) => void
}) {
  return (
    <div className="pref-slider-row">
      <div className="pref-row-label">
        <span>{label}</span>
        <span className="pref-value">{value} {unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="pref-slider"
      />
    </div>
  )
}

export function Preferences({ onClose }: Props) {
  const [cfg, setCfg] = useState<AppConfig | null>(null)
  const [wandbKey, setWandbKey] = useState('')
  const [wandbKeyVisible, setWandbKeyVisible] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    Promise.all([
      window.phoenixAPI.config.get(),
      window.phoenixAPI.config.getSecrets(),
    ]).then(([config, secrets]) => {
      setCfg(config)
      setWandbKey(secrets.wandbKey)
    })
  }, [])

  if (!cfg) return <div className="pref-loading">加载中…</div>

  const save = async (partial: Partial<AppConfig>) => {
    const updated = { ...cfg, ...partial } as AppConfig
    setCfg(updated)
    await window.phoenixAPI.config.set(partial)
  }

  const handleSaveWandB = async () => {
    await window.phoenixAPI.config.setSecret('wandb', wandbKey)
    await save({ wandb: cfg.wandb })
    // re-configure wandb service via set-config
    await window.phoenixAPI.wandb.setConfig({
      apiKey: wandbKey,
      entity: cfg.wandb.entity,
      project: cfg.wandb.project,
    })
  }

  const handleTestWandB = async () => {
    setTesting(true)
    setTestResult(null)
    await handleSaveWandB()
    const result = await window.phoenixAPI.config.testWandB()
    setTestResult(result)
    setTesting(false)
  }

  return (
    <div className="preferences">
      <div className="pref-header">
        <button className="pref-back" onClick={onClose}>← 返回</button>
        <span className="pref-title">偏好设置</span>
      </div>

      <div className="pref-body">
        {/* ── SSH ── */}
        <div className="pref-section">
          <div className="pref-section-title">连接</div>

          <div className="pref-row">
            <span className="pref-label">SSH Host</span>
            <input
              className="pref-input"
              value={cfg.ssh.host}
              onChange={e => setCfg({ ...cfg, ssh: { ...cfg.ssh, host: e.target.value } })}
              onBlur={() => save({ ssh: cfg.ssh })}
            />
          </div>
          <div className="pref-hint">与 ~/.ssh/config 中的 Host 名称一致</div>

          <div className="pref-row">
            <span className="pref-label">用户名</span>
            <input
              className="pref-input"
              placeholder="留空则从 ~/.ssh/config 自动读取"
              value={cfg.ssh.username}
              onChange={e => setCfg({ ...cfg, ssh: { ...cfg.ssh, username: e.target.value } })}
              onBlur={() => save({ ssh: cfg.ssh })}
            />
          </div>
        </div>

        {/* ── WandB ── */}
        <div className="pref-section">
          <div className="pref-section-title">WandB</div>

          <div className="pref-row">
            <span className="pref-label">API Key</span>
            <div className="pref-secret-row">
              <input
                className="pref-input"
                type={wandbKeyVisible ? 'text' : 'password'}
                value={wandbKey}
                onChange={e => setWandbKey(e.target.value)}
                onBlur={handleSaveWandB}
                placeholder="wandb_v1_..."
              />
              <button className="pref-eye" onClick={() => setWandbKeyVisible(v => !v)}>
                {wandbKeyVisible ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <div className="pref-row">
            <span className="pref-label">Entity</span>
            <input
              className="pref-input"
              value={cfg.wandb.entity}
              onChange={e => setCfg({ ...cfg, wandb: { ...cfg.wandb, entity: e.target.value } })}
              onBlur={() => save({ wandb: cfg.wandb })}
            />
          </div>

          <div className="pref-row">
            <span className="pref-label">Project</span>
            <input
              className="pref-input"
              value={cfg.wandb.project}
              onChange={e => setCfg({ ...cfg, wandb: { ...cfg.wandb, project: e.target.value } })}
              onBlur={() => save({ wandb: cfg.wandb })}
            />
          </div>

          <div className="pref-test-row">
            <button className="pref-test-btn" onClick={handleTestWandB} disabled={testing}>
              {testing ? '测试中…' : '测试连接'}
            </button>
            {testResult && (
              <span className={`pref-test-result ${testResult.ok ? 'result-ok' : 'result-err'}`}>
                {testResult.message}
              </span>
            )}
          </div>
        </div>

        {/* ── Polling ── */}
        <div className="pref-section">
          <div className="pref-section-title">轮询间隔</div>
          <SliderRow
            label="Job 刷新" value={cfg.polling.jobsIntervalSec}
            min={10} max={120} step={10} unit="秒"
            onChange={v => { const p = { ...cfg.polling, jobsIntervalSec: v }; setCfg({ ...cfg, polling: p }); save({ polling: p }) }}
          />
          <SliderRow
            label="存储配额" value={cfg.polling.storageIntervalMin}
            min={5} max={60} step={5} unit="分钟"
            onChange={v => { const p = { ...cfg.polling, storageIntervalMin: v }; setCfg({ ...cfg, polling: p }); save({ polling: p }) }}
          />
          <div className="pref-hint">WandB 轮询固定 5 分钟</div>
        </div>

        {/* ── Notifications ── */}
        <div className="pref-section">
          <div className="pref-section-title">通知</div>
          {([
            ['runFinished',    'Run 完成通知'],
            ['runCrashed',     'Run 崩溃通知'],
            ['jobFailed',      'Job FAILED 通知'],
            ['sshDisconnected','SSH 断连通知'],
          ] as const).map(([key, label]) => (
            <div key={key} className="pref-row pref-toggle-row">
              <span className="pref-label">{label}</span>
              <Toggle
                value={cfg.notifications[key]}
                onChange={v => {
                  const n = { ...cfg.notifications, [key]: v }
                  setCfg({ ...cfg, notifications: n })
                  save({ notifications: n })
                }}
              />
            </div>
          ))}
        </div>

        {/* ── Storage ── */}
        <div className="pref-section">
          <div className="pref-section-title">存储配置</div>
          <div className="pref-row">
            <span className="pref-label">Scratch 路径</span>
            <input
              className="pref-input pref-input-mono"
              placeholder={`/scratch/users/<username>`}
              value={cfg.storage.scratchPath}
              onChange={e => setCfg({ ...cfg, storage: { ...cfg.storage, scratchPath: e.target.value } })}
              onBlur={() => save({ storage: cfg.storage })}
            />
          </div>
          <div className="pref-hint">留空则自动使用 /scratch/users/&lt;username&gt;</div>
        </div>
      </div>
    </div>
  )
}
