import type { ProviderView } from '@shared/types'
import { AnthropicProvider } from './anthropic'
import { MockProvider } from './mock'
import { OpenAIProvider } from './openai'
import type { ProviderAdapter } from './types'

export function createProvider(provider: ProviderView, apiKey?: string): ProviderAdapter {
  if (provider.kind === 'mock') return new MockProvider()
  if (provider.kind === 'anthropic') {
    return new AnthropicProvider({
      baseUrl: provider.baseUrl,
      apiKey,
      headers: provider.headers
    })
  }
  return new OpenAIProvider({
    baseUrl: provider.baseUrl,
    apiKey,
    headers: provider.headers
  })
}

export * from './types'
