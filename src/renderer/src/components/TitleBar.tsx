import { Folder, Minus, Moon, Square, Sun, X } from 'lucide-react'
import { api, isDesktop } from '../lib/bridge'
import { useAppStore } from '../store/app'
import { useResolvedTheme } from '../lib/theme'
import { LogoMark } from './LogoMark'

function workspaceName(workspace?: string): string {
  if (!workspace) return '未选择工作区'
  const parts = workspace.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? workspace
}

export function TitleBar() {
  const session = useAppStore((state) => state.session)
  const settings = useAppStore((state) => state.settings)
  const createSession = useAppStore((state) => state.createSession)
  const updateSettings = useAppStore((state) => state.updateSettings)

  const provider = settings?.providers.find(
    (entry) => entry.id === session?.model.providerId
  )
  const resolvedTheme = useResolvedTheme(settings?.theme)
  const isDark = resolvedTheme === 'dark'

  const pickWorkspace = async (): Promise<void> => {
    const directory = await api.app.pickDirectory()
    if (directory) await createSession(directory)
  }

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <LogoMark size={21} />
        <span className="brand-name">WoW Agent</span>
      </div>
      <div className="titlebar-sep" />
      <button
        className="workspace-chip"
        onClick={pickWorkspace}
        title={`${session?.workspace ?? '选择文件夹'} — 点击可在其他文件夹中新建任务`}
      >
        <Folder size={12} />
        <span className="truncate">{workspaceName(session?.workspace)}</span>
      </button>
      <div className="titlebar-drag" onDoubleClick={() => api.app.toggleMaximize()} />
      <div className="titlebar-actions">
        <span className="conn-status" title={`${provider?.name ?? '未配置供应商'} · ${session?.model.model ?? ''}`}>
          <span className={`dot ${session?.status === 'running' ? 'live' : ''}`} />
          <span className="truncate">{provider?.name ?? '未选择模型'}</span>
        </span>
        <button
          className="icon-btn sm"
          title={isDark ? '切换到浅色主题' : '切换到深色主题'}
          onClick={() => void updateSettings({ theme: isDark ? 'light' : 'dark' })}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        {isDesktop ? (
          <div className="window-controls">
            <button className="window-btn" title="最小化" onClick={() => api.app.minimize()}>
              <Minus size={13} />
            </button>
            <button
              className="window-btn"
              title="最大化"
              onClick={() => api.app.toggleMaximize()}
            >
              <Square size={11} />
            </button>
            <button className="window-btn close" title="关闭" onClick={() => api.app.close()}>
              <X size={13} />
            </button>
          </div>
        ) : (
          <span className="preview-badge">预览</span>
        )}
      </div>
    </header>
  )
}
