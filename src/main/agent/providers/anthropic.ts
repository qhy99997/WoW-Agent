import type { ToolCall } from '@shared/types'
import { parseSse } from './sse'
import {
  ProviderError,
  imageBlocks,
  readErrorBody,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest
} from './types'

interface AnthropicConfig {
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
}

type ContentBlock = Record<string, unknown>
type WireMessage = { role: 'user' | 'assistant'; content: ContentBlock[] }

function messagesEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  if (base.endsWith('/messages')) return base
  if (base.endsWith('/v1')) return `${base}/messages`
  return `${base}/v1/messages`
}

function modelsEndpoint(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '')
  const root = base.replace(/\/v1(\/messages)?$/, '').replace(/\/messages$/, '')
  return `${root}/v1/models`
}

function headers(config: AnthropicConfig): Record<string, string> {
  const result: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
    ...(config.headers ?? {})
  }
  if (config.apiKey) result['x-api-key'] = config.apiKey
  return result
}

function buildMessages(messages: ProviderRequest['messages']): {
  system: string
  messages: WireMessage[]
} {
  const systemParts: string[] = []
  const output: WireMessage[] = []

  const push = (role: 'user' | 'assistant', blocks: ContentBlock[]): void => {
    if (!blocks.length) return
    const last = output[output.length - 1]
    if (last && last.role === role) last.content.push(...blocks)
    else output.push({ role, content: blocks })
  }

  for (const message of messages) {
    if (message.role === 'system') {
      if (message.content) systemParts.push(message.content)
      continue
    }
    if (message.role === 'user') {
      const blocks: ContentBlock[] = []
      if (message.content) blocks.push({ type: 'text', text: message.content })
      blocks.push(...imageBlocks(message.images ?? []))
      push('user', blocks)
      continue
    }
    if (message.role === 'assistant') {
      const blocks: ContentBlock[] = []
      if (message.content) blocks.push({ type: 'text', text: message.content })
      for (const call of message.toolCalls ?? []) {
        let input: unknown = {}
        try {
          input = JSON.parse(call.arguments)
        } catch {
          input = {}
        }
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input })
      }
      push('assistant', blocks)
      continue
    }
    if (message.role === 'tool') {
      push('user', [
        {
          type: 'tool_result',
          tool_use_id: message.toolCallId,
          content: message.content || '(empty)'
        }
      ])
    }
  }
  return { system: systemParts.join('\n\n'), messages: output }
}

interface ToolBlock {
  id: string
  name: string
  json: string
}

export class AnthropicProvider implements ProviderAdapter {
  readonly kind = 'anthropic'

  constructor(private readonly config: AnthropicConfig) {}

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderEvent> {
    const endpoint = messagesEndpoint(this.config.baseUrl)
    if (!/^https?:\/\//i.test(endpoint)) {
      throw new ProviderError('This provider has no valid base URL. Add one in Settings.')
    }
    const built = buildMessages(request.messages)
    const body: Record<string, unknown> = {
      model: request.model,
      system: built.system || undefined,
      messages: built.messages,
      max_tokens: request.maxTokens ?? 8192,
      temperature: request.temperature,
      stream: true
    }
    if (request.tools.length) {
      body.tools = request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters
      }))
    }

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: headers(this.config),
        body: JSON.stringify(body),
        signal: request.signal
      })
    } catch (error) {
      if (request.signal.aborted) {
        yield { type: 'done', reason: 'aborted' }
        return
      }
      throw new ProviderError(
        `Could not reach ${endpoint}: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    if (!response.ok) {
      throw new ProviderError(
        `Model request failed (${response.status}): ${await readErrorBody(response)}`,
        response.status
      )
    }
    if (!response.body) throw new ProviderError('The provider returned an empty stream.')

    const toolBlocks = new Map<number, ToolBlock>()
    let stopReason: string | null = null
    let aborted = false

    try {
      for await (const message of parseSse(response.body)) {
        if (request.signal.aborted) {
          aborted = true
          break
        }
        let payload: Record<string, unknown>
        try {
          payload = JSON.parse(message.data) as Record<string, unknown>
        } catch {
          continue
        }
        const type = (message.event ?? payload.type) as string

        if (type === 'error') {
          const error = payload.error as { message?: string } | undefined
          throw new ProviderError(error?.message || 'The provider reported an error.')
        }

        if (type === 'message_start') {
          const usage = (payload.message as { usage?: Record<string, number> } | undefined)?.usage
          if (usage) {
            yield {
              type: 'usage',
              inputTokens: usage.input_tokens,
              cachedTokens: usage.cache_read_input_tokens
            }
          }
          continue
        }

        if (type === 'content_block_start') {
          const index = Number(payload.index ?? 0)
          const block = payload.content_block as
            | { type?: string; id?: string; name?: string }
            | undefined
          if (block?.type === 'tool_use') {
            toolBlocks.set(index, { id: block.id ?? '', name: block.name ?? '', json: '' })
          }
          continue
        }

        if (type === 'content_block_delta') {
          const index = Number(payload.index ?? 0)
          const delta = payload.delta as
            | { type?: string; text?: string; partial_json?: string; thinking?: string }
            | undefined
          if (delta?.type === 'text_delta' && delta.text) {
            yield { type: 'text', delta: delta.text }
          } else if (delta?.type === 'thinking_delta' && delta.thinking) {
            yield { type: 'reasoning', delta: delta.thinking }
          } else if (delta?.type === 'input_json_delta' && delta.partial_json) {
            const tool = toolBlocks.get(index)
            if (tool) tool.json += delta.partial_json
          }
          continue
        }

        if (type === 'content_block_stop') {
          const index = Number(payload.index ?? 0)
          const tool = toolBlocks.get(index)
          if (tool) {
            toolBlocks.delete(index)
            if (tool.name) {
              const call: ToolCall = {
                id: tool.id || `toolu_${Date.now()}_${index}`,
                name: tool.name,
                arguments: tool.json || '{}'
              }
              yield { type: 'tool_call', call }
            }
          }
          continue
        }

        if (type === 'message_delta') {
          const delta = payload.delta as { stop_reason?: string } | undefined
          if (delta?.stop_reason) stopReason = delta.stop_reason
          const usage = payload.usage as { output_tokens?: number } | undefined
          if (usage?.output_tokens) yield { type: 'usage', outputTokens: usage.output_tokens }
          continue
        }
      }
    } catch (error) {
      if (request.signal.aborted) {
        aborted = true
      } else if (error instanceof ProviderError) {
        throw error
      } else {
        throw new ProviderError(
          `Streaming failed: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }

    if (aborted) {
      yield { type: 'done', reason: 'aborted' }
      return
    }
    yield {
      type: 'done',
      reason:
        stopReason === 'tool_use'
          ? 'tool_calls'
          : stopReason === 'max_tokens'
            ? 'length'
            : 'stop'
    }
  }

  async ping(): Promise<{ ok: boolean; message: string; models?: string[] }> {
    if (!this.config.baseUrl) return { ok: false, message: 'Base URL is empty.' }
    try {
      const response = await fetch(modelsEndpoint(this.config.baseUrl), {
        headers: headers(this.config),
        signal: AbortSignal.timeout(12_000)
      })
      if (!response.ok) {
        return {
          ok: false,
          message: `Endpoint responded ${response.status}: ${await readErrorBody(response)}`
        }
      }
      const payload = (await response.json()) as { data?: { id?: string }[] }
      const models = (payload.data ?? []).map((entry) => entry.id).filter(Boolean) as string[]
      return {
        ok: true,
        message: models.length
          ? `Connected. ${models.length} models available.`
          : 'Connected to the endpoint.',
        models
      }
    } catch (error) {
      return {
        ok: false,
        message: `Connection failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}
