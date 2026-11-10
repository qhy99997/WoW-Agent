import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { useAppStore } from './store/app'
import { useResolvedTheme } from './lib/theme'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { ChatView } from './components/ChatView'
import { Canvas } from './components/Canvas'
import { LibraryView } from './components/LibraryView'
import { TasksView } from './components/TasksView'
import { SkillsView } from './components/SkillsView'
import { SettingsModal } from './components/SettingsModal'
import { CommandPalette } from './components/CommandPalette'
import { Toasts } from './components/Toasts'
import { LogoMark } from './components/LogoMark'

export function App() {
  const booted = useAppStore((state) => state.booted)
  const bootError = useAppStore((state) => state.bootError)
  const boot = useAppStore((state) => state.boot)
  const settings = useAppStore((state) => state.settings)
  const view = useAppStore((state) => state.view)
  const canvasOpen = useAppStore((state) => state.canvasOpen)
  const session = useAppStore((state) => state.session)
  const resolvedTheme = useResolvedTheme(settings?.theme)

  useEffect(() => {
    void boot()
  }, [boot])

  useEffect(() => {
    document.documentElement.lang = 'zh-CN'
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme
  }, [resolvedTheme])

  useEffect(() => {
    document.documentElement.dataset.accent = settings?.accent ?? 'ember'
  }, [settings?.accent])

  useEffect(() => {
    document.title = session ? `${session.title} · WoW Agent` : 'WoW Agent'
  }, [session?.title])

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      const store = useAppStore.getState()
      const meta = event.ctrlKey || event.metaKey
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        store.setPaletteOpen(!store.paletteOpen)
      } else if (meta && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        void store.createSession()
      } else if (meta && event.key === ',') {
        event.preventDefault()
        store.setSettingsOpen(true)
      } else if (meta && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        if (store.view === 'chat') store.toggleCanvas()
      } else if (event.key === 'Escape') {
        if (store.paletteOpen) store.setPaletteOpen(false)
        else if (store.settingsOpen) store.setSettingsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  if (!booted) {
    return (
      <div className="splash">
        <div className="splash-glow" />
        <LogoMark size={46} />
        <span className="splash-name">WoW Agent</span>
        <span className="splash-status">
          <span className="spinner" /> 正在启动工作区
        </span>
        <span className="splash-foot">本地优先 · TypeScript · Windows</span>
      </div>
    )
  }

  if (bootError) {
    return (
      <div className="splash error-splash">
        <span className="error-icon">
          <AlertTriangle size={26} />
        </span>
        <span className="splash-name">工作区无法启动</span>
        <span className="splash-status">{bootError}</span>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          <RotateCcw size={14} /> 重试
        </button>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar />
        <main className={`main-pane view-${view}`}>
          {view === 'chat' ? <ChatView /> : null}
          {view === 'library' ? <LibraryView /> : null}
          {view === 'tasks' ? <TasksView /> : null}
          {view === 'skills' ? <SkillsView /> : null}
        </main>
        {view === 'chat' && canvasOpen ? <Canvas /> : null}
      </div>
      <CommandPalette />
      <SettingsModal />
      <Toasts />
    </div>
  )
}
