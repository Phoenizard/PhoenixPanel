export type JobState = 'RUNNING' | 'PENDING' | 'FAILED' | 'COMPLETED' | 'CANCELLED'

export interface Job {
  id: string
  name: string
  state: JobState
  timeUsed: string
  partition: string
  cpuCount: string
  gpuCount: string   // e.g. "4", "0" (CPU only)
  gpuLabel: string   // e.g. "4× GPU", "CPU only"
}

function parseGPU(tres: string): { count: string; label: string } {
  if (!tres || tres === 'N/A') return { count: '0', label: 'CPU only' }

  // Standard GRES format: gres/gpu:a100:8 or gres/gpu:8
  const gresMatch = tres.match(/gres\/gpu(?::[^:,\s]+)?:(\d+)/)
  if (gresMatch) return { count: gresMatch[1], label: `${gresMatch[1]}× GPU` }

  // Simple format: gpu:8
  const simpleMatch = tres.match(/^gpu:(\d+)/)
  if (simpleMatch) return { count: simpleMatch[1], label: `${simpleMatch[1]}× GPU` }

  return { count: '0', label: 'CPU only' }
}

function normaliseState(raw: string): JobState {
  const s = raw.toUpperCase()
  if (s === 'RUNNING')   return 'RUNNING'
  if (s === 'PENDING')   return 'PENDING'
  if (s === 'FAILED')    return 'FAILED'
  if (s === 'COMPLETED') return 'COMPLETED'
  if (s === 'CANCELLED') return 'CANCELLED'
  return 'PENDING'
}

export function parseJobs(raw: string): Job[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const parts = line.split('|')
      const [id = '', name = '', stateRaw = '', timeUsed = '', partition = '', cpuCount = '', tres = ''] = parts
      const { count, label } = parseGPU(tres.trim())
      return {
        id: id.trim(),
        name: name.trim(),
        state: normaliseState(stateRaw.trim()),
        timeUsed: timeUsed.trim(),
        partition: partition.trim(),
        cpuCount: cpuCount.trim(),
        gpuCount: count,
        gpuLabel: label,
      }
    })
    .filter(job => job.id !== '')
}

export function sortJobs(jobs: Job[]): Job[] {
  const order: Record<JobState, number> = {
    RUNNING: 0, PENDING: 1, FAILED: 2, COMPLETED: 3, CANCELLED: 4,
  }
  return [...jobs].sort((a, b) => {
    const diff = order[a.state] - order[b.state]
    if (diff !== 0) return diff
    return Number(a.id) - Number(b.id)
  })
}
