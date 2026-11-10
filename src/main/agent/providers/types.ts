import type { AgentMessage, ImagePart, ToolCall } from '@shared/types'

export interface ProviderTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ProviderRequest {
  model: string
  messages: AgentMessage[]
  tools: ProviderTool[]
  temperature: number
  maxTokens?: number
  signal: AbortSignal
}

export type ProviderEvent =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | {
      type: 'usage'
      inputTokens?: number
      outputTokens?: number
      cachedTokens?: number
    }
  | {
      type: 'done'
      reason: 'stop' | 'tool_calls' | 'length' | 'aborted' | 'error'
      error?: string
    }

export interface ProviderAdapter {
  readonly kind: string
  stream(request: ProviderRequest): AsyncGenerator<ProviderEvent>
  ping(): Promise<{ ok: boolean; message: string; models?: string[] }>
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

export function toOpenAIContent(message: AgentMessage): unknown {
  if (!message.images?.length) return message.content
  const blocks: unknown[] = []
  if (message.content) blocks.push({ type: 'text', text: message.content })
  for (const image of message.images) {
    blocks.push({
      type: 'image_url',
      image_url: { url: `data:${image.mediaType};base64,${image.base64}` }
    })
  }
  return blocks
}

export function imageBlocks(images: ImagePart[]): Record<string, unknown>[] {
  return images.map((image) => ({
    type: 'image',
    source: {
      type: 'base64',
      media_type: image.mediaType,
      data: image.base64
    }
  }))
}

export async function readErrorBody(response: Response): Promise<string> {
  try {
    const text = await response.text()
    try {
      const parsed = JSON.parse(text) as {
        error?: { message?: string }
        message?: string
      }
      return parsed.error?.message || parsed.message || text
    } catch {
      return text
    }
  } catch {
    return response.statusText
  }
}
