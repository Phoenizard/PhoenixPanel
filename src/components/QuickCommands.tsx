import { useEffect, useState } from 'react'
import type { CustomCommand } from '../types/global'
import './QuickCommands.css'

const BUILTIN: { label: string; command: string }[] = [
  { label: '查看我的 Jobs',    command: 'squeue -u $USER' },
  { label: '只看 RUNNING',     command: 'squeue -u $USER -t RUNNING' },
  { label: '今日 Job 历史',    command: 'sacct -u $USER --starttime=today --format=JobID,JobName,State,Elapsed,ExitCode' },
  { label: 'Scratch 磁盘',     command: 'df -h ~/scratch' },
  { label: 'Scratch 子目录',   command: 'du -sh ~/scratch/*' },
  { label: 'GPU 状态',         command: 'nvidia-smi' },
]

function CmdRow({ label, command, onDelete }: {
  label: string; command: string; onDelete?: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await window.phoenixAPI.clipboard.write(command)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className="cmd-row"
      onClick={handleCopy}
      onContextMenu={onDelete ? (e) => { e.preventDefault(); onDelete() } : undefined}
      title={command}
    >
      <div className="cmd-info">
        <span className="cmd-label">{label}</span>
        <span className="cmd-command">{command}</span>
      </div>
      <span className="cmd-copy">{copied ? '✓' : '⎘'}</span>
    </div>
  )
}

export function QuickCommands() {
  const [expanded, setExpanded] = useState(false)
  const [custom, setCustom] = useState<CustomCommand[]>([])
  const [adding, setAdding] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newCmd, setNewCmd] = useState('')

  useEffect(() => {
    if (expanded) {
      window.phoenixAPI.commands.getCustom().then(setCustom)
    }
  }, [expanded])

  const handleAdd = async () => {
    if (!newLabel.trim() || !newCmd.trim()) return
    const created = await window.phoenixAPI.commands.add({ label: newLabel.trim(), command: newCmd.trim() })
    setCustom(prev => [...prev, created])
    setNewLabel(''); setNewCmd(''); setAdding(false)
  }

  const handleDelete = async (id: string) => {
    await window.phoenixAPI.commands.delete(id)
    setCustom(prev => prev.filter(c => c.id !== id))
  }

  return (
    <section className="quick-commands">
      <button className="section-toggle" onClick={() => setExpanded(v => !v)}>
        <span className="section-title">快速命令</span>
        <span className="toggle-arrow">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="cmd-list">
          {BUILTIN.map(c => (
            <CmdRow key={c.command} label={c.label} command={c.command} />
          ))}

          {custom.length > 0 && <div className="cmd-divider" />}

          {custom.map(c => (
            <CmdRow
              key={c.id}
              label={c.label}
              command={c.command}
              onDelete={() => handleDelete(c.id)}
            />
          ))}

          {adding ? (
            <div className="cmd-add-form">
              <input
                className="cmd-input"
                placeholder="标签（如：训练状态）"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
              />
              <input
                className="cmd-input cmd-input-mono"
                placeholder="命令（如：squeue -u $USER）"
                value={newCmd}
                onChange={e => setNewCmd(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <div className="cmd-add-actions">
                <button className="cmd-btn cmd-btn-cancel" onClick={() => setAdding(false)}>取消</button>
                <button className="cmd-btn cmd-btn-save" onClick={handleAdd}>保存</button>
              </div>
            </div>
          ) : (
            <button className="cmd-add-btn" onClick={() => setAdding(true)}>＋ 添加命令</button>
          )}
        </div>
      )}
    </section>
  )
}
