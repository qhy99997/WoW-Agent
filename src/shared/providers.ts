import type { ProviderView } from './types'

export interface ProviderPreset {
  id: string
  name: string
  kind: ProviderView['kind']
  baseUrl: string
  models: string[]
  contextWindow: number
  headers?: Record<string, string>
  hint?: string
  requiresKey: boolean
}

/**
 * Presets are editable starting points, not a hard-coded model catalogue.
 * Model IDs move fast; the settings screen always accepts custom IDs.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'moonshot',
    name: 'Moonshot Kimi',
    kind: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: ['kimi-latest', 'kimi-k2-turbo-preview', 'kimi-k2-0905-preview'],
    contextWindow: 256_000,
    hint: '兼容 OpenAI 的接口。请使用 platform.moonshot.cn 提供的 API Key。',
    requiresKey: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    contextWindow: 128_000,
    hint: '兼容 OpenAI 的接口。推理内容会以“思考过程”展示。',
    requiresKey: true
  },
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5', 'gpt-5-mini', 'gpt-4.1'],
    contextWindow: 256_000,
    hint: '标准 Chat Completions API。模型 ID 可自由编辑。',
    requiresKey: true
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
    contextWindow: 200_000,
    hint: '原生 Messages API，支持流式工具调用。',
    requiresKey: true
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-sonnet-4.5', 'moonshotai/kimi-k2', 'openai/gpt-5'],
    contextWindow: 200_000,
    headers: {
      'HTTP-Referer': 'https://wowagent.local',
      'X-Title': 'WoW Agent'
    },
    hint: '一个密钥即可使用多种模型。可以保留或替换归属请求头。',
    requiresKey: true
  },
  {
    id: 'ollama',
    name: 'Ollama（本地）',
    kind: 'openai',
    baseUrl: 'http://127.0.0.1:11434/v1',
    models: ['qwen3-coder', 'llama3.3', 'gpt-oss:20b'],
    contextWindow: 64_000,
    hint: '在你的电脑上运行。无需 API Key；请先启动 Ollama。',
    requiresKey: false
  },
  {
    id: 'custom',
    name: '自定义端点',
    kind: 'openai',
    baseUrl: '',
    models: [],
    contextWindow: 128_000,
    hint: '任何兼容 OpenAI 的端点，包括 vLLM、LM Studio 或网关。',
    requiresKey: false
  },
  {
    id: 'demo',
    name: '演示（离线）',
    kind: 'mock',
    baseUrl: '',
    models: ['wow-demo'],
    contextWindow: 32_000,
    hint: '无需网络。会说明如何接入真实模型。',
    requiresKey: false
  }
]

export const presetToProvider = (preset: ProviderPreset): ProviderView => ({
  id: preset.id,
  name: preset.name,
  kind: preset.kind,
  baseUrl: preset.baseUrl,
  models: [...preset.models],
  contextWindow: preset.contextWindow,
  apiKeySet: false,
  enabled: preset.id === 'demo',
  headers: { ...(preset.headers ?? {}) },
  builtin: preset.kind === 'mock'
})

export const PROVIDER_PRESET_MAP = new Map(PROVIDER_PRESETS.map((p) => [p.id, p]))
