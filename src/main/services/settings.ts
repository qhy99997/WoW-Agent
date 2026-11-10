import type {
  AppSettings,
  ProviderPatch,
  ProviderView,
  SettingsPatch
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import { presetToProvider, PROVIDER_PRESETS } from '@shared/providers'
import type { AppPaths } from './paths'
import type { SecretStore } from './secrets'
import { readJson, writeJson } from '../util/fsx'

type PersistedSettings = Partial<AppSettings> & { hiddenProviders?: string[] }

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export class SettingsService {
  private settings: AppSettings = structuredClone(DEFAULT_SETTINGS)
  private hiddenProviders = new Set<string>()
  private loaded = false

  constructor(
    private readonly paths: AppPaths,
    private readonly secrets: SecretStore
  ) {}

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    await this.secrets.load()
    const raw = await readJson<PersistedSettings>(this.paths.settingsFile, {})
    this.hiddenProviders = new Set(raw.hiddenProviders ?? [])

    const saved = Array.isArray(raw.providers) ? raw.providers : []
    const merged = new Map(saved.map((provider) => [provider.id, provider]))
    for (const preset of PROVIDER_PRESETS) {
      if (!merged.has(preset.id) && !this.hiddenProviders.has(preset.id)) {
        merged.set(preset.id, presetToProvider(preset))
      }
    }

    this.settings = {
      ...DEFAULT_SETTINGS,
      ...raw,
      providers: [...merged.values()].map((provider) => this.normaliseProvider(provider)),
      recentWorkspaces: Array.isArray(raw.recentWorkspaces) ? raw.recentWorkspaces : []
    }
    delete (this.settings as PersistedSettings).hiddenProviders

    this.settings.maxSteps = Math.round(clamp(this.settings.maxSteps, 4, 100, 40))
    this.settings.temperature = clamp(this.settings.temperature, 0, 2, 0.4)
    this.settings.compactAt = clamp(this.settings.compactAt, 0.4, 0.95, 0.72)

    if (!this.settings.defaultModel || !this.getProvider(this.settings.defaultModel.providerId)) {
      this.settings.defaultModel = this.firstUsableModel()
    }
    await this.flush()
  }

  get(): AppSettings {
    return structuredClone({
      ...this.settings,
      providers: this.settings.providers.map((provider) => this.view(provider))
    })
  }

  getProvider(id: string): ProviderView | undefined {
    return this.settings.providers.find((provider) => provider.id === id)
  }

  getProviderRaw(id: string): ProviderView | undefined {
    return this.settings.providers.find((provider) => provider.id === id)
  }

  getApiKey(id: string): string | undefined {
    return this.secrets.get(id)
  }

  getModelContext(providerId: string): number {
    return this.getProviderRaw(providerId)?.contextWindow ?? 128_000
  }

  async update(patch: SettingsPatch): Promise<AppSettings> {
    if (patch.theme) this.settings.theme = patch.theme
    if (patch.accent) this.settings.accent = patch.accent
    if (patch.defaultPermissionMode) {
      this.settings.defaultPermissionMode = patch.defaultPermissionMode
    }
    if (patch.defaultModel !== undefined) this.settings.defaultModel = patch.defaultModel
    if (patch.defaultWorkspace !== undefined) {
      this.settings.defaultWorkspace = patch.defaultWorkspace
      if (patch.defaultWorkspace) this.rememberWorkspace(patch.defaultWorkspace)
    }
    if (patch.maxSteps !== undefined) {
      this.settings.maxSteps = Math.round(clamp(patch.maxSteps, 4, 100, 40))
    }
    if (patch.temperature !== undefined) {
      this.settings.temperature = clamp(patch.temperature, 0, 2, 0.4)
    }
    if (patch.compactAt !== undefined) {
      this.settings.compactAt = clamp(patch.compactAt, 0.4, 0.95, 0.72)
    }
    if (patch.sendOnEnter !== undefined) this.settings.sendOnEnter = patch.sendOnEnter
    if (patch.showReasoning !== undefined) this.settings.showReasoning = patch.showReasoning
    if (patch.hooksEnabled !== undefined) this.settings.hooksEnabled = patch.hooksEnabled
    if (patch.onboarded !== undefined) this.settings.onboarded = patch.onboarded

    if (this.settings.defaultModel) {
      const provider = this.getProvider(this.settings.defaultModel.providerId)
      if (!provider || !provider.enabled) this.settings.defaultModel = this.firstUsableModel()
    }
    await this.flush()
    return this.get()
  }

  async updateProvider(patch: ProviderPatch): Promise<AppSettings> {
    let provider = this.settings.providers.find((entry) => entry.id === patch.id)
    if (!provider) {
      const preset = PROVIDER_PRESETS.find((entry) => entry.id === patch.id)
      provider = preset
        ? presetToProvider(preset)
        : {
            id: patch.id,
            name: patch.name ?? patch.id,
            kind: patch.kind ?? 'openai',
            baseUrl: patch.baseUrl ?? '',
            models: patch.models ?? [],
            contextWindow: patch.contextWindow ?? 128_000,
            apiKeySet: false,
            enabled: true,
            headers: {}
          }
      this.settings.providers.push(provider)
      this.hiddenProviders.delete(patch.id)
    }

    if (patch.name !== undefined) provider.name = patch.name.trim() || provider.name
    if (patch.kind !== undefined) provider.kind = patch.kind
    if (patch.baseUrl !== undefined) provider.baseUrl = patch.baseUrl.trim()
    if (patch.models !== undefined) {
      provider.models = patch.models.map((model) => model.trim()).filter(Boolean)
    }
    if (patch.contextWindow !== undefined) {
      provider.contextWindow = Math.round(clamp(patch.contextWindow, 4096, 2_000_000, 128_000))
    }
    if (patch.enabled !== undefined) provider.enabled = patch.enabled
    if (patch.headers !== undefined) provider.headers = { ...patch.headers }
    if (patch.apiKey !== undefined) {
      await this.secrets.set(provider.id, patch.apiKey)
      provider.apiKeySet = this.secrets.has(provider.id)
    }

    if (!provider.builtin && provider.enabled && !this.settings.defaultModel) {
      this.settings.defaultModel = this.firstUsableModel()
    }
    await this.flush()
    return this.get()
  }

  async removeProvider(id: string): Promise<AppSettings> {
    const provider = this.getProviderRaw(id)
    if (provider?.builtin) throw new Error('演示供应商无法移除')
    this.settings.providers = this.settings.providers.filter((entry) => entry.id !== id)
    this.hiddenProviders.add(id)
    await this.secrets.remove(id)
    if (this.settings.defaultModel?.providerId === id) {
      this.settings.defaultModel = this.firstUsableModel()
    }
    await this.flush()
    return this.get()
  }

  rememberWorkspace(workspace: string): void {
    const recent = [workspace, ...this.settings.recentWorkspaces.filter((w) => w !== workspace)]
    this.settings.recentWorkspaces = recent.slice(0, 8)
  }

  async flush(): Promise<void> {
    const persisted: PersistedSettings = {
      ...this.settings,
      providers: this.settings.providers.map((provider) => this.view(provider)),
      hiddenProviders: [...this.hiddenProviders]
    }
    await writeJson(this.paths.settingsFile, persisted)
  }

  private view(provider: ProviderView): ProviderView {
    return {
      ...provider,
      apiKeySet: this.secrets.has(provider.id),
      headers: { ...provider.headers },
      models: [...provider.models]
    }
  }

  private normaliseProvider(provider: ProviderView): ProviderView {
    const preset = PROVIDER_PRESETS.find((entry) => entry.id === provider.id)
    return {
      id: provider.id,
      name: provider.name || preset?.name || provider.id,
      kind: provider.kind ?? preset?.kind ?? 'openai',
      baseUrl: provider.baseUrl ?? preset?.baseUrl ?? '',
      models: Array.isArray(provider.models) ? provider.models.filter(Boolean) : [],
      contextWindow: Number(provider.contextWindow) || preset?.contextWindow || 128_000,
      apiKeySet: false,
      enabled: provider.enabled ?? false,
      headers: provider.headers ?? {},
      builtin: provider.builtin || preset?.kind === 'mock'
    }
  }

  private firstUsableModel(): AppSettings['defaultModel'] {
    const provider =
      this.settings.providers.find((entry) => entry.enabled && entry.kind === 'mock') ??
      this.settings.providers.find((entry) => entry.enabled && entry.models.length > 0) ??
      this.settings.providers.find((entry) => entry.models.length > 0)
    if (!provider) return null
    return { providerId: provider.id, model: provider.models[0] ?? 'default' }
  }
}
