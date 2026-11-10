import { useEffect, useState } from 'react'
import {
  PanelRight,
  PanelRightClose,
  Pencil,
  RotateCcw,
  Settings2,
  Trash2,
  Archive
} from 'lucide-react'
import { getWorkflow } from '@shared/workflows'
import { formatTokens, relativeTime } from '@shared/utils'
import { useAppStore } from '../store/app'

export function ContextMeter({
  used,
  total,
  size = 24
}: {
  used: number
  total: number
  size?: number
}) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0
  const tone = pct > 85 ? 'var(--red)' : pct > 65 ? 'var(--amber)' : 'var(--accent)'
  return (
    <div
      className="context-meter"
      style={{ width: size, height: size }}
      title={`${formatTokens(used)} 估算上下文 · 占 ${formatTokens(total)} tokens 的 ${pct}%`}
    >
      <div
        className="context-meter-ring"
        style={{ background: `conic-gradient(${tone} ${pct * 3.6}deg, var(--border) 0deg)` }}
      />
      <span className="context-meter-label">{pct}</span>
    </div>
  )
}

export function ChatHeader() {
  const session = useAppStore((state) => state.session)
  const settings = useAppStore((state) => state.settings)
  const running = useAppStore((state) => state.running)
  const canvasOpen = useAppStore((state) => state.canvasOpen)
  const toggleCanvas = useAppStore((state) => state.toggleCanvas)
  const setCanvasTab = useAppStore((state) => state.setCanvasTab)
  const renameSession = useAppStore((state) => state.renameSession)
  const deleteSession = useAppStore((state) => state.deleteSession)
  const compact = useAppStore((state) => state.compact)
  const revertTurn = useAppStore((state) => state.revertTurn)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    setTitle(session?.title ?? '')
  }, [session?.id, session?.title])

  if (!session) return null

  const workflow = getWorkflow(session.workflowId)
  const provider = settings?.providers.find((p) => p.id === session.model.providerId)
  const lastTurn = [...session.changes].reverse().find((change) => !change.reverted)?.turnId

  const commitTitle = async (): Promise<void> => {
    setEditing(false)
    const next = title.trim()
    if (next && next !== session.title) await renameSession(session.id, next)
    else setTitle(session.title)
  }

  return (
    <header className="chat-header">
      <div className="chat-header-main">
        <div className="chat-title-row">
          {editing ? (
            <input
              className="chat-title-input"
              value={title}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void commitTitle()
                if (event.key === 'Escape') {
                  setEditing(false)
                  setTitle(session.title)
                }
              }}
            />
          ) : (
            <button className="chat-title" onClick={() => setEditing(true)} title="重命名任务">
              <span className="truncate">{session.title}</span>
              <Pencil size={12} className="chat-title-pencil" />
            </button>
          )}
          {running ? (
            <span className="status-pill running">
              <span className="spinner" /> 运行中
            </span>
          ) : null}
          {session.status === 'error' ? <span className="status-pill error">错误</span> : null}
        </div>
        <div className="chat-meta">
          {workflow ? (
            <button className="meta-link accent" onClick={() => setCanvasTab('plan')}>
              {workflow.name}
            </button>
          ) : (
            <span className="meta-link">自由模式</span>
          )}
          <span className="meta-sep">·</span>
          <span className="meta-link truncate" title={session.workspace}>
            {session.workspace}
          </span>
          <span className="meta-sep">·</span>
          <span className="meta-link">{provider?.name ?? '模型'}</span>
          <span className="meta-sep">·</span>
          <span className="meta-link">{session.model.model}</span>
        </div>
      </div>

      <div className="chat-header-actions">
        <div className="context-block" title="估算上下文用量">
          <ContextMeter used={session.contextTokens} total={provider?.contextWindow ?? 128_000} />
          <div className="context-copy">
            <span>上下文</span>
            <span className="faint">
              {formatTokens(session.contextTokens)} / {formatTokens(provider?.contextWindow ?? 128_000)}
            </span>
          </div>
        </div>
        <button
          className={`btn btn-ghost btn-sm ${canvasOpen ? 'is-on' : ''}`}
          onClick={toggleCanvas}
          title="切换画布 (Ctrl B)"
        >
          {canvasOpen ? <PanelRightClose size={14} /> : <PanelRight size={14} />}
          <span className="hide-narrow">画布</span>
        </button>
        <div className="menu-anchor">
          <button className="icon-btn" onClick={() => setMenu((value) => !value)} title="任务操作">
            <Settings2 size={15} />
          </button>
          {menu ? (
            <>
              <div className="menu-scrim" onClick={() => setMenu(false)} />
              <div className="mini-menu right">
                <button
                  onClick={() => {
                    setMenu(false)
                    setCanvasTab('changes')
                  }}
                >
                  <PanelRight size={13} /> 查看变更
                </button>
                <button
                  onClick={() => {
                    setMenu(false)
                    void compact()
                  }}
                >
                  <Archive size={13} /> 压缩上下文
                </button>
                <button
                  disabled={!lastTurn || running}
                  onClick={() => {
                    setMenu(false)
                    if (lastTurn) void revertTurn(lastTurn)
                  }}
                >
                  <RotateCcw size={13} /> 撤销上一轮
                </button>
                <div className="menu-sep" />
                <button
                  className="danger"
                  onClick={() => {
                    setMenu(false)
                    if (window.confirm(`删除“${session.title}”？`)) {
                      void deleteSession(session.id)
                    }
                  }}
                >
                  <Trash2 size={13} /> 删除任务
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </header>
  )
}

export function SessionMeta({ timestamp }: { timestamp: number }) {
  return (
    <span className="faint" title={new Date(timestamp).toLocaleString('zh-CN')}>
      {relativeTime(timestamp)}
    </span>
  )
}
