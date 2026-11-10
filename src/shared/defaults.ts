import type { AppSettings } from './types'
import { presetToProvider, PROVIDER_PRESETS } from './providers'

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  accent: 'ember',
  providers: PROVIDER_PRESETS.map(presetToProvider),
  defaultModel: { providerId: 'demo', model: 'wow-demo' },
  defaultPermissionMode: 'ask',
  defaultWorkspace: null,
  recentWorkspaces: [],
  maxSteps: 40,
  temperature: 0.4,
  compactAt: 0.72,
  sendOnEnter: true,
  showReasoning: true,
  hooksEnabled: true,
  onboarded: false
}

export const MODEL_CONTEXT_FALLBACK = 128_000
