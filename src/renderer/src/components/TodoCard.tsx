import { CheckCircle2, Circle, CircleDot, ListChecks } from 'lucide-react'
import type { TodoCardItem } from '@shared/types'

export function TodoCard({ item, compact = false }: { item: TodoCardItem; compact?: boolean }) {
  const done = item.todos.filter((todo) => todo.status === 'completed').length
  const pct = item.todos.length ? Math.round((done / item.todos.length) * 100) : 0
  const active = item.todos.find((todo) => todo.status === 'in_progress')

  return (
    <div className={`todo-card ${compact ? 'compact' : ''}`}>
      <div className="todo-head">
        <span className="todo-icon">
          <ListChecks size={14} />
        </span>
        <span className="todo-title">计划</span>
        {active ? <span className="todo-active truncate">{active.content}</span> : null}
        <span className="todo-count">
          {done}/{item.todos.length}
        </span>
      </div>
      <div className="todo-progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      <ul className="todo-list">
        {item.todos.map((todo) => (
          <li key={todo.id} className={`todo-item ${todo.status}`}>
            <span className="todo-status-icon">
              {todo.status === 'completed' ? (
                <CheckCircle2 size={14} />
              ) : todo.status === 'in_progress' ? (
                <CircleDot size={14} />
              ) : (
                <Circle size={14} />
              )}
            </span>
            <span className="todo-text">{todo.content}</span>
            {todo.priority === 'high' && todo.status !== 'completed' ? (
              <span className="todo-priority">高</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
