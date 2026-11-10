import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDot,
  Copy,
  ExternalLink,
  FileDiff,
  FolderTree,
  ListChecks,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Square,
  Terminal,
  X
} from 'lucide-react'
import Convert from 'ansi-to-html'
import type { FileChange } from '@shared/types'
import { formatDuration, formatTokens, relativeTime } from '@shared/utils'
import { api } from '../lib/bridge'
import { useAppStore, type CanvasTab } from '../store/app'
import { patchFor } from '../lib/diff'
import { DiffView } from './DiffView'
import { FilesPanel } from './FilesPanel'
import { Markdown } from './Markdown'

const ansi = new Convert({
  escapeXML: true,
  newline: true,
  fg: '#d8d3c6',
  bg: '#0c0d0a'
})

const TABS: { id: CanvasTab; label: string; icon: typeof ListChecks }[] = [
  { id: 'plan', label: '计划', icon: ListChecks },
  { id: 'changes', label: '变更', icon: FileDiff },
  { id: 'files', label: '文件', icon: FolderTree },
  { id: 'terminal', label: '终端', icon: Terminal }
]

const TASK_STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  done: '已完成',
  error: '错误',
  stopped: '已停止'
}

function PanelEmpty({
  icon: Icon,
  title,
  body,
  action
}: {
  icon: typeof ListChecks
  title: string
  body: string
  action?: React.ReactNode
}) {
  return (
    <div className="panel-empty">
      <span className="panel-empty-icon">
        <Icon size={24} />
      </span>
      <strong>{title}</strong>
      <span>{body}</span>
      {action}
    </div>
  )
}

function PlanPanel() {
  const session = useAppStore((state) => state.session)
  const seedComposer = useAppStore((state) => state.seedComposer)
  const setMode = useAppStore((state) => state.setMode)
  if (!session) return null
  const todos = session.todos
  const done = todos.filter((todo) => todo.status === 'completed').length
  const pct = todos.length ? Math.round((done / todos.length) * 100) : 0

  return (
    <div className="canvas-scroll plan-panel">
      {todos.length ? (
        <>
          <div className="plan-progress-card">
            <div className="plan-progress-head">
              <span className="eyebrow">进度</span>
              <span className="plan-progress-pct">{pct}%</span>
            </div>
            <div className="plan-progress">
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="plan-stats">
              <div>
                <strong>{done}</strong>
                <span>已完成</span>
              </div>
              <div>
                <strong>{todos.length - done}</strong>
                <span>待办</span>
              </div>
              <div>
                <strong>{session.changes.filter((change) => !change.reverted).length}</strong>
                <span>文件</span>
              </div>
              <div>
                <strong>{formatTokens(session.contextTokens)}</strong>
                <span>上下文</span>
              </div>
            </div>
          </div>

          <div className="plan-list">
            {todos.map((todo) => (
              <div key={todo.id} className={`plan-item ${todo.status}`}>
                <span className="plan-item-icon">
                  {todo.status === 'completed' ? (
                    <CheckCircle2 size={15} />
                  ) : todo.status === 'in_progress' ? (
                    <CircleDot size={15} />
                  ) : (
                    <Circle size={15} />
                  )}
                </span>
                <span className="plan-item-text">{todo.content}</span>
                {todo.priority === 'high' && todo.status !== 'completed' ? (
                  <span className="todo-priority">高</span>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <PanelEmpty
          icon={ListChecks}
          title="还没有计划"
          body="对于多步骤工作，agent 会在这里写下可见的计划，并在执行过程中持续更新。"
          action={
            <button
              className="btn btn-sm"
              onClick={() => {
                seedComposer(
                  '在动手修改前先规划这个任务。检查工作区，然后提出具体步骤、涉及文件和风险。'
                )
                void setMode('plan')
              }}
            >
              <Sparkles size={13} /> 让 agent 制定计划
            </button>
          }
        />
      )}

      {session.plan ? (
        <div className="plan-doc">
          <div className="plan-doc-head">
            <span className="eyebrow">已批准的计划</span>
          </div>
          <Markdown>{session.plan}</Markdown>
        </div>
      ) : null}
    </div>
  )
}

function ChangesPanel() {
  const session = useAppStore((state) => state.session)
  const running = useAppStore((state) => state.running)
  const revertTurn = useAppStore((state) => state.revertTurn)
  const [expanded, setExpanded] = useState<string | null>(null)

  const changes = useMemo(
    () => (session?.changes ?? []).filter((change) => !change.reverted),
    [session?.changes]
  )
  const patches = useMemo(() => {
    const map = new Map<string, string>()
    for (const change of changes) {
      map.set(change.id, patchFor(change.path, change.before, change.after))
    }
    return map
  }, [changes])
  const groups = useMemo(() => {
    const map = new Map<string, FileChange[]>()
    for (const change of changes) {
      const list = map.get(change.turnId) ?? []
      list.push(change)
      map.set(change.turnId, list)
    }
    return [...map.entries()].sort((a, b) => {
      const aTime = Math.max(...a[1].map((change) => change.createdAt))
      const bTime = Math.max(...b[1].map((change) => change.createdAt))
      return bTime - aTime
    })
  }, [changes])

  if (!changes.length) {
    return (
      <div className="canvas-scroll">
        <PanelEmpty
          icon={FileDiff}
          title="还没有变更"
          body="文件编辑会在这里显示完整 diff。每一轮都可以作为一个整体回退。"
        />
      </div>
    )
  }

  return (
    <div className="canvas-scroll changes-panel">
      {groups.map(([turnId, files], index) => {
        const additions = files.reduce((total, file) => total + file.additions, 0)
        const deletions = files.reduce((total, file) => total + file.deletions, 0)
        return (
          <div key={turnId} className="change-group">
            <div className="change-group-head">
              <span className="change-turn">第 {groups.length - index} 轮</span>
              <span className="faint">{relativeTime(files[0].createdAt)}</span>
              <span className="change-total">
                <span className="add">+{additions}</span>
                <span className="del">−{deletions}</span>
              </span>
              <button
                className="btn btn-ghost btn-sm"
                disabled={running}
                onClick={() => void revertTurn(turnId)}
                title="将这些文件恢复到本轮之前的状态"
              >
                <RotateCcw size={12} /> 撤销
              </button>
            </div>
            <div className="change-files">
              {files.map((file) => (
                <div key={file.id} className="change-file-wrap">
                  <button
                    className={`change-file ${expanded === file.id ? 'open' : ''}`}
                    onClick={() => setExpanded(expanded === file.id ? null : file.id)}
                  >
                    <span className={`change-kind ${file.kind}`}>
                      {file.kind === 'create' ? 'A' : file.kind === 'delete' ? 'D' : 'M'}
                    </span>
                    <span className="change-path mono truncate">{file.path}</span>
                    <span className="change-add">+{file.additions}</span>
                    <span className="change-del">−{file.deletions}</span>
                    <ChevronRight
                      size={13}
                      className={`tree-chevron ${expanded === file.id ? 'open' : ''}`}
                    />
                  </button>
                  {expanded === file.id ? (
                    <div className="change-diff">
                      {file.truncated ? (
                        <div className="preview-warning">
                          <AlertTriangle size={12} /> 这次变更太大，未能完整保存。
                        </div>
                      ) : null}
                      <DiffView
                        patch={patches.get(file.id) ?? ''}
                        path={file.path}
                        additions={file.additions}
                        deletions={file.deletions}
                        maxHeight={480}
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TerminalPanel() {
  const session = useAppStore((state) => state.session)
  const allTasks = useAppStore((state) => state.tasks)
  const stopTask = useAppStore((state) => state.stopTask)
  const loadTasks = useAppStore((state) => state.loadTasks)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const outputRef = useRef<HTMLPreElement>(null)

  const tasks = useMemo(
    () => allTasks.filter((task) => task.sessionId === session?.id),
    [allTasks, session?.id]
  )
  const task = tasks.find((entry) => entry.id === selectedId) ?? tasks[0]

  useEffect(() => {
    const running = tasks.find((entry) => entry.status === 'running')
    if (running) setSelectedId(running.id)
    else if (!selectedId && tasks[0]) setSelectedId(tasks[0].id)
  }, [tasks, selectedId])

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [task?.output, task?.id])

  const html = useMemo(
    () => (task ? ansi.toHtml(task.output || '（暂无输出）') : ''),
    [task?.output]
  )

  if (!tasks.length) {
    return (
      <div className="canvas-scroll">
        <PanelEmpty
          icon={Terminal}
          title="还没有命令"
          body="agent 运行的 shell 命令会在这里显示实时输出和退出码。"
        />
      </div>
    )
  }

  return (
    <div className="terminal-panel">
      <div className="task-pills">
        {tasks.map((entry) => (
          <button
            key={entry.id}
            className={`task-pill ${entry.id === task?.id ? 'active' : ''}`}
            onClick={() => setSelectedId(entry.id)}
            title={entry.command}
          >
            <span className={`task-dot ${entry.status}`} />
            <span className="truncate">{entry.label}</span>
          </button>
        ))}
        <button className="icon-btn sm" onClick={() => void loadTasks()} title="刷新任务">
          <RefreshCw size={12} />
        </button>
      </div>

      {task ? (
        <>
          <div className="terminal-head">
            <div className="terminal-command mono">
              <span className="prompt">$</span> {task.command}
            </div>
            <div className="terminal-meta">
              <span className={`task-status ${task.status}`}>
                {TASK_STATUS_LABEL[task.status] ?? task.status}
              </span>
              {task.exitCode !== undefined ? <span>退出码 {task.exitCode}</span> : null}
              {task.endedAt ? (
                <span>{formatDuration(task.endedAt - task.startedAt)}</span>
              ) : (
                <span className="running-label">
                  <span className="spinner" /> 运行中
                </span>
              )}
            </div>
            <div className="terminal-actions">
              <button
                className="icon-btn sm"
                title="复制输出"
                onClick={() => void navigator.clipboard.writeText(task.output)}
              >
                <Copy size={12} />
              </button>
              {task.outputPath ? (
                <button
                  className="icon-btn sm"
                  title="显示日志文件"
                  onClick={() => void api.app.showItemInFolder(task.outputPath!)}
                >
                  <ExternalLink size={12} />
                </button>
              ) : null}
              {task.status === 'running' ? (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => void stopTask(task.id)}
                >
                  <Square size={11} /> 停止
                </button>
              ) : null}
            </div>
          </div>
          <pre
            ref={outputRef}
            className="terminal-output"
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <div className="terminal-foot">
            <span className="mono faint truncate">{task.cwd}</span>
            <span className="faint">{relativeTime(task.startedAt)}</span>
          </div>
        </>
      ) : null}
    </div>
  )
}

export function Canvas() {
  const session = useAppStore((state) => state.session)
  const canvasTab = useAppStore((state) => state.canvasTab)
  const canvasWidth = useAppStore((state) => state.canvasWidth)
  const setCanvasTab = useAppStore((state) => state.setCanvasTab)
  const setCanvasWidth = useAppStore((state) => state.setCanvasWidth)
  const toggleCanvas = useAppStore((state) => state.toggleCanvas)
  const tasks = useAppStore((state) => state.tasks)
  const [resizing, setResizing] = useState(false)
  const start = useRef({ x: 0, width: 0 })

  if (!session) return null

  const runningTasks = tasks.filter(
    (task) => task.sessionId === session.id && task.status === 'running'
  ).length
  const changeCount = session.changes.filter((change) => !change.reverted).length
  const openTodos = session.todos.filter((todo) => todo.status !== 'completed').length

  const counts: Record<CanvasTab, number> = {
    plan: openTodos,
    changes: changeCount,
    files: 0,
    terminal: runningTasks
  }

  return (
    <aside className={`canvas ${resizing ? 'resizing' : ''}`} style={{ width: canvasWidth }}>
      <div
        className="canvas-resize"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          start.current = { x: event.clientX, width: canvasWidth }
          setResizing(true)
        }}
        onPointerMove={(event) => {
          if (!resizing) return
          setCanvasWidth(start.current.width + (start.current.x - event.clientX))
        }}
        onPointerUp={(event) => {
          event.currentTarget.releasePointerCapture(event.pointerId)
          setResizing(false)
        }}
      />
      <div className="canvas-head">
        <div className="canvas-tabs">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = canvasTab === tab.id
            return (
              <button
                key={tab.id}
                className={`canvas-tab ${active ? 'active' : ''}`}
                onClick={() => setCanvasTab(tab.id)}
              >
                <Icon size={13} />
                <span>{tab.label}</span>
                {counts[tab.id] ? (
                  <span className={`canvas-badge ${tab.id}`}>{counts[tab.id]}</span>
                ) : null}
              </button>
            )
          })}
        </div>
        <button className="icon-btn sm" onClick={toggleCanvas} title="关闭画布 (Ctrl B)">
          <X size={14} />
        </button>
      </div>

      <div className="canvas-body">
        {canvasTab === 'plan' ? <PlanPanel /> : null}
        {canvasTab === 'changes' ? <ChangesPanel /> : null}
        {canvasTab === 'files' ? <FilesPanel /> : null}
        {canvasTab === 'terminal' ? <TerminalPanel /> : null}
      </div>

      <div className="canvas-foot">
        <span className="canvas-foot-label">
          <ArrowRight size={11} /> {session.workspace.split(/[\\/]/).pop()}
        </span>
        <span className="faint">Ctrl B 隐藏</span>
      </div>
    </aside>
  )
}
