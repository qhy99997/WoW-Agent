import { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  FolderOpen,
  Info,
  KeyRound,
  Lock,
  Map,
  Monitor,
  Moon,
  Palette,
  Plug,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  X,
  Zap
} from 'lucide-react'
import type {
  AccentName,
  PermissionMode,
  ProviderPatch,
  ProviderTestResult,
  ThemeMode
} from '@shared/types'
import { PROVIDER_PRESETS } from '@shared/providers'
import { api, isDesktop } from '../lib/bridge'
import { useAppStore, type SettingsSection } from '../store/app'
import { CodeBlock } from './CodeBlock'
import { LogoMark } from './LogoMark'

const SECTIONS: { id: SettingsSection; label: string; icon: typeof Settings2 }[] = [
  { id: 'general', label: '通用', icon: SlidersHorizontal },
  { id: 'models', label: '模型', icon: Cpu },
  { id: 'permissions', label: '权限', icon: ShieldCheck },
  { id: 'data', label: '数据', icon: Database },
  { id: 'about', label: '关于', icon: Info }
]

const MODE_INFO: Record<
  PermissionMode,
  { label: string; icon: typeof ShieldCheck; description: string }
> = {
  ask: {
    label: '需要时询问',
    icon: ShieldCheck,
    description: '只读工具自动运行。写入文件和 shell 命令需要批准。'
  },
  auto: {
    label: '自动批准',
    icon: Zap,
    description: '所有工具都无需提示直接运行。仅在你信任的文件夹中使用。'
  },
  plan: {
    label: '先计划',
    icon: Map,
    description: 'agent 只读。它会先调查并提交计划供你批准，然后才编辑。'
  }
}

const HOOK_EXAMPLE = `{
  "PreToolUse": [
    {
      "matcher": "bash|write_file",
      "command": "node .wow/hooks/guard.mjs",
      "timeout": 10
    }
  ],
  "PostToolUse": [
    { "command": "node .wow/hooks/audit.mjs" }
  ]
}`

function Row({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="settings-row">
      <div className="settings-row-copy">
        <span className="settings-row-title">{title}</span>
        {description ? <span className="settings-row-desc">{description}</span> : null}
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      className="switch"
      data-on={on}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      title={on ? '开' : '关'}
    />
  )
}

function GeneralSection() {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const addToast = useAppStore((state) => state.addToast)
  if (!settings) return null

  const pickWorkspace = async (): Promise<void> => {
    const directory = await api.app.pickDirectory()
    if (directory) await updateSettings({ defaultWorkspace: directory })
  }

  const themes: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
    { id: 'system', label: '跟随系统', icon: Monitor },
    { id: 'light', label: '浅色', icon: Sun },
    { id: 'dark', label: '深色', icon: Moon }
  ]
  const accents: { id: AccentName; color: string; label: string }[] = [
    { id: 'ember', color: '#d2542e', label: '炽焰' },
    { id: 'moss', color: '#4f7a58', label: '苔绿' },
    { id: 'ocean', color: '#326f8a', label: '海蓝' }
  ]

  return (
    <div className="settings-section">
      <h3>外观</h3>
      <Row title="主题" description="跟随 Windows，或固定一个主题。">
        <div className="segmented">
          {themes.map((theme) => {
            const Icon = theme.icon
            return (
              <button
                key={theme.id}
                className={settings.theme === theme.id ? 'active' : ''}
                onClick={() => void updateSettings({ theme: theme.id })}
              >
                <Icon size={13} /> {theme.label}
              </button>
            )
          })}
        </div>
      </Row>
      <Row title="强调色" description="用于操作、焦点和激活状态。">
        <div className="accent-row">
          {accents.map((accent) => (
            <button
              key={accent.id}
              className={`accent-swatch ${settings.accent === accent.id ? 'active' : ''}`}
              style={{ background: accent.color }}
              title={accent.label}
              onClick={() => void updateSettings({ accent: accent.id })}
            >
              {settings.accent === accent.id ? <Check size={12} /> : null}
            </button>
          ))}
        </div>
      </Row>

      <h3>行为</h3>
      <Row title="按 Enter 发送" description="Shift+Enter 始终插入换行。">
        <Toggle
          on={settings.sendOnEnter}
          onChange={(next) => void updateSettings({ sendOnEnter: next })}
        />
      </Row>
      <Row title="显示思考过程" description="当供应商流式返回模型思考时显示。">
        <Toggle
          on={settings.showReasoning}
          onChange={(next) => void updateSettings({ showReasoning: next })}
        />
      </Row>
      <Row
        title="工作区钩子"
        description="在提示和工具执行前后运行 .wow/hooks.json 中的命令。"
      >
        <Toggle
          on={settings.hooksEnabled}
          onChange={(next) => void updateSettings({ hooksEnabled: next })}
        />
      </Row>

      <h3>默认值</h3>
      <Row title="权限模式" description="新任务开始时使用。">
        <select
          className="select"
          value={settings.defaultPermissionMode}
          onChange={(event) =>
            void updateSettings({
              defaultPermissionMode: event.target.value as PermissionMode
            })
          }
        >
          <option value="ask">需要时询问</option>
          <option value="auto">自动批准</option>
          <option value="plan">先计划</option>
        </select>
      </Row>
      <Row title="默认工作区" description="新任务在此文件夹中开始。">
        <div className="row">
          <input className="input mono" readOnly value={settings.defaultWorkspace ?? ''} />
          <button className="btn btn-sm" onClick={() => void pickWorkspace()}>
            <FolderOpen size={13} /> 选择
          </button>
        </div>
      </Row>

      <h3>Agent 限制</h3>
      <div className="settings-grid-3">
        <label className="field">
          <span>每轮最大步数</span>
          <input
            className="input"
            type="number"
            min={4}
            max={100}
            value={settings.maxSteps}
            onChange={(event) => void updateSettings({ maxSteps: Number(event.target.value) })}
          />
          <small>长工具循环的硬性上限。</small>
        </label>
        <label className="field">
          <span>温度</span>
          <input
            className="input"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={settings.temperature}
            onChange={(event) =>
              void updateSettings({ temperature: Number(event.target.value) })
            }
          />
          <small>越低越确定。</small>
        </label>
        <label className="field">
          <span>压缩阈值</span>
          <input
            className="input"
            type="number"
            min={40}
            max={95}
            value={Math.round(settings.compactAt * 100)}
            onChange={(event) =>
              void updateSettings({ compactAt: Number(event.target.value) / 100 })
            }
          />
          <small>上下文窗口的百分比。</small>
        </label>
      </div>

      <div className="settings-note">
        <Lock size={14} />
        <span>
          API 密钥存储在 settings.json 之外，并使用 Windows 密钥库（DPAPI）加密。
          除了你配置的供应商外，不会向任何地方发送数据。
        </span>
      </div>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => {
          void updateSettings({ onboarded: false })
          addToast('info', '已重置引导', '下次启动时会再次显示欢迎界面。')
        }}
      >
        重置引导
      </button>
    </div>
  )
}

function ModelsSection() {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const updateProvider = useAppStore((state) => state.updateProvider)
  const removeProvider = useAppStore((state) => state.removeProvider)
  const testProvider = useAppStore((state) => state.testProvider)
  const addToast = useAppStore((state) => state.addToast)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    kind: 'openai',
    baseUrl: '',
    models: '',
    contextWindow: 128_000,
    enabled: true
  })
  const [keyInput, setKeyInput] = useState('')
  const [saved, setSaved] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ProviderTestResult | null>(null)

  const providers = settings?.providers ?? []
  const selected = providers.find((provider) => provider.id === selectedId) ?? providers[0]

  useEffect(() => {
    if (!selectedId && providers[0]) setSelectedId(providers[0].id)
  }, [providers, selectedId])

  useEffect(() => {
    if (!selected) return
    setForm({
      name: selected.name,
      kind: selected.kind,
      baseUrl: selected.baseUrl,
      models: selected.models.join('\n'),
      contextWindow: selected.contextWindow,
      enabled: selected.enabled
    })
    setKeyInput('')
    setResult(null)
    setSaved(null)
  }, [selected?.id])

  if (!settings) return null

  const allModels = providers
    .filter((provider) => provider.enabled)
    .flatMap((provider) => provider.models.map((model) => ({ provider, model })))
  const defaultValue = settings.defaultModel
    ? `${settings.defaultModel.providerId}::${settings.defaultModel.model}`
    : ''

  const save = async (): Promise<void> => {
    if (!selected) return
    const patch: ProviderPatch = {
      id: selected.id,
      name: form.name,
      kind: form.kind as ProviderPatch['kind'],
      baseUrl: form.baseUrl,
      models: form.models
        .split(/\r?\n|,/)
        .map((model) => model.trim())
        .filter(Boolean),
      contextWindow: Number(form.contextWindow) || 128_000,
      enabled: form.enabled
    }
    if (keyInput.trim()) patch.apiKey = keyInput.trim()
    const next = await updateProvider(patch)
    if (next) {
      setKeyInput('')
      setSaved('已保存')
      setTimeout(() => setSaved(null), 1800)
    }
  }

  const addProvider = async (): Promise<void> => {
    const id = `custom-${Date.now().toString(36)}`
    const next = await updateProvider({
      id,
      name: '自定义端点',
      kind: 'openai',
      baseUrl: '',
      models: [],
      contextWindow: 128_000,
      enabled: true
    })
    if (next) setSelectedId(id)
  }

  return (
    <div className="settings-section">
      <h3>默认模型</h3>
      <div className="settings-row">
        <div className="settings-row-copy">
          <span className="settings-row-title">新任务使用的模型</span>
          <span className="settings-row-desc">
            你仍可以在输入框中为每个任务切换模型。
          </span>
        </div>
        <select
          className="select"
          value={defaultValue}
          onChange={(event) => {
            const value = event.target.value
            if (!value) {
              void updateSettings({ defaultModel: null })
              return
            }
            const [providerId, ...rest] = value.split('::')
            void updateSettings({ defaultModel: { providerId, model: rest.join('::') } })
          }}
        >
          <option value="">无默认</option>
          {providers
            .filter((provider) => provider.enabled)
            .map((provider) => (
              <optgroup key={provider.id} label={provider.name}>
                {provider.models.map((model) => (
                  <option key={model} value={`${provider.id}::${model}`}>
                    {model}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
      </div>

      <div className="provider-layout">
        <div className="provider-list">
          {providers.map((provider) => (
            <button
              key={provider.id}
              className={`provider-item ${selected?.id === provider.id ? 'active' : ''}`}
              onClick={() => setSelectedId(provider.id)}
            >
              <span className={`provider-status ${provider.enabled ? 'on' : ''}`} />
              <span className="provider-item-copy">
                <span className="truncate">{provider.name}</span>
                <span className="faint">
                  {provider.kind === 'mock'
                    ? '离线演示'
                    : `${provider.models.length} 个模型`}
                  {provider.kind !== 'mock' && !provider.apiKeySet ? ' · 未配置密钥' : ''}
                </span>
              </span>
            </button>
          ))}
          <button className="btn btn-ghost btn-sm provider-add" onClick={() => void addProvider()}>
            <Plug size={13} /> 添加端点
          </button>
        </div>

        {selected ? (
          <div className="provider-editor">
            <div className="provider-editor-head">
              <div>
                <h4>{selected.name}</h4>
                <span className="faint">
                  {selected.builtin
                    ? '内置演示供应商'
                    : selected.kind === 'anthropic'
                      ? 'Anthropic Messages'
                      : 'OpenAI 兼容'}
                </span>
              </div>
              <Toggle
                on={form.enabled}
                onChange={(next) => {
                  setForm({ ...form, enabled: next })
                  void updateProvider({ id: selected.id, enabled: next })
                }}
              />
            </div>

            {selected.builtin ? (
              <div className="settings-note">
                <Sparkles size={14} />
                <span>
                  演示供应商可离线工作，并说明如何接入真实模型。它不会访问网络。
                </span>
              </div>
            ) : (
              <>
                <div className="settings-grid-2">
                  <label className="field">
                    <span>名称</span>
                    <input
                      className="input"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </label>
                  <label className="field">
                    <span>协议</span>
                    <select
                      className="select"
                      value={form.kind}
                      onChange={(event) => setForm({ ...form, kind: event.target.value })}
                    >
                      <option value="openai">OpenAI 兼容</option>
                      <option value="anthropic">Anthropic Messages</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>基础 URL</span>
                  <input
                    className="input mono"
                    value={form.baseUrl}
                    placeholder="https://api.example.com/v1"
                    onChange={(event) => setForm({ ...form, baseUrl: event.target.value })}
                  />
                </label>
                <div className="settings-grid-2">
                  <label className="field">
                    <span>模型（每行一个）</span>
                    <textarea
                      className="textarea mono"
                      rows={5}
                      value={form.models}
                      placeholder={'model-name\nmodel-name-mini'}
                      onChange={(event) => setForm({ ...form, models: event.target.value })}
                    />
                  </label>
                  <div className="stack">
                    <label className="field">
                      <span>上下文窗口（tokens）</span>
                      <input
                        className="input"
                        type="number"
                        min={4096}
                        step={1024}
                        value={form.contextWindow}
                        onChange={(event) =>
                          setForm({ ...form, contextWindow: Number(event.target.value) })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>API 密钥</span>
                      <div className="key-field">
                        <KeyRound size={13} />
                        <input
                          className="input"
                          type="password"
                          value={keyInput}
                          placeholder={
                            selected.apiKeySet ? '已配置 — 留空保持不变' : '粘贴密钥'
                          }
                          onChange={(event) => setKeyInput(event.target.value)}
                        />
                      </div>
                    </label>
                    {selected.apiKeySet ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => void updateProvider({ id: selected.id, apiKey: '' })}
                      >
                        清除已保存的密钥
                      </button>
                    ) : null}
                  </div>
                </div>

                {result ? (
                  <div className={`test-result ${result.ok ? 'ok' : 'fail'}`}>
                    <span>{result.ok ? <Check size={13} /> : <X size={13} />}</span>
                    <div>
                      <strong>{result.ok ? '连接成功' : '连接失败'}</strong>
                      <p>{result.message}</p>
                    </div>
                  </div>
                ) : null}

                <div className="provider-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => void save()}
                  >
                    <Check size={13} /> 保存供应商
                  </button>
                  <button
                    className="btn btn-sm"
                    disabled={testing}
                    onClick={async () => {
                      setTesting(true)
                      try {
                        setResult(await testProvider(selected.id))
                      } finally {
                        setTesting(false)
                      }
                    }}
                  >
                    {testing ? <span className="spinner" /> : <Plug size={13} />} 测试连接
                  </button>
                  {saved ? <span className="saved-note">{saved}</span> : null}
                  <div className="spacer" />
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (window.confirm(`移除“${selected.name}”供应商？`)) {
                        void removeProvider(selected.id)
                        setSelectedId(null)
                        addToast('info', '已移除供应商')
                      }
                    }}
                  >
                    <Trash2 size={13} /> 移除
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="preset-hint">
        <span className="eyebrow">预设</span>
        <p>
          {PROVIDER_PRESETS.filter((preset) => !preset.requiresKey)
            .map((preset) => preset.name)
            .join(' · ')}
        </p>
      </div>
    </div>
  )
}

function PermissionsSection() {
  const settings = useAppStore((state) => state.settings)
  const updateSettings = useAppStore((state) => state.updateSettings)
  if (!settings) return null
  return (
    <div className="settings-section">
      <h3>审批模式</h3>
      <div className="mode-cards">
        {(Object.keys(MODE_INFO) as PermissionMode[]).map((mode) => {
          const info = MODE_INFO[mode]
          const Icon = info.icon
          return (
            <button
              key={mode}
              className={`mode-card ${settings.defaultPermissionMode === mode ? 'active' : ''}`}
              onClick={() => void updateSettings({ defaultPermissionMode: mode })}
            >
              <span className="mode-card-icon">
                <Icon size={16} />
              </span>
              <span className="mode-card-title">
                {info.label}
                {settings.defaultPermissionMode === mode ? <Check size={12} /> : null}
              </span>
              <span className="mode-card-desc">{info.description}</span>
            </button>
          )
        })}
      </div>

      <h3>审批如何工作</h3>
      <ul className="settings-list">
        <li>在询问模式下，只读工具（读取、搜索、抓取）自动运行。</li>
        <li>写入和 shell 命令会生成一张内联审批卡，显示确切的目标。</li>
        <li>
          “始终允许”仅作用于当前任务，并会被子代理继承。它不是全局设置。
        </li>
        <li>
          计划模式会阻止所有写入和命令。agent 必须调用 <code>exit_plan_mode</code>，
          并且你需要批准该计划。
        </li>
        <li>每一轮都会记录一个检查点；变更 → 撤销可恢复它改动过的文件。</li>
      </ul>

      <h3>钩子</h3>
      <div className="settings-row">
        <div className="settings-row-copy">
          <span className="settings-row-title">启用工作区钩子</span>
          <span className="settings-row-desc">
            命令从 stdin 接收 JSON。退出码 2 会阻止 PreToolUse 钩子。
          </span>
        </div>
        <Toggle
          on={settings.hooksEnabled}
          onChange={(next) => void updateSettings({ hooksEnabled: next })}
        />
      </div>
      <CodeBlock code={HOOK_EXAMPLE} language="json" filename=".wow/hooks.json" />

      <h3>子代理</h3>
      <p className="settings-paragraph">
        agent 可以委派给 <strong>explore</strong>、<strong>plan</strong> 或{' '}
        <strong>coder</strong> 子代理。每个子代理都有独立的上下文，只返回最终答案。
        explore 和 plan 是只读的；coder 会继承你的审批模式。子代理不能再创建子代理。
      </p>
    </div>
  )
}

function DataSection() {
  const appInfo = useAppStore((state) => state.appInfo)
  const sessions = useAppStore((state) => state.sessions)
  const library = useAppStore((state) => state.library)
  const skills = useAppStore((state) => state.skills)
  const tasks = useAppStore((state) => state.tasks)
  const session = useAppStore((state) => state.session)
  const addToast = useAppStore((state) => state.addToast)

  const copy = async (value: string): Promise<void> => {
    await navigator.clipboard.writeText(value)
    addToast('success', '已复制', value)
  }

  return (
    <div className="settings-section">
      <h3>存储</h3>
      <div className="data-path">
        <div>
          <span className="eyebrow">应用数据</span>
          <code className="mono">{appInfo?.dataDir ?? '—'}</code>
        </div>
        <div className="row">
          <button
            className="icon-btn sm"
            title="复制路径"
            onClick={() => appInfo && void copy(appInfo.dataDir)}
          >
            <Copy size={13} />
          </button>
          <button
            className="icon-btn sm"
            title="打开文件夹"
            onClick={() => appInfo && void api.app.openPath(appInfo.dataDir)}
          >
            <ExternalLink size={13} />
          </button>
        </div>
      </div>

      <div className="settings-stats">
        <div>
          <strong>{sessions.length}</strong>
          <span>任务</span>
        </div>
        <div>
          <strong>{library.length}</strong>
          <span>资料库条目</span>
        </div>
        <div>
          <strong>{skills.length}</strong>
          <span>技能</span>
        </div>
        <div>
          <strong>{tasks.length}</strong>
          <span>shell 运行</span>
        </div>
      </div>

      <div className="settings-row">
        <div className="settings-row-copy">
          <span className="settings-row-title">当前工作区</span>
          <span className="settings-row-desc mono">{session?.workspace ?? '未打开任务'}</span>
        </div>
        <div className="row">
          <button
            className="btn btn-sm"
            disabled={!session}
            onClick={() => session && void api.app.openPath(session.workspace)}
          >
            <FolderOpen size={13} /> 打开
          </button>
        </div>
      </div>

      <h3>隐私</h3>
      <p className="settings-paragraph">
        会话、diff 和资料库条目都以纯 JSON 形式存储在这台机器上。API 密钥使用操作系统密钥库加密。
        应用从不上传遥测数据。只有在你配置模型或 agent 调用网络工具时，才会发起网络请求。
      </p>

      <div className="settings-note">
        <Database size={14} />
        <span>
          会话数据位于 <code>sessions/</code>，shell 日志位于 <code>tasks/</code>，
          用户技能位于 <code>skills/</code>。
        </span>
      </div>
    </div>
  )
}

function AboutSection() {
  const appInfo = useAppStore((state) => state.appInfo)
  const settings = useAppStore((state) => state.settings)
  return (
    <div className="settings-section about-section">
      <div className="about-hero">
        <LogoMark size={44} />
        <div>
          <h2>WoW Agent</h2>
          <p>面向 Windows 的本地优先 AI 工作台。</p>
        </div>
      </div>

      <div className="about-grid">
        <div>
          <span className="eyebrow">版本</span>
          <span>{appInfo?.version ?? '0.1.0'}</span>
        </div>
        <div>
          <span className="eyebrow">Electron</span>
          <span>{appInfo?.electron ?? '—'}</span>
        </div>
        <div>
          <span className="eyebrow">Chromium</span>
          <span>{appInfo?.chrome?.slice(0, 40) ?? '—'}</span>
        </div>
        <div>
          <span className="eyebrow">Node</span>
          <span>{appInfo?.node ?? '—'}</span>
        </div>
      </div>

      <h3>设计</h3>
      <p className="settings-paragraph">
        agent harness 借鉴了 <strong>Kimi Code</strong> 的思路：流式 agent 循环、每个工具前的权限边界、
        隔离子代理、计划模式、钩子和上下文压缩。工作区交互借鉴了 <strong>Vetta</strong>：
        左侧是会话，右侧是任务画布，输入框承载工作流、模型和权限模式，产出物可以存入知识资料库。
      </p>

      <h3>快捷键</h3>
      <div className="shortcut-grid">
        <span><kbd>Ctrl K</kbd> 命令面板</span>
        <span><kbd>Ctrl N</kbd> 新建任务</span>
        <span><kbd>Ctrl B</kbd> 切换画布</span>
        <span><kbd>Ctrl ,</kbd> 设置</span>
        <span><kbd>Enter</kbd> 发送消息</span>
        <span><kbd>Shift Enter</kbd> 换行</span>
        <span><kbd>/</kbd> 斜杠命令</span>
        <span><kbd>Esc</kbd> 关闭浮层</span>
      </div>

      <div className="about-foot">
        <span>MIT 许可 · 使用 TypeScript、Electron 和 React 构建。</span>
        <span>{isDesktop ? `数据：${settings?.providers.length ?? 0} 个供应商` : '浏览器预览'}</span>
      </div>
    </div>
  )
}

export function SettingsModal() {
  const open = useAppStore((state) => state.settingsOpen)
  const setOpen = useAppStore((state) => state.setSettingsOpen)
  const section = useAppStore((state) => state.settingsSection)
  const setSection = useAppStore((state) => state.setSettingsSection)

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, setOpen])

  if (!open) return null

  return (
    <div className="modal-backdrop settings-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="settings-modal" onMouseDown={(event) => event.stopPropagation()}>
        <header className="settings-head">
          <div className="row">
            <LogoMark size={24} />
            <div>
              <h2>设置</h2>
              <span className="faint">工作区、模型与安全</span>
            </div>
          </div>
          <button className="icon-btn" onClick={() => setOpen(false)} title="关闭设置">
            <X size={16} />
          </button>
        </header>

        <div className="settings-layout">
          <nav className="settings-nav">
            {SECTIONS.map((entry) => {
              const Icon = entry.icon
              return (
                <button
                  key={entry.id}
                  className={section === entry.id ? 'active' : ''}
                  onClick={() => setSection(entry.id)}
                >
                  <Icon size={14} /> {entry.label}
                </button>
              )
            })}
            <div className="settings-nav-foot">
              <Lock size={12} />
              <span>本地优先 · 无遥测</span>
            </div>
          </nav>
          <div className="settings-body">
            {section === 'general' ? <GeneralSection /> : null}
            {section === 'models' ? <ModelsSection /> : null}
            {section === 'permissions' ? <PermissionsSection /> : null}
            {section === 'data' ? <DataSection /> : null}
            {section === 'about' ? <AboutSection /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
