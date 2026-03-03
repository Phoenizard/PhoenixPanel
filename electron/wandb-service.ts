import { Notification } from 'electron'

export interface WandBRun {
  id: string
  name: string
  state: 'running' | 'finished' | 'crashed' | 'killed'
  createdAt: string
  duration: number        // seconds (computeSeconds)
  metrics: Record<string, number>
  errorMessage?: string
}

export interface WandBConfig {
  apiKey: string
  entity: string
  project: string
}

const METRIC_PRIORITY = ['val/best_pred_top1', 'val/top1', 'val/top5']
const GRAPHQL_URL = 'https://api.wandb.ai/graphql'

const RUNS_QUERY = `
  query GetRuns($project: String!, $entity: String!) {
    project(name: $project, entityName: $entity) {
      runs(first: 5, order: "-created_at") {
        edges {
          node {
            name
            displayName
            state
            createdAt
            computeSeconds
            summaryMetrics
          }
        }
      }
    }
  }
`

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function relativeTime(isoString: string): string {
  if (!isoString) return ''
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}

export function pickMetric(metrics: Record<string, number>): { key: string; value: number } | null {
  for (const key of METRIC_PRIORITY) {
    if (metrics[key] !== undefined) return { key, value: metrics[key] }
  }
  return null
}

export function formatMetricValue(v: number): string {
  return v.toFixed(2) + '%'  // values are already percentages (e.g. 58.84)
}

function parseRun(node: Record<string, unknown>): WandBRun {
  let metrics: Record<string, number> = {}
  if (typeof node.summaryMetrics === 'string') {
    try { metrics = JSON.parse(node.summaryMetrics) } catch { /* ignore */ }
  }

  return {
    id: String(node.name ?? ''),
    name: String(node.displayName ?? node.name ?? ''),
    state: String(node.state ?? 'running') as WandBRun['state'],
    createdAt: String(node.createdAt ?? ''),
    duration: Number(node.computeSeconds ?? 0),
    metrics,
  }
}

class WandBService {
  private timer: ReturnType<typeof setInterval> | null = null
  private prevStates = new Map<string, string>()
  private lastRuns: WandBRun[] = []
  private lastError: string | null = null
  private lastUpdated: Date | null = null
  private config: WandBConfig | null = null
  private backoffUntil: number = 0

  configure(config: WandBConfig) {
    this.config = config
  }

  getConfig(): WandBConfig | null {
    return this.config
  }

  getLastRuns(): WandBRun[] { return this.lastRuns }
  getLastError(): string | null { return this.lastError }
  getLastUpdated(): Date | null { return this.lastUpdated }

  startPolling() {
    if (this.timer) return
    this.poll()
    this.timer = setInterval(() => this.poll(), 2 * 60_000)
  }

  stopPolling() {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  async fetchNow(): Promise<{ ok: boolean; runs: WandBRun[]; error?: string }> {
    await this.poll()
    return this.lastError
      ? { ok: false, runs: this.lastRuns, error: this.lastError }
      : { ok: true, runs: this.lastRuns }
  }

  private async poll() {
    if (!this.config?.apiKey) { this.lastError = 'NO_KEY'; return }
    if (Date.now() < this.backoffUntil) return

    const { apiKey, entity, project } = this.config
    const basicAuth = Buffer.from(`api:${apiKey}`).toString('base64')

    try {
      const resp = await fetch(GRAPHQL_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: RUNS_QUERY,
          variables: { project, entity },
        }),
        signal: AbortSignal.timeout(15_000),
      })

      if (resp.status === 401) { this.lastError = 'INVALID_KEY'; return }
      if (resp.status === 429) {
        this.backoffUntil = Date.now() + 10 * 60_000
        this.lastError = 'RATE_LIMIT'
        return
      }
      if (!resp.ok) { this.lastError = `HTTP ${resp.status}`; return }

      const json = await resp.json() as { data?: { project?: { runs?: { edges?: { node: Record<string, unknown> }[] } } }; errors?: { message: string }[] }

      if (json.errors?.length) {
        this.lastError = json.errors[0].message
        return
      }

      const edges = json.data?.project?.runs?.edges ?? []
      const runs = edges.map(e => parseRun(e.node))

      this.triggerNotifications(runs)
      this.lastRuns = runs
      this.lastError = null
      this.lastUpdated = new Date()
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : '网络错误'
    }
  }

  private triggerNotifications(runs: WandBRun[]) {
    for (const run of runs) {
      const prev = this.prevStates.get(run.id)
      const dedupeKey = `${run.id}:${run.state}`

      if (prev !== undefined && prev !== run.state && !this.prevStates.has(dedupeKey)) {
        if (run.state === 'finished') {
          const metric = pickMetric(run.metrics)
          const body = metric
            ? `${run.name}: ${metric.key}=${formatMetricValue(metric.value)}`
            : run.name
          new Notification({ title: '✓ WandB Run 完成', body }).show()
          this.prevStates.set(dedupeKey, 'notified')
        } else if (run.state === 'crashed') {
          const body = run.errorMessage
            ? `${run.name}: ${run.errorMessage.slice(0, 50)}`
            : run.name
          new Notification({ title: '✗ WandB Run 崩溃', body }).show()
          this.prevStates.set(dedupeKey, 'notified')
        } else if (run.state === 'killed') {
          new Notification({ title: '⏸ WandB Run 已终止', body: `${run.name}: 被手动终止` }).show()
          this.prevStates.set(dedupeKey, 'notified')
        }
      }

      this.prevStates.set(run.id, run.state)
    }
  }
}

export const wandbService = new WandBService()
