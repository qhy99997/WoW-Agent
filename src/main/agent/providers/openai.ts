import type { ToolCall } from '@shared/types'
import { parseSse } from './sse'
import {
  ProviderError,
  readErrorBody,
  toOpenAIContent,
  type ProviderAdapter,
  type ProviderEvent,
  type ProviderRequest
} from './types'

interface OpenAIConfig {
  baseUrl: string
  apiKey?: string
  headers?: Record<string, string>
}

function normaliseBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

function chatEndpoint(baseUrl: string): string {
  const base = normaliseBase(baseUrl)
  if (base.endsWith('/chat/completions')) return base
  return `${base}/chat/completions`
}

function modelsEndpoint(baseUrl: string): string {
  const base = normaliseBase(baseUrl).replace(/\/chat\/completions$/, '')
  return `${base}/models`
}

function authHeaders(config: OpenAIConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(config.headers ?? {})
  }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`
  return headers
}

function toOpenAIMessages(messages: ProviderRequest['messages']): unknown[] {
  return messages.map((message) => {
    if (message.role === 'tool') {
      return {
        role: 'tool',
        tool_call_id: message.toolCallId,
        content: message.content
      }
    }
    if (message.role === 'assistant') {
      const payload: Record<string, unknown> = {
        role: 'assistant',
        content: message.content || null
      }
      if (message.toolCalls?.length) {
        payload.tool_calls = message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: call.arguments }
        }))
      }
      return payload
    }
    if (message.role === 'user') {
      return { role: 'user', content: toOpenAIContent(message) }
    }
    return { role: 'system', content: message.content }
  })
}

interface ToolAccumulator {
  id: string
  name: string
  arguments: string
}

export class OpenAIProvider implements ProviderAdapter {
  readonly kind = 'openai'

  constructor(private readonly config: OpenAIConfig) {}

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderEvent> {
    const endpoint = chatEndpoint(this.config.baseUrl)
    if (!/^https?:\/\//i.test(endpoint)) {
      throw new ProviderError('This provider has no valid base URL. Add one in Settings.')
    }

    const body: Record<string, unknown> = {
      model: request.model,
      messages: toOpenAIMessages(request.messages),
      stream: true,
      stream_options: { include_usage: true },
      temperature: request.temperature
    }
    if (request.tools.length) {
      body.tools = request.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }))
      body.tool_choice = 'auto'
    }
    if (request.maxTokens) body.max_tokens = request.maxTokens

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(this.config),
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
      const detail = await readErrorBody(response)
      throw new ProviderError(
        `Model request failed (${response.status}): ${detail || response.statusText}`,
        response.status
      )
    }
    if (!response.body) throw new ProviderError('The provider returned an empty stream.')

    const calls = new Map<number, ToolAccumulator>()
    let finish: string | null = null
    let aborted = false

    try {
      for await (const event of parseSse(response.body)) {
        if (request.signal.aborted) {
          aborted = true
          break
        }
        if (event.data === '[DONE]') break
        let payload: Record<string, unknown>
        try {
          payload = JSON.parse(event.data) as Record<string, unknown>
        } catch {
          continue
        }

        if (payload.error) {
          const err = payload.error as { message?: string }
          throw new ProviderError(err.message || 'The provider reported an error.')
        }

        const usage = payload.usage as
          | {
              prompt_tokens?: number
              completion_tokens?: number
              prompt_tokens_details?: { cached_tokens?: number }
            }
          | undefined
        if (usage) {
          yield {
            type: 'usage',
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            cachedTokens: usage.prompt_tokens_details?.cached_tokens
          }
        }

        const choices = payload.choices as
          | {
              delta?: {
                content?: string | null
                reasoning_content?: string
                reasoning?: string
                tool_calls?: {
                  index?: number
                  id?: string
                  function?: { name?: string; arguments?: string }
                }[]
              }
              finish_reason?: string | null
            }[]
          | undefined
        const choice = choices?.[0]
        if (!choice) continue
        const delta = choice.delta ?? {}

        if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
          yield { type: 'reasoning', delta: delta.reasoning_content }
        } else if (typeof delta.reasoning === 'string' && delta.reasoning) {
          yield { type: 'reasoning', delta: delta.reasoning }
        }
        if (typeof delta.content === 'string' && delta.content) {
          yield { type: 'text', delta: delta.content }
        }

        for (const call of delta.tool_calls ?? []) {
          const index = call.index ?? 0
          let accumulator = calls.get(index)
          if (!accumulator) {
            accumulator = { id: '', name: '', arguments: '' }
            calls.set(index, accumulator)
          }
          if (call.id) accumulator.id = call.id
          if (call.function?.name) accumulator.name = call.function.name
          if (call.function?.arguments) accumulator.arguments += call.function.arguments
        }

        if (choice.finish_reason) finish = choice.finish_reason
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

    for (const [index, accumulator] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
      if (!accumulator.name) continue
      const call: ToolCall = {
        id: accumulator.id || `call_${Date.now()}_${index}`,
        name: accumulator.name,
        arguments: accumulator.arguments || '{}'
      }
      yield { type: 'tool_call', call }
    }

    yield {
      type: 'done',
      reason:
        finish === 'tool_calls' || calls.size > 0
          ? 'tool_calls'
          : finish === 'length'
            ? 'length'
            : 'stop'
    }
  }

  async ping(): Promise<{ ok: boolean; message: string; models?: string[] }> {
    if (!this.config.baseUrl) return { ok: false, message: 'Base URL is empty.' }
    try {
      const response = await fetch(modelsEndpoint(this.config.baseUrl), {
        headers: authHeaders(this.config),
        signal: AbortSignal.timeout(12_000)
      })
      if (!response.ok) {
        return {
          ok: false,
          message: `Endpoint responded ${response.status}: ${await readErrorBody(response)}`
        }
      }
      const payload = (await response.json()) as { data?: { id?: string }[] }
      const models = (payload.data ?? [])
        .map((entry) => entry.id)
        .filter((id): id is string => Boolean(id))
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
