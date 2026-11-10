import { estimateTokens } from '@shared/utils'
import type { ProviderAdapter, ProviderEvent, ProviderRequest } from './types'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const CAPABILITIES = `I'm the offline demo model inside **WoW Agent**. The harness around me is real — sessions, permissions, checkpoints, subagents and the canvas all work — but I have no network access and cannot reason about your files.

To connect a real model:

1. Open **Settings → Models**.
2. Paste an API key for Moonshot Kimi, DeepSeek, OpenAI, Anthropic, OpenRouter, or point at a local **Ollama** endpoint.
3. Pick the model in the composer.

Then try something concrete, for example:

- *"Read the README and propose three improvements."*
- *"Review the working tree and list only real defects."*
- *"Build a landing page from brief.md and open a preview."*

Every tool call will ask for permission first. You can switch to **Auto** for trusted workspaces, or **Plan** to keep the agent read-only.`

const GREETING = `Hello. I'm the offline demo model in **WoW Agent**.

The workspace, the agent loop, and the permission system are live — but this model is a placeholder. Add a provider key in Settings to bring your own model, or start with **Ollama** if you want everything local.`

export class MockProvider implements ProviderAdapter {
  readonly kind = 'mock'

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderEvent> {
    const lastUser = [...request.messages].reverse().find((message) => message.role === 'user')
    const text = (lastUser?.content ?? '').toLowerCase()
    const response =
      /help|what can|capab|how do|start|setup|demo/.test(text) || !text
        ? CAPABILITIES
        : /hello|hi\b|hey/.test(text)
          ? GREETING
          : CAPABILITIES

    const inputTokens = request.messages.reduce(
      (total, message) => total + estimateTokens(message.content) + 4,
      0
    )
    let outputTokens = 0
    yield { type: 'usage', inputTokens }

    const chunks = response.match(/.{1,14}/gs) ?? [response]
    for (const chunk of chunks) {
      if (request.signal.aborted) {
        yield { type: 'done', reason: 'aborted' }
        return
      }
      await sleep(14)
      outputTokens += estimateTokens(chunk)
      yield { type: 'text', delta: chunk }
    }
    yield { type: 'usage', outputTokens }
    yield { type: 'done', reason: 'stop' }
  }

  async ping(): Promise<{ ok: boolean; message: string; models?: string[] }> {
    return { ok: true, message: 'Offline demo provider is ready.', models: ['wow-demo'] }
  }
}
