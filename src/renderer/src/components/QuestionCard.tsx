import { useMemo, useState } from 'react'
import { Check, MessageCircleQuestion, SkipForward } from 'lucide-react'
import type { QuestionCardItem } from '@shared/types'
import { useAppStore } from '../store/app'

const LETTERS = ['A', 'B', 'C', 'D', 'E']

export function QuestionCard({ item }: { item: QuestionCardItem }) {
  const answerQuestion = useAppStore((state) => state.answerQuestion)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const pending = item.status === 'pending'

  const hasSelection = useMemo(
    () =>
      Object.values(selected).some((values) => values.length > 0) ||
      Object.values(custom).some((value) => value.trim().length > 0),
    [selected, custom]
  )

  const toggle = (questionId: string, label: string, multi: boolean): void => {
    setSelected((current) => {
      const values = current[questionId] ?? []
      if (multi) {
        return {
          ...current,
          [questionId]: values.includes(label)
            ? values.filter((value) => value !== label)
            : [...values, label]
        }
      }
      return { ...current, [questionId]: [label] }
    })
  }

  const submit = async (): Promise<void> => {
    const answers: Record<string, string[]> = {}
    for (const question of item.questions) {
      const values = [...(selected[question.id] ?? [])]
      const extra = custom[question.id]?.trim()
      if (extra) values.push(extra)
      if (values.length) answers[question.id] = values
    }
    setBusy(true)
    await answerQuestion(item.requestId, answers)
    setBusy(false)
  }

  return (
    <div className={`question-card ${pending ? 'pending' : item.status}`}>
      <div className="question-head">
        <span className="question-icon">
          <MessageCircleQuestion size={15} />
        </span>
        <div>
          <div className="question-title">agent 需要你做出决定</div>
          <div className="question-sub">
            {item.agentName ? `来自子代理 · ${item.agentName}` : '回答后任务才能继续'}
          </div>
        </div>
      </div>

      <div className="question-list">
        {item.questions.map((question) => {
          const chosen = selected[question.id] ?? []
          const answered = item.answers?.[question.id]
          return (
            <div key={question.id} className="question-block">
              <div className="question-label-row">
                <span className="question-header">{question.header}</span>
                {question.multiSelect ? <span className="faint">可多选</span> : null}
              </div>
              <p className="question-text">{question.question}</p>
              {answered ? (
                <div className="question-answers">
                  {answered.map((value) => (
                    <span key={value} className="answer-chip">
                      <Check size={11} /> {value}
                    </span>
                  ))}
                </div>
              ) : (
                <>
                  <div className="question-options">
                    {question.options.map((option, index) => {
                      const active = chosen.includes(option.label)
                      return (
                        <button
                          key={option.label}
                          className={`question-option ${active ? 'active' : ''}`}
                          onClick={() => toggle(question.id, option.label, Boolean(question.multiSelect))}
                          disabled={!pending}
                        >
                          <span className="option-letter">{LETTERS[index] ?? '•'}</span>
                          <span className="option-copy">
                            <span className="option-label">{option.label}</span>
                            {option.description ? (
                              <span className="option-desc">{option.description}</span>
                            ) : null}
                          </span>
                          {active ? <Check size={13} className="option-check" /> : null}
                        </button>
                      )
                    })}
                  </div>
                  {pending ? (
                    <input
                      className="input question-custom"
                      placeholder="或输入其他答案…"
                      value={custom[question.id] ?? ''}
                      onChange={(event) =>
                        setCustom((current) => ({ ...current, [question.id]: event.target.value }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && hasSelection) void submit()
                      }}
                    />
                  ) : null}
                </>
              )}
            </div>
          )
        })}
      </div>

      {pending ? (
        <div className="question-actions">
          <button
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => void answerQuestion(item.requestId, {})}
          >
            <SkipForward size={13} /> 跳过
          </button>
          <div className="spacer" />
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !hasSelection}
            onClick={() => void submit()}
          >
            <Check size={13} /> 发送回答
          </button>
        </div>
      ) : null}
    </div>
  )
}
