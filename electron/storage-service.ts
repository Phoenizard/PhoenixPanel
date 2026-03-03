import { sshManager } from './ssh-manager'

export interface StorageInfo {
  used: number    // GB
  limit: number   // GB
  raw: string     // raw output for debug
}

export interface StorageResult {
  home: StorageInfo | null
  scratch: StorageInfo | null
  fetchedAt: string
}

function parseQuota(output: string, limitGB: number): StorageInfo | null {
  if (!output.trim()) return null
  // quota -s output example:
  // Disk quotas for user k2366837 (uid 12345):
  //      Filesystem   space   quota   limit   grace   files   quota   limit   grace
  //      /dev/sda1    12G     50G     55G
  // We look for lines with numbers followed by G/M/K/T
  const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('Disk') && !l.startsWith('File'))
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 3) continue
    const usedStr = parts[1]
    const quotaStr = parts[2]
    const usedGB = parseSize(usedStr)
    const quotaGB = parseSize(quotaStr)
    if (usedGB !== null) {
      return { used: usedGB, limit: quotaGB ?? limitGB, raw: output }
    }
  }
  return null
}

function parseDu(output: string, _username: string, limitGB: number): StorageInfo | null {
  // du -sh output: "118G\t/scratch/users/k2366837"  or "118G ."
  const line = output.trim().split('\n')[0]
  if (!line) return null
  const sizeStr = line.split(/\s+/)[0]
  const used = parseSize(sizeStr)
  if (used === null) return null
  return { used, limit: limitGB, raw: output }
}

function parseSize(s: string): number | null {
  if (!s) return null
  const match = s.match(/^([\d.]+)([TGMK]?)$/i)
  if (!match) return null
  const num = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  switch (unit) {
    case 'T': return num * 1024
    case 'G': return num
    case 'M': return num / 1024
    case 'K': return num / (1024 * 1024)
    default:  return num / (1024 * 1024 * 1024) // bytes
  }
}

class StorageService {
  private cache: StorageResult | null = null
  private fetching = false

  async fetch(scratchPath: string, homeLimitGB: number, scratchLimitGB: number): Promise<StorageResult> {
    if (this.fetching) return this.cache ?? this.emptyResult()
    this.fetching = true

    const username = sshManager.getUsername()
    const resolvedScratch = scratchPath || `/scratch/users/${username}`

    const [homeOut, scratchOut] = await Promise.allSettled([
      sshManager.executeCommand('quota -s'),
      sshManager.executeCommand(`du -sh ${resolvedScratch}`),
    ])

    const result: StorageResult = {
      home: homeOut.status === 'fulfilled'
        ? parseQuota(homeOut.value, homeLimitGB)
        : null,
      scratch: scratchOut.status === 'fulfilled'
        ? parseDu(scratchOut.value, username, scratchLimitGB)
        : null,
      fetchedAt: new Date().toISOString(),
    }

    this.cache = result
    this.fetching = false
    return result
  }

  getCache(): StorageResult | null {
    return this.cache
  }

  private emptyResult(): StorageResult {
    return { home: null, scratch: null, fetchedAt: new Date().toISOString() }
  }
}

export const storageService = new StorageService()
