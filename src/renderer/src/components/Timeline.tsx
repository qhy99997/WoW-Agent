import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Brain,
  CheckCircle2,
  Info,
  XCircle
} from 'lucide-react'
import type {
  AssistantMessageItem,
  CompactionItem,
  NoticeItem,
  ReasoningItem,
  SessionDetail,
  TimelineItem,
  UserMessageItem
} from '@shared/types'
import { formatBytes, formatDuration, formatTokens, relativeTime } from '@shared/utils'
import { useAppStore } from '../store/app'
import { LogoMark } from './LogoMark'
import { Markdown } from './Markdown'
import { ToolCard } from './ToolCard'
import { TodoCard } from './TodoCard'
import { ChangesCard } from './ChangesCard'
import { AgentCard } from './AgentCard'
import { ApprovalCard } from './ApprovalCard'
import { QuestionCard } from './QuestionCard'

function AttachmentChips({ item }: { item: UserMessageItem }) {
  if (!item.attachments?.length) return null
  return (
    <div className="attachment-row">
      {item.attachments.map((attachment) => (
        <span key={attachment.id} className="attachment-chip">
          {attachment.kind === 'image' ? 'IMG' : attachment.kind === 'text' ? 'TXT' : 'FILE'}
          <span className="truncate">{attachment.name}</span>
          <span className="faint">{formatBytes(attachment.size)}</span>
        </span>
      ))}
    </div>
  )
}

function UserMessage({ item }: { item: UserMessageItem }) {
  return (
    <div className="timeline-item user-message animate-rise">
      <div className="user-head">
        <span className="user-badge">你</span>
        <span className="faint">{relativeTime(item.createdAt)}</span>
      </div>
      <div className="user-bubble">{item.content}</div>
      <AttachmentChips item={item} />
    </div>
  )
}

function AssistantMessage({
  item,
  streaming
}: {
  item: AssistantMessageItem
  streaming: boolean
}) {
  return (
    <div className="timeline-item assistant-message animate-rise">
      <div className="assistant-head">
        <LogoMark size={18} />
        <span className="assistant-name">WoW Agent</span>
        {item.model ? <span className="model-chip">{item.model}</span> : null}
        {item.durationMs ? (
          <span className="faint">{formatDuration(item.durationMs)}</span>
        ) : null}
      </div>
      <div className="assistant-body">
        {item.content ? <Markdown>{item.content}</Markdown> : null}
        {streaming ? (
          item.content ? (
            <span className="stream-caret" aria-hidden="true" />
          ) : (
            <div className="thinking-line">
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span className="thinking-dot" />
              <span>思考中</span>
            </div>
          )
        ) : null}
      </div>
    </div>
  )
}

function Reasoning({ item, streaming }: { item: ReasoningItem; streaming: boolean }) {
  const show = useAppStore((state) => state.settings?.showReasoning ?? true)
  const [open, setOpen] = useState(streaming)
  if (!show || !item.content.trim()) return null
  return (
    <div className="timeline-item reasoning-block">
      <button className="reasoning-head" onClick={() => setOpen((value) => !value)}>
        <Brain size={13} />
        <span>{streaming ? '思考中…' : '思考过程'}</span>
        {item.durationMs ? <span className="faint">{formatDuration(item.durationMs)}</span> : null}
        <span className="reasoning-toggle">{open ? '收起' : '展开'}</span>
      </button>
      {open ? <div className="reasoning-body">{item.content}</div> : null}
    </div>
  )
}

const NOTICE_ICON = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle
}

function Notice({ item }: { item: NoticeItem }) {
  const Icon = NOTICE_ICON[item.level]
  return (
    <div className={`notice-item ${item.level}`}>
      <Icon size={14} />
      <div>
        <strong>{item.title}</strong>
        {item.detail ? <p>{item.detail}</p> : null}
      </div>
    </div>
  )
}

function Compaction({ item }: { item: CompactionItem }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="compaction-item">
      <button className="compaction-head" onClick={() => setOpen((value) => !value)}>
        <Archive size={13} />
        <span>上下文已压缩</span>
        <span className="faint">
          {formatTokens(item.beforeTokens)} → {formatTokens(item.afterTokens)}
        </span>
        <span className="reasoning-toggle">{open ? '收起摘要' : '展开摘要'}</span>
      </button>
      {open ? (
        <div className="compaction-body">
          <Markdown>{item.summary}</Markdown>
        </div>
      ) : null}
    </div>
  )
}

function TimelineRow({
  item,
  nested,
  streaming,
  running
}: {
  item: TimelineItem
  nested: TimelineItem[]
  streaming: boolean
  running: boolean
}) {
  switch (item.kind) {
    case 'message':
      return item.role === 'user' ? (
        <UserMessage item={item} />
      ) : (
        <AssistantMessage item={item} streaming={streaming} />
      )
    case 'reasoning':
      return <Reasoning item={item} streaming={streaming} />
    case 'tool':
      return (
        <div className="timeline-item">
          <ToolCard item={item} />
        </div>
      )
    case 'todo':
      return (
        <div className="timeline-item">
          <TodoCard item={item} />
        </div>
      )
    case 'changes':
      return (
        <div className="timeline-item">
          <ChangesCard item={item} />
        </div>
      )
    case 'agent':
      return (
        <div className="timeline-item">
          <AgentCard item={item} nested={nested} />
        </div>
      )
    case 'approval':
      return (
        <div className="timeline-item">
          <ApprovalCard item={item} />
        </div>
      )
    case 'question':
      return (
        <div className="timeline-item">
          <QuestionCard item={item} />
        </div>
      )
    case 'notice':
      return (
        <div className="timeline-item">
          <Notice item={item} />
        </div>
      )
    case 'compaction':
      return (
        <div className="timeline-item">
          <Compaction item={item} />
        </div>
      )
    default:
      void running
      return null
  }
}

export function Timeline({
  session,
  running
}: {
  session: SessionDetail
  running: boolean
}) {
  const { topLevel, nested } = useMemo(() => {
    const map = new Map<string, TimelineItem[]>()
    for (const item of session.timeline) {
      if (item.agentId) {
        const list = map.get(item.agentId) ?? []
        list.push(item)
        map.set(item.agentId, list)
      }
    }
    return { topLevel: session.timeline.filter((item) => !item.agentId), nested: map }
  }, [session.timeline])

  const lastId = topLevel[topLevel.length - 1]?.id

  return (
    <div className="timeline">
      {topLevel.map((item) => (
        <TimelineRow
          key={item.id}
          item={item}
          nested={item.kind === 'agent' ? nested.get(item.runId) ?? [] : []}
          streaming={running && item.id === lastId}
          running={running}
        />
      ))}
    </div>
  )
}
