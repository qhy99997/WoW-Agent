/** Small, dependency-free helpers shared by main and renderer. */

export function estimateTokens(text: string): number {
  if (!text) return 0
  let ascii = 0
  let wide = 0
  for (const char of text) {
    if (char.charCodeAt(0) < 128) ascii += 1
    else wide += 1
  }
  return Math.ceil(ascii / 3.8 + wide)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return '0'
  if (tokens < 1000) return String(Math.round(tokens))
  if (tokens < 1_000_000) {
    const value = tokens / 1000
    return `${value < 10 ? value.toFixed(1) : Math.round(value)}k`
  }
  return `${(tokens / 1_000_000).toFixed(1)}m`
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return `${Math.round(ms)} 毫秒`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} 秒`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1000)
  return `${minutes} 分 ${seconds} 秒`
}

export function relativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp
  if (delta < 45_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)} 小时前`
  if (delta < 604_800_000) return `${Math.round(delta / 86_400_000)} 天前`
  return new Date(timestamp).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ')
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, Math.max(0, max - 1))}…`
}

export function isProbablyText(buffer: Uint8Array): boolean {
  const sample = buffer.subarray(0, 8192)
  for (const byte of sample) {
    if (byte === 0) return false
  }
  return true
}

export function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}
