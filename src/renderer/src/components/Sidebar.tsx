import { useMemo, useState } from 'react'
import {
  Library,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  Terminal,
  Trash2
} from 'lucide-react'
import type { SessionSummary } from '@shared/types'
import { relativeTime } from '@shared/utils'
import { useAppStore, type View } from '../store/app'

const NAV: { view: View; label: string; icon: typeof MessageSquare }[] = [
  { view: 'chat', label: '会话', icon: MessageSquare },
  { view: 'library', label: '资料库', icon: Library },
  { view: 'tasks', label: '任务', icon: Terminal },
  { view: 'skills', label: '技能', icon: Sparkles }
]

function groups(sessions: SessionSummary[]): { label: string; items: SessionSummary[] }[] {
  const now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startYesterday = startToday - 86_400_000
  const startWeek = startToday - 6 * 86_400_000
  const buckets: { label: string; items: SessionSummary[] }[] = [
    { label: '今天', items: [] },
    { label: '昨天', items: [] },
    { label: '过去 7 天', items: [] },
    { label: '更早', items: [] }
  ]
  for (const session of sessions) {
    if (session.updatedAt >= startToday) buckets[0].items.push(session)
    else if (session.updatedAt >= startYesterday) buckets[1].items.push(session)
    else if (session.updatedAt >= startWeek) buckets[2].items.push(session)
    else buckets[3].items.push(session)
  }
  return buckets.filter((bucket) => bucket.items.length)
}

export function Sidebar() {
  const sessions = useAppStore((state) => state.sessions)
  const current = useAppStore((state) => state.session)
  const view = useAppStore((state) => state.view)
  const tasks = useAppStore((state) => state.tasks)
  const library = useAppStore((state) => state.library)
  const settings = useAppStore((state) => state.settings)
  const appInfo = useAppStore((state) => state.appInfo)
  const setView = useAppStore((state) => state.setView)
  const openSession = useAppStore((state) => state.openSession)
  const createSession = useAppStore((state) => state.createSession)
  const deleteSession = useAppStore((state) => state.deleteSession)
  const renameSession = useAppStore((state) => state.renameSession)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)

  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter(
      (session) =>
        session.title.toLowerCase().includes(q) || session.preview.toLowerCase().includes(q)
    )
  }, [sessions, query])

  const grouped = useMemo(() => groups(filtered), [filtered])
  const runningTasks = tasks.filter((task) => task.status === 'running').length

  const startRename = (session: SessionSummary): void => {
    setMenuFor(null)
    setEditing(session.id)
    setEditValue(session.title)
  }

  const commitRename = async (id: string): Promise<void> => {
    const value = editValue.trim()
    setEditing(null)
    if (value) await renameSession(id, value)
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <button className="new-task" onClick={() => void createSession()}>
          <span className="new-task-icon">
            <Plus size={15} />
          </span>
          <span>新建任务</span>
          <kbd>Ctrl N</kbd>
        </button>

        <nav className="sidebar-nav">
          {NAV.map((item) => {
            const Icon = item.icon
            const active = view === item.view
            const badge =
              item.view === 'tasks' && runningTasks
                ? runningTasks
                : item.view === 'library' && library.length
                  ? library.length
                  : null
            return (
              <button
                key={item.view}
                className={`nav-item ${active ? 'active' : ''}`}
                onClick={() => setView(item.view)}
              >
                <Icon size={15} />
                <span>{item.label}</span>
                {badge ? <span className="nav-badge">{badge}</span> : null}
              </button>
            )
          })}
        </nav>
      </div>

      <div className="sidebar-section-head">
        <span className="eyebrow">最近</span>
        <button
          className={`icon-btn sm ${searching ? 'active' : ''}`}
          onClick={() => {
            setSearching((value) => !value)
            setQuery('')
          }}
          title="搜索任务"
        >
          <Search size={13} />
        </button>
      </div>

      {searching ? (
        <div className="sidebar-search">
          <Search size={13} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="筛选任务…"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setSearching(false)
                setQuery('')
              }
            }}
          />
        </div>
      ) : null}

      <div className="session-list">
        {grouped.length === 0 ? (
          <div className="sidebar-empty">
            <p>还没有任务。</p>
            <button className="btn btn-soft btn-sm" onClick={() => void createSession()}>
              新建一个
            </button>
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.label} className="session-group">
              <div className="session-group-label">{group.label}</div>
              {group.items.map((session) => {
                const active = current?.id === session.id && view === 'chat'
                return (
                  <div
                    key={session.id}
                    className={`session-item ${active ? 'active' : ''}`}
                    onClick={() => void openSession(session.id)}
                    onDoubleClick={() => startRename(session)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void openSession(session.id)
                    }}
                  >
                    <span
                      className={`session-status ${
                        session.status === 'running'
                          ? 'running'
                          : session.status === 'error'
                            ? 'error'
                            : ''
                      }`}
                    >
                      {session.status === 'running' ? (
                        <span className="spinner" />
                      ) : (
                        <span className="dot" />
                      )}
                    </span>
                    <div className="session-copy">
                      {editing === session.id ? (
                        <input
                          className="session-rename"
                          value={editValue}
                          autoFocus
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => setEditValue(event.target.value)}
                          onBlur={() => void commitRename(session.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') void commitRename(session.id)
                            if (event.key === 'Escape') setEditing(null)
                          }}
                        />
                      ) : (
                        <span className="session-title truncate">{session.title}</span>
                      )}
                      <span className="session-preview truncate">
                        {session.preview || '暂无消息'}
                      </span>
                    </div>
                    <span className="session-time">{relativeTime(session.updatedAt)}</span>
                    <button
                      className="session-more"
                      title="任务操作"
                      onClick={(event) => {
                        event.stopPropagation()
                        setMenuFor(menuFor === session.id ? null : session.id)
                      }}
                    >
                      <MoreHorizontal size={14} />
                    </button>
                    {menuFor === session.id ? (
                      <>
                        <div
                          className="menu-scrim"
                          onClick={(event) => {
                            event.stopPropagation()
                            setMenuFor(null)
                          }}
                        />
                        <div className="mini-menu" onClick={(event) => event.stopPropagation()}>
                          <button onClick={() => startRename(session)}>
                            <Pencil size={13} /> 重命名
                          </button>
                          <button
                            className="danger"
                            onClick={() => {
                              setMenuFor(null)
                              if (window.confirm(`删除“${session.title}”？`)) {
                                void deleteSession(session.id)
                              }
                            }}
                          >
                            <Trash2 size={13} /> 删除
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-settings" onClick={() => setSettingsOpen(true)}>
          <Settings size={15} />
          <span>设置</span>
          <kbd>Ctrl ,</kbd>
        </button>
        <div className="sidebar-model">
          <span className="model-dot" />
          <span className="truncate">
            {settings?.providers.find((p) => p.id === current?.model.providerId)?.name ??
              '未选择模型'}
            {current ? ` · ${current.model.model}` : ''}
          </span>
          <span className="sidebar-version">{appInfo?.version.split(' ')[0] ?? '0.1.0'}</span>
        </div>
      </div>
    </aside>
  )
}
