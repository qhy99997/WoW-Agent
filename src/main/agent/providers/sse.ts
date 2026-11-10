export interface SseMessage {
  event?: string
  data: string
}

/**
 * Incremental SSE parser. Works with OpenAI (`data:` only) and Anthropic
 * (`event:` + `data:`), tolerating CRLF and multi-line data fields.
 */
export async function* parseSse(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<SseMessage> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const flush = (raw: string): SseMessage | null => {
    const lines = raw.split(/\r?\n/)
    let event: string | undefined
    const data: string[] = []
    for (const line of lines) {
      if (!line || line.startsWith(':')) continue
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''))
    }
    if (!data.length) return null
    return { event, data: data.join('\n') }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const message = flush(raw)
        if (message) yield message
        boundary = buffer.indexOf('\n\n')
      }
    }
    buffer += decoder.decode()
    const tail = flush(buffer.trim())
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}
