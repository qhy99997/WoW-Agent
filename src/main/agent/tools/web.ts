import { z } from 'zod'
import { toolError, type ToolDefinition } from './types'

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“'
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

export function htmlToText(html: string): { title: string; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const title = titleMatch ? stripTags(titleMatch[1]) : ''
  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/section|\/article|\/h[1-6])[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ')
  body = decodeEntities(body)
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .replace(/ *\n */g, '\n')
    .trim()
  return { title, text: body }
}

async function readBodyCapped(
  response: Response,
  maxBytes: number
): Promise<{ text: string; truncated: boolean }> {
  if (!response.body) return { text: '', truncated: false }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let truncated = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > maxBytes) {
        const remaining = maxBytes - (total - value.byteLength)
        if (remaining > 0) chunks.push(value.subarray(0, remaining))
        truncated = true
        break
      }
      chunks.push(value)
    }
  } finally {
    reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  return {
    text: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8'),
    truncated
  }
}

const fetchSchema = z.object({
  url: z.string().url(),
  max_chars: z.number().int().min(1000).max(60_000).optional()
})

const fetchTool: ToolDefinition = {
  name: 'web_fetch',
  label: '抓取 URL',
  description:
    'Fetch a URL and return readable text. HTML is reduced to main text. Use for docs, articles, and local previews.',
  risk: 'network',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'http(s) URL' },
      max_chars: { type: 'number', description: 'Default 20000, max 60000' }
    },
    required: ['url']
  },
  schema: fetchSchema,
  async run(input, context) {
    const args = fetchSchema.parse(input)
    try {
      const url = new URL(args.url)
      if (!['http:', 'https:'].includes(url.protocol)) {
        return toolError('仅支持 http 和 https URL。')
      }
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(20_000)])
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
          Accept: 'text/html,application/json,text/plain,*/*;q=0.8'
        },
        redirect: 'follow',
        signal
      })
      if (!response.ok) {
        return toolError(`请求失败（${response.status} ${response.statusText}）。`)
      }
      const type = response.headers.get('content-type') ?? ''
      if (!/text|json|xml|javascript|html/i.test(type) && type) {
        return toolError(`不支持的内容类型：${type}`)
      }
      const { text: raw, truncated } = await readBodyCapped(response, 2_000_000)
      const isHtml = /html/i.test(type) || /<html|<body|<div/i.test(raw.slice(0, 500))
      const converted = isHtml ? htmlToText(raw) : { title: '', text: raw }
      const maxChars = args.max_chars ?? 20_000
      let text = converted.text
      if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n…[内容已截断]`
      return {
        content: `链接：${url.toString()}\n标题：${converted.title || '（无）'}\n\n${text}${
          truncated ? '\n…[响应正文已截断]' : ''
        }`,
        title: `已抓取 ${url.hostname}`,
        detail: { url: url.toString(), preview: text.slice(0, 4000) }
      }
    } catch (error) {
      const message =
        error instanceof Error && error.name === 'TimeoutError'
          ? '请求在 20 秒后超时。'
          : error instanceof Error
            ? error.message
            : String(error)
      return toolError(`抓取失败：${message}`)
    }
  }
}

function decodeDuckLink(href: string): string {
  try {
    const url = new URL(href, 'https://duckduckgo.com')
    const target = url.searchParams.get('uddg')
    return target ? decodeURIComponent(target) : url.toString()
  } catch {
    return href
  }
}

async function searchBing(query: string, signal: AbortSignal): Promise<
  { title: string; url: string; snippet: string }[]
> {
  const response = await fetch(
    `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss&count=10`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0',
        Accept: 'application/rss+xml,text/xml,*/*'
      },
      signal
    }
  )
  if (!response.ok) return []
  const xml = await response.text()
  const items: { title: string; url: string; snippet: string }[] = []
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = match[1]
    const title = /<title>([\s\S]*?)<\/title>/i.exec(block)?.[1] ?? ''
    const link = /<link>([\s\S]*?)<\/link>/i.exec(block)?.[1] ?? ''
    const description = /<description>([\s\S]*?)<\/description>/i.exec(block)?.[1] ?? ''
    if (!link) continue
    items.push({
      title: stripTags(title.replace(/<!\[CDATA\[|\]\]>/g, '')),
      url: stripTags(link.replace(/<!\[CDATA\[|\]\]>/g, '')),
      snippet: stripTags(description.replace(/<!\[CDATA\[|\]\]>/g, ''))
    })
    if (items.length >= 8) break
  }
  return items
}

async function searchDuckDuckGo(
  query: string,
  signal: AbortSignal
): Promise<{ title: string; url: string; snippet: string }[]> {
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      Accept: 'text/html'
    },
    signal
  })
  if (!response.ok) return []
  const html = await response.text()
  const results: { title: string; url: string; snippet: string }[] = []
  const linkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const snippetRegex = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi
  const snippets = [...html.matchAll(snippetRegex)].map((match) => stripTags(match[1]))
  let index = 0
  for (const match of html.matchAll(linkRegex)) {
    results.push({
      title: stripTags(match[2]),
      url: decodeDuckLink(decodeEntities(match[1])),
      snippet: snippets[index] ?? ''
    })
    index += 1
    if (results.length >= 8) break
  }
  return results
}

const searchSchema = z.object({
  query: z.string().min(2),
  max_results: z.number().int().min(1).max(8).optional()
})

const searchTool: ToolDefinition = {
  name: 'web_search',
  label: '网络搜索',
  description: 'Search the web and return titles, URLs, and snippets. Follow up with web_fetch for details.',
  risk: 'network',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      max_results: { type: 'number', description: '1-8, default 6' }
    },
    required: ['query']
  },
  schema: searchSchema,
  async run(input, context) {
    const args = searchSchema.parse(input)
    const signal = AbortSignal.any([context.signal, AbortSignal.timeout(20_000)])
    try {
      let results = await searchBing(args.query, signal).catch(() => [])
      if (!results.length) {
        results = await searchDuckDuckGo(args.query, signal).catch(() => [])
      }
      if (!results.length) {
        return toolError(
          '没有返回搜索结果。请换一个查询，或对已知 URL 使用 web_fetch。'
        )
      }
      const limited = results.slice(0, args.max_results ?? 6)
      const body = limited
        .map(
          (result, index) =>
            `${index + 1}. ${result.title}\n   ${result.url}\n   ${result.snippet}`
        )
        .join('\n\n')
      return {
        content: `“${args.query}”的搜索结果：\n\n${body}`,
        title: `已搜索“${args.query.slice(0, 48)}”`,
        detail: { preview: body.slice(0, 4000) }
      }
    } catch (error) {
      return toolError(
        error instanceof Error && error.name === 'TimeoutError'
          ? '搜索超时。'
          : `搜索失败：${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

export const webTools: ToolDefinition[] = [fetchTool, searchTool]
