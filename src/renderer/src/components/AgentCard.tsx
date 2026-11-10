import { useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Loader2,
  XCircle
} from 'lucide-react'
import type { AgentCardItem, TimelineItem } from '@shared/types'
import { formatDuration } from '@shared/utils'
import { Markdown } from './Markdown'
import { ToolCard } from './ToolCard'
import { ApprovalCard } from './ApprovalCard'
import { QuestionCard } from './QuestionCard'
import { TodoCard } from './TodoCard'

function NestedItem({ item }: { item: TimelineItem }) {
  switch (item.kind) {
    case 'tool':
      return <ToolCard item={item} compact />
    case 'approval':
      return <ApprovalCard item={item} />
    case 'question':
      return <QuestionCard item={item} />
    case 'todo':
      return <TodoCard item={item} compact />
    case 'message':
      if (item.role === 'assistant' && item.content.trim()) {
        return (
          <div className="agent-narration">
            <Markdown>{item.content}</Markdown>
          </div>
        )
      }
      return null
    case 'notice':
      return <div className={`agent-notice ${item.level}`}>{item.title}</div>
    default:
      return null
  }
}

export function AgentCard({
  item,
  nested
}: {
  item: AgentCardItem
  nested: TimelineItem[]
}) {
  const [open, setOpen] = useState(true)
  const duration =
    item.endedAt !== undefined ? formatDuration(item.endedAt - item.createdAt) : null
  const visible = nested.filter(
    (child) =>
      child.kind === 'tool' ||
      child.kind === 'approval' ||
      child.kind === 'question' ||
      child.kind === 'todo' ||
      (child.kind === 'message' && child.role === 'assistant' && child.content.trim())
  )

  return (
    <div className={`agent-card status-${item.status}`}>
      <button className="agent-head" onClick={() => setOpen((value) => !value)}>
        <span className="agent-glyph">
          <GitBranch size={14} />
        </span>
        <span className="agent-copy">
          <span className="agent-title-row">
            <span className="agent-title">{item.description}</span>
            <span className="agent-type">{item.agentType}</span>
            {item.status === 'running' ? (
              <span className="agent-state running">
                <Loader2 size={11} className="spin" /> 运行中
              </span>
            ) : item.status === 'done' ? (
              <span className="agent-state done">
                <CheckCircle2 size={11} /> 已完成
              </span>
            ) : (
              <span className="agent-state error">
                <XCircle size={11} /> {item.status === 'cancelled' ? '已取消' : '错误'}
              </span>
            )}
          </span>
          <span className="agent-sub">
            子代理
            {item.toolCount ? ` · ${item.toolCount} 次工具调用` : ''}
            {duration ? ` · ${duration}` : ''}
            {item.model ? ` · ${item.model}` : ''}
          </span>
        </span>
        <ChevronRight size={14} className={`tool-chevron ${open ? 'open' : ''}`} />
      </button>

      {open ? (
        <div className="agent-body">
          {visible.length ? (
            <div className="agent-trace">
              {visible.map((child) => (
                <NestedItem key={child.id} item={child} />
              ))}
            </div>
          ) : item.status === 'running' ? (
            <div className="agent-working">
              <Loader2 size={13} className="spin" /> 正在独立上下文中工作…
            </div>
          ) : null}
          {item.summary ? (
            <div className="agent-summary">
              <span className="eyebrow">结果</span>
              <Markdown>{item.summary}</Markdown>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
