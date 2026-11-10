import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowRight,
  BookOpen,
  Command,
  FolderOpen,
  LayoutPanelLeft,
  Library,
  MessageSquare,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Sun,
  Terminal
} from 'lucide-react'
import { relativeTime } from '@shared/utils'
import { useAppStore } from '../store/app'

interface PaletteItem {
  id: string
  label: string
  hint: string
  icon: typeof Search
  group: '操作' | '任务'
  run: () => void | Promise<void>
}

export function CommandPalette() {
  const open = useAppStore((state) => state.paletteOpen)
  const setOpen = useAppStore((state) => state.setPaletteOpen)
  const sessions = useAppStore((state) => state.sessions)
  const session = useAppStore((state) => state.session)
  const settings = useAppStore((state) => state.settings)
  const createSession = useAppStore((state) => state.createSession)
  const openSession = useAppStore((state) => state.openSession)
  const setView = useAppStore((state) => state.setView)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)
  const toggleCanvas = useAppStore((state) => state.toggleCanvas)
  const updateSettings = useAppStore((state) => state.updateSettings)
  const compact = useAppStore((state) => state.compact)
  const revertTurn = useAppStore((state) => state.revertTurn)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const lastTurn = session
    ? [...session.changes].reverse().find((change) => !change.reverted)?.turnId
    : undefined

  const actions: PaletteItem[] = useMemo(
    () => [
      {
        id: 'new',
        label: '新建任务',
        hint: 'Ctrl N',
        icon: Plus,
        group: '操作',
        run: () => createSession()
      },
      {
        id: 'settings',
        label: '打开设置',
        hint: 'Ctrl ,',
        icon: Settings,
        group: '操作',
        run: () => setSettingsOpen(true)
      },
      {
        id: 'theme',
        label: settings?.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题',
        hint: '外观',
        icon: settings?.theme === 'dark' ? Sun : Moon,
        group: '操作',
        run: () => updateSettings({ theme: settings?.theme === 'dark' ? 'light' : 'dark' })
      },
      {
        id: 'canvas',
        label: '切换画布',
        hint: 'Ctrl B',
        icon: LayoutPanelLeft,
        group: '操作',
        run: () => toggleCanvas()
      },
      {
        id: 'library',
        label: '前往资料库',
        hint: '知识',
        icon: Library,
        group: '操作',
        run: () => setView('library')
      },
      {
        id: 'tasks',
        label: '前往任务',
        hint: '执行',
        icon: Terminal,
        group: '操作',
        run: () => setView('tasks')
      },
      {
        id: 'skills',
        label: '前往技能',
        hint: '扩展',
        icon: Sparkles,
        group: '操作',
        run: () => setView('skills')
      },
      {
        id: 'compact',
        label: '压缩对话',
        hint: '总结较早的对话',
        icon: Archive,
        group: '操作',
        run: () => compact()
      },
      {
        id: 'revert',
        label: '撤销上一轮',
        hint: lastTurn ? '恢复文件' : '无可撤销内容',
        icon: RotateCcw,
        group: '操作',
        run: () => (lastTurn ? revertTurn(lastTurn) : undefined)
      },
      {
        id: 'sessions',
        label: '前往会话',
        hint: '对话',
        icon: MessageSquare,
        group: '操作',
        run: () => setView('chat')
      }
    ],
    [settings?.theme, lastTurn, createSession, setSettingsOpen, updateSettings, toggleCanvas, setView, compact, revertTurn]
  )

  const taskItems: PaletteItem[] = useMemo(
    () =>
      sessions.slice(0, 8).map((entry) => ({
        id: `session-${entry.id}`,
        label: entry.title,
        hint: entry.preview || relativeTime(entry.updatedAt),
        icon: MessageSquare,
        group: '任务' as const,
        run: () => openSession(entry.id)
      })),
    [sessions, openSession]
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (item: PaletteItem): boolean =>
      !q ||
      item.label.toLowerCase().includes(q) ||
      item.hint.toLowerCase().includes(q)
    return {
      actions: actions.filter(matches),
      tasks: taskItems.filter(matches)
    }
  }, [actions, taskItems, query])

  const flat = useMemo(
    () => [...filtered.actions, ...filtered.tasks],
    [filtered.actions, filtered.tasks]
  )

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    setTimeout(() => inputRef.current?.focus(), 20)
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  if (!open) return null

  const run = (item: PaletteItem): void => {
    setOpen(false)
    void item.run()
  }

  const renderGroup = (label: '操作' | '任务', items: PaletteItem[]) => {
    if (!items.length) return null
    return (
      <div className="palette-group">
        <div className="palette-group-label">{label}</div>
        {items.map((item) => {
          const index = flat.findIndex((entry) => entry.id === item.id)
          const Icon = item.icon
          return (
            <button
              key={item.id}
              className={`palette-item ${index === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => run(item)}
            >
              <span className="palette-icon">
                <Icon size={15} />
              </span>
              <span className="palette-copy">
                <span className="truncate">{item.label}</span>
                <span className="faint truncate">{item.hint}</span>
              </span>
              <ArrowRight size={13} className="palette-arrow" />
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="modal-backdrop palette-backdrop" onMouseDown={() => setOpen(false)}>
      <div className="palette animate-pop" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input-row">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索命令和任务…"
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setActive((index) => (index + 1) % Math.max(flat.length, 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setActive((index) => (index - 1 + Math.max(flat.length, 1)) % Math.max(flat.length, 1))
              }
              if (event.key === 'Enter' && flat[active]) {
                event.preventDefault()
                run(flat[active])
              }
              if (event.key === 'Escape') setOpen(false)
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list">
          {flat.length ? (
            <>
              {renderGroup('操作', filtered.actions)}
              {renderGroup('任务', filtered.tasks)}
            </>
          ) : (
            <div className="palette-empty">
              <Command size={20} />
              <span>没有匹配“{query}”的命令。</span>
            </div>
          )}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> 导航</span>
          <span><kbd>Enter</kbd> 执行</span>
          <span className="spacer" />
          <span><BookOpen size={11} /> {sessions.length} 个任务</span>
        </div>
      </div>
    </div>
  )
}
