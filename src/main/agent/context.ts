import type { AgentMessage, CompactionItem, SessionDetail } from '@shared/types'
import { estimateTokens } from '@shared/utils'
import { newId, now } from '../util/ids'
import type { ProviderAdapter } from './providers/types'

export function historyTokens(messages: AgentMessage[]): number {
  return messages.reduce((total, message) => {
    const toolTokens = (message.toolCalls ?? []).reduce(
      (sum, call) => sum + estimateTokens(call.name) + estimateTokens(call.arguments),
      0
    )
    return total + estimateTokens(message.content) + toolTokens + 6
  }, 0)
}

/** Keep the newest messages without orphaning tool results from their calls. */
function chooseTail(messages: AgentMessage[], keepBudget: number): number {
  let tokens = 0
  let index = messages.length
  while (index > 0) {
    const candidate = messages[index - 1]
    const cost = estimateTokens(candidate.content) + 8
    if (tokens + cost > keepBudget && index < messages.length) break
    tokens += cost
    index -= 1
    if (messages.length - index >= 10) break
  }
  // Never start the tail with a tool result whose assistant call was removed.
  while (index < messages.length && messages[index].role === 'tool') index += 1
  if (index >= messages.length) index = Math.max(0, messages.length - 2)
  return index
}

function transcript(messages: AgentMessage[], limit = 70_000): string {
  const lines: string[] = []
  let total = 0
  for (const message of messages) {
    const tools = message.toolCalls?.length
      ? ` [called ${message.toolCalls.map((call) => call.name).join(', ')}]`
      : ''
    const line = `${message.role.toUpperCase()}: ${message.content}${tools}`
    if (total + line.length > limit) {
      lines.push('…[earlier transcript truncated]')
      break
    }
    lines.push(line)
    total += line.length
  }
  return lines.join('\n\n')
}

export interface CompactionOptions {
  session: SessionDetail
  provider: ProviderAdapter
  model: string
  contextWindow: number
  compactAt: number
  force?: boolean
  enabled?: boolean
  emit: (item: CompactionItem) => void
  persist: () => Promise<void>
}

/**
 * Replace older turns with a model-written summary when context pressure is
 * high. Falls back to a hard trim if summarisation fails.
 */
export async function compactIfNeeded(options: CompactionOptions): Promise<boolean> {
  const { session, contextWindow, compactAt, force } = options
  const before = historyTokens(session.history)
  const threshold = Math.floor(contextWindow * compactAt)
  if (!force && before < threshold) return false
  if (session.history.length < 6) return false

  const tailStart = chooseTail(session.history, Math.min(12_000, Math.floor(contextWindow * 0.18)))
  const older = session.history.slice(0, tailStart)
  const tail = session.history.slice(tailStart)
  if (!older.length) return false

  let summary = ''
  if (options.enabled !== false) {
    try {
      const request = {
        model: options.model,
        temperature: 0.2,
        maxTokens: 1400,
        tools: [],
        signal: AbortSignal.timeout(90_000),
        messages: [
          {
            role: 'system' as const,
            content:
              'You compress agent conversation history. Preserve: the user’s goals and constraints, decisions made, files read or changed (with paths), important tool results, unresolved questions, and exact identifiers. Drop pleasantries and redundant reasoning. Write compact Markdown under 900 words. Do not invent anything.'
          },
          {
            role: 'user' as const,
            content: `Summarise this conversation history for the agent that must continue the task.\n\n${transcript(older)}`
          }
        ]
      }
      for await (const event of options.provider.stream(request)) {
        if (event.type === 'text') summary += event.delta
      }
    } catch {
      summary = ''
    }
  }

  if (!summary.trim()) {
    summary = [
      '## Conversation summary (automatic trim)',
      `Earlier turns were removed to fit the context window (${older.length} messages).`,
      `The most recent work continues below. Files changed so far: ${
        session.changes.slice(-8).map((change) => change.path).join(', ') || '(none)'
      }.`
    ].join('\n')
  }

  const summaryMessage: AgentMessage = {
    role: 'system',
    content: `## Conversation summary (older turns compacted)\n\n${summary.trim()}`
  }
  session.history = [summaryMessage, ...tail]
  const after = historyTokens(session.history)
  session.contextTokens = after

  const item: CompactionItem = {
    id: newId('compact'),
    kind: 'compaction',
    createdAt: now(),
    beforeTokens: before,
    afterTokens: after,
    summary: summary.trim()
  }
  options.emit(item)
  await options.persist()
  return true
}
