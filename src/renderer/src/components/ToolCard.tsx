import { useState } from 'react'
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Clock,
  Database,
  FileCode,
  FileText,
  FolderTree,
  GitBranch,
  Globe,
  ListChecks,
  Loader2,
  Map,
  MessageCircle,
  Search,
  ShieldAlert,
  Square,
  Terminal,
  Timer,
  Wrench,
  XCircle
} from 'lucide-react'
import type { ToolItem } from '@shared/types'
import { formatDuration } from '@shared/utils'
import { CopyButton } from './Markdown'
import { DiffView } from './DiffView'

const ICONS: Record<string, typeof FileText> = {
  read_file: FileText,
  write_file: FileCode,
  edit_file: FileCode,
  list_dir: FolderTree,
  glob: Search,
  grep: Search,
  bash: Terminal,
  task_list: ListChecks,
  task_output: Timer,
  task_stop: Square,
  web_fetch: Globe,
  web_search: Globe,
  todo_write: ListChecks,
  exit_plan_mode: Map,
  task: GitBranch,
  ask_user: MessageCircle,
  knowledge_search: Database,
  knowledge_save: Database,
  skill: BookOpen
}

function StatusIcon({ status }: { status: ToolItem['status'] }) {
  switch (status) {
    case 'awaiting_approval':
      return <ShieldAlert size={13} className="text-amber" />
    case 'running':
      return <Loader2 size={13} className="spin text-accent" />
    case 'success':
      return <CheckCircle2 size={13} className="text-green" />
    case 'error':
      return <XCircle size={13} className="text-red" />
    case 'denied':
      return <CircleSlash size={13} className="text-red" />
    case 'cancelled':
      return <XCircle size={13} className="text-muted" />
    default:
      return <Clock size={13} />
  }
}

function statusLabel(status: ToolItem['status']): string {
  switch (status) {
    case 'awaiting_approval':
      return '需要授权'
    case 'running':
      return '运行中'
    case 'success':
      return '已完成'
    case 'error':
      return '失败'
    case 'denied':
      return '已拒绝'
    case 'cancelled':
      return '已取消'
    default:
      return status
  }
}

function summaryLine(item: ToolItem): string {
  const input = item.input as Record<string, unknown>
  if (typeof input.command === 'string') return `$ ${input.command.split(/\r?\n/)[0]}`
  if (typeof input.path === 'string') return input.path
  if (typeof input.pattern === 'string') return input.pattern
  if (typeof input.query === 'string') return input.query
  if (typeof input.url === 'string') return input.url
  if (typeof input.task_id === 'string') return input.task_id
  if (typeof input.description === 'string') return input.description
  return item.name
}

export function ToolCard({ item, compact = false }: { item: ToolItem; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const Icon = ICONS[item.name] ?? Wrench
  const duration =
    item.startedAt && item.endedAt ? formatDuration(item.endedAt - item.startedAt) : null
  const hasDetails = Boolean(
    item.detail?.diff ||
      item.detail?.matches?.length ||
      item.detail?.preview ||
      item.output ||
      item.input
  )

  return (
    <div className={`tool-card ${compact ? 'compact' : ''} status-${item.status}`}>
      <button
        className="tool-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className={`tool-glyph ${item.status}`}>
          <Icon size={14} />
        </span>
        <span className="tool-head-copy">
          <span className="tool-title truncate">{item.title}</span>
          <span className="tool-sub truncate">
            <span className="mono">{item.name}</span>
            <span className="tool-dot">·</span>
            <span>{summaryLine(item)}</span>
          </span>
        </span>
        <span className="tool-meta">
          {duration ? <span className="faint">{duration}</span> : null}
          <span className={`tool-status ${item.status}`}>
            <StatusIcon status={item.status} />
            <span className="tool-status-label">{statusLabel(item.status)}</span>
          </span>
          <ChevronRight
            size={14}
            className={`tool-chevron ${open ? 'open' : ''}`}
            aria-hidden="true"
          />
        </span>
      </button>

      {open && hasDetails ? (
        <div className="tool-body animate-rise">
          {item.detail?.diff ? (
            <DiffView
              patch={item.detail.diff}
              path={item.detail.path}
              additions={item.detail.additions}
              deletions={item.detail.deletions}
              maxHeight={360}
            />
          ) : (
            <>
              {item.detail?.matches?.length ? (
                <div className="match-list">
                  {item.detail.matches.slice(0, 40).map((match, index) => (
                    <div key={index} className="match-row">
                      <span className="match-path mono">
                        {match.path}:{match.line}
                      </span>
                      <span className="match-text mono truncate">{match.text}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {item.detail?.preview && !item.output ? (
                <pre className="tool-pre">{item.detail.preview}</pre>
              ) : null}
              {item.output ? (
                <div className="tool-output-wrap">
                  <div className="tool-output-head">
                    <span className="eyebrow">输出</span>
                    <CopyButton text={item.output} />
                  </div>
                  <pre className="tool-pre">{item.output}</pre>
                </div>
              ) : null}
              {!item.output && !item.detail?.preview && !item.detail?.matches?.length ? (
                <pre className="tool-pre">{JSON.stringify(item.input, null, 2)}</pre>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
