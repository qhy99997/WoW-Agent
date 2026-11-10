import {
  Code2,
  FileText,
  Globe,
  Search,
  Sparkles,
  Table2,
  FolderOpen,
  ArrowUpRight,
  Plug
} from 'lucide-react'
import { WORKFLOWS } from '@shared/workflows'
import { useAppStore } from '../store/app'
import { api } from '../lib/bridge'

const ICONS = {
  globe: Globe,
  code: Code2,
  search: Search,
  table: Table2,
  'file-text': FileText,
  sparkles: Sparkles
} as const

function workspaceName(workspace?: string): string {
  if (!workspace) return '当前工作区'
  const parts = workspace.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? workspace
}

export function EmptyState() {
  const session = useAppStore((state) => state.session)
  const settings = useAppStore((state) => state.settings)
  const seedComposer = useAppStore((state) => state.seedComposer)
  const setMode = useAppStore((state) => state.setMode)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const createSession = useAppStore((state) => state.createSession)

  const realProviders =
    settings?.providers.filter(
      (provider) => provider.enabled && provider.kind !== 'mock' && provider.apiKeySet
    ) ?? []
  const localProviders =
    settings?.providers.filter(
      (provider) =>
        provider.enabled &&
        provider.kind !== 'mock' &&
        !provider.apiKeySet &&
        /localhost|127\.0\.0\.1/.test(provider.baseUrl)
    ) ?? []
  const demoOnly = realProviders.length === 0 && localProviders.length === 0

  const pickFolder = async (): Promise<void> => {
    const directory = await api.app.pickDirectory()
    if (directory) await createSession(directory)
  }

  return (
    <div className="empty-state animate-rise">
      <div className="empty-eyebrow">
        <span className="spark-line" />
        <span className="eyebrow">Windows 工作区</span>
      </div>
      <h1 className="empty-title">
        今天想
        <br />
        做点什么？
      </h1>
      <p className="empty-lede">
        一个本地优先的 agent，会在 <strong>{workspaceName(session?.workspace)}</strong>{' '}
        中读取、写入、运行并验证真实工作。每次改动都由你批准。
      </p>

      {demoOnly ? (
        <div className="demo-banner">
          <div className="demo-banner-icon">
            <Plug size={15} />
          </div>
          <div>
            <strong>你正在使用离线演示模型。</strong>
            <span> 连接一个供应商后，agent 才能真正开始工作。</span>
          </div>
          <button className="btn btn-soft btn-sm" onClick={() => setSettingsOpen(true, 'models')}>
            连接模型
          </button>
        </div>
      ) : null}

      <div className="workflow-grid">
        {WORKFLOWS.map((workflow, index) => {
          const Icon = ICONS[workflow.icon]
          return (
            <button
              key={workflow.id}
              className="workflow-card animate-rise"
              style={{ animationDelay: `${40 + index * 30}ms` }}
              onClick={() => {
                seedComposer(workflow.prompt, workflow.id)
                if (workflow.id === 'plan') void setMode('plan')
              }}
            >
              <span className={`workflow-icon tint-${workflow.tint}`}>
                <Icon size={16} />
              </span>
              <span className="workflow-name">{workflow.name}</span>
              <span className="workflow-tagline">{workflow.tagline}</span>
              <span className="workflow-arrow">
                <ArrowUpRight size={14} />
              </span>
            </button>
          )
        })}
      </div>

      <div className="empty-footer">
        <button className="empty-folder" onClick={() => void pickFolder()}>
          <FolderOpen size={14} />
          在其他文件夹中开始
        </button>
        <span className="empty-hint">
          <kbd>Ctrl K</kbd> 打开命令 · <kbd>Ctrl B</kbd> 切换画布
        </span>
      </div>
    </div>
  )
}
