import { useEffect, useRef, useState, useCallback } from 'react'
import './LogViewer.css'

interface Props {
  jobId: string
  onClose: () => void
}

const DEFAULT_PATH = (jobId: string, username: string) =>
  `/scratch/users/${username}/logs/${jobId}.out`
const MAX_LINES = 500

export function LogViewer({ jobId, onClose }: Props) {
  const [lines, setLines] = useState<string[]>([])
  const [filePath, setFilePath] = useState('')
  const [pathInput, setPathInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const startStream = useCallback(async (path: string) => {
    setLines([])
    setError(null)
    setNotFound(false)
    setStreaming(true)

    const res = await window.phoenixAPI.logs.startStream(jobId, path)
    if (!res.ok) {
      setError(res.error ?? '启动失败')
      setStreaming(false)
    }
  }, [jobId])

  // Subscribe to IPC events
  useEffect(() => {
    const offLine = window.phoenixAPI.logs.onLine((id, newLines) => {
      if (id !== jobId) return
      setLines(prev => {
        const next = [...prev, ...newLines]
        return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next
      })
    })

    const offError = window.phoenixAPI.logs.onError((id, message) => {
      if (id !== jobId) return
      if (message.includes('No such file')) {
        setNotFound(true)
        setStreaming(false)
      } else {
        setError(message)
        setStreaming(false)
      }
    })

    const offEnded = window.phoenixAPI.logs.onEnded((id) => {
      if (id !== jobId) return
      setStreaming(false)
    })

    // Resolve username then start stream
    window.phoenixAPI.ssh.getStatus().then(({ username }) => {
      const path = DEFAULT_PATH(jobId, username)
      setFilePath(path)
      setPathInput(path)
      startStream(path)
    })

    return () => {
      offLine()
      offError()
      offEnded()
      window.phoenixAPI.logs.stopStream()
    }
  }, [jobId, filePath, startStream])

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' })
    }
  }, [lines, autoScroll])

  // Detect manual scroll up → disable auto-scroll
  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
    setAutoScroll(atBottom)
  }

  const handleCopyPath = () => {
    window.phoenixAPI.clipboard.write(filePath)
  }

  const handlePathSubmit = () => {
    setFilePath(pathInput)
  }

  return (
    <div className="log-viewer">
      <div className="log-toolbar">
        <span className="log-filepath" title={filePath}>{filePath}</span>
        <div className="log-actions">
          <button
            className="log-btn"
            onClick={() => setAutoScroll(v => !v)}
            title={autoScroll ? '暂停滚动' : '恢复滚动'}
          >
            {autoScroll ? '⏸' : '▶'}
          </button>
          <button className="log-btn" onClick={handleCopyPath} title="复制路径">⎘</button>
          <button className="log-btn log-btn-close" onClick={onClose} title="收起">✕</button>
        </div>
      </div>

      {notFound && (
        <div className="log-notfound">
          <p>日志文件未找到，请指定路径：</p>
          <div className="log-path-input-row">
            <input
              className="log-path-input"
              value={pathInput}
              onChange={e => setPathInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePathSubmit()}
              placeholder="~/slurm-JOBID.out"
            />
            <button className="log-path-btn" onClick={handlePathSubmit}>读取</button>
          </div>
        </div>
      )}

      {error && !notFound && (
        <div className="log-error">{error}</div>
      )}

      <div className="log-body" ref={scrollRef} onScroll={handleScroll}>
        {lines.length === 0 && streaming && (
          <span className="log-hint">加载中…</span>
        )}
        {lines.map((line, i) => (
          <div key={i} className="log-line">{line}</div>
        ))}
        <div ref={bottomRef} />
      </div>

      {!autoScroll && (
        <button className="log-scroll-hint" onClick={() => {
          setAutoScroll(true)
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        }}>
          ↓ 跳到最新
        </button>
      )}
    </div>
  )
}
