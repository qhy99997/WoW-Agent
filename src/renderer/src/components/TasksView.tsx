import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  RefreshCw,
  Square,
  Terminal,
  Timer
} from 'lucide-react'
import Convert from 'ansi-to-html'
import { formatDuration, relativeTime } from '@shared/utils'
import { useAppStore } from '../store/app'

const ansi = new Convert({ escapeXML: true, newline: true, fg: '#d8d3c6', bg: '#0c0d0a' })

const STATUS_ICON = {
  running: Timer,
  done: CheckCircle2,
  error: AlertTriangle,
  stopped: CircleSlash
}

const STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  done: '已完成',
  error: '错误',
  stopped: '已停止'
}

export function TasksView() {
  const tasks = useAppStore((state) => state.tasks)
  const sessions = useAppStore((state) => state.sessions)
  const stopTask = useAppStore((state) => state.stopTask)
  const loadTasks = useAppStore((state) => state.loadTasks)
  const [filter, setFilter] = useState<'all' | 'running' | 'finished'>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'running') return tasks.filter((task) => task.status === 'running')
    if (filter === 'finished') return tasks.filter((task) => task.status !== 'running')
    return tasks
  }, [tasks, filter])

  const running = tasks.filter((task) => task.status === 'running').length

  const sessionName = (id: string): string =>
    sessions.find((session) => session.id === id)?.title ?? '未知任务'

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">
            <Terminal size={12} /> 执行
          </div>
          <h1 className="page-title">任务</h1>
          <p className="page-sub">
            agent 启动的 shell 进程。输出会实时流式显示；仍在运行的进程可以随时停止。
          </p>
        </div>
        <div className="page-actions">
          <div className="segmented">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
              全部
            </button>
            <button
              className={filter === 'running' ? 'active' : ''}
              onClick={() => setFilter('running')}
            >
              运行中{running ? ` · ${running}` : ''}
            </button>
            <button
              className={filter === 'finished' ? 'active' : ''}
              onClick={() => setFilter('finished')}
            >
              已完成
            </button>
          </div>
          <button className="icon-btn" onClick={() => void loadTasks()} title="刷新任务">
            <RefreshCw size={15} />
          </button>
        </div>
      </header>

      <div className="page-scroll">
        {filtered.length ? (
          <div className="tasks-table">
            <div className="tasks-head">
              <span>状态</span>
              <span>命令</span>
              <span>任务</span>
              <span>开始时间</span>
              <span>耗时</span>
              <span />
            </div>
            {filtered.map((task) => {
              const Icon = STATUS_ICON[task.status]
              const open = expanded === task.id
              return (
                <div key={task.id} className={`task-row-wrap ${open ? 'open' : ''}`}>
                  <div
                    className="task-row"
                    role="button"
                    tabIndex={0}
                    onClick={() => setExpanded(open ? null : task.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') setExpanded(open ? null : task.id)
                    }}
                  >
                    <span className={`task-state ${task.status}`}>
                      <Icon size={14} />
                      {STATUS_LABEL[task.status] ?? task.status}
                    </span>
                    <span className="task-command mono truncate">{task.command}</span>
                    <span className="task-session truncate">{sessionName(task.sessionId)}</span>
                    <span className="faint">{relativeTime(task.startedAt)}</span>
                    <span className="faint">
                      {task.endedAt ? formatDuration(task.endedAt - task.startedAt) : '—'}
                    </span>
                    <span className="task-row-actions">
                      {task.status === 'running' ? (
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            void stopTask(task.id)
                          }}
                        >
                          <Square size={11} /> 停止
                        </button>
                      ) : null}
                      <ChevronRight
                        size={14}
                        className={`tree-chevron ${open ? 'open' : ''}`}
                      />
                    </span>
                  </div>
                  {open ? (
                    <div className="task-output-block">
                      <div className="task-output-meta">
                        <span className="mono faint truncate">{task.cwd}</span>
                        {task.exitCode !== undefined ? (
                          <span className="faint">退出码 {task.exitCode}</span>
                        ) : null}
                      </div>
                      <pre
                        className="terminal-output"
                        dangerouslySetInnerHTML={{
                          __html: ansi.toHtml(task.output || '（暂无输出）')
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="page-empty">
            <Terminal size={28} />
            <strong>{filter === 'all' ? '还没有任务' : '此筛选下没有任务'}</strong>
            <span>让 agent 运行构建、测试或开发服务器，任务会显示在这里。</span>
          </div>
        )}
      </div>
    </div>
  )
}
