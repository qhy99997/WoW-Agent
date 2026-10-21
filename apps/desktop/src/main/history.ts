import type { ContextMessage } from '@moonshot-ai/kimi-code-sdk';

import type { TranscriptEntry } from '../shared/contract';

/**
 * The engine keeps the whole conversation — including permission-mode notices
 * and other injected context — and replays it through `getContext()`. This maps
 * that back onto the flat entries the renderer draws.
 *
 * Injected context is dropped: it is engine bookkeeping, not something the user
 * typed or the model said.
 */
export function projectHistory(history: readonly ContextMessage[]): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  let sequence = 0;
  const nextId = (prefix: string): string => `${prefix}-${(sequence += 1)}`;

  // A tool call and its result are separate messages sharing a toolCallId, and
  // the result may arrive before or after the call in the replayed history.
  // Collect outcomes first so the call entry can carry its final status.
  const outcomes = new Map<string, 'ok' | 'error'>();
  for (const message of history) {
    if (message.role !== 'tool' || message.toolCallId === undefined) continue;
    outcomes.set(message.toolCallId, message.isError === true ? 'error' : 'ok');
  }

  for (const message of history) {
    const injection = message.origin?.kind === 'injection';
    if (injection || message.role === 'system') continue;

    // The tool result text itself is machine-facing (it can carry engine markup),
    // and its outcome is already folded into the call entry above.
    if (message.role === 'tool') continue;

    const text = message.content
      .filter((part) => part.type === 'text')
      .map((part) => (part as { text: string }).text)
      .join('');

    if (text !== '') {
      entries.push({
        id: message.id ?? nextId('history'),
        role: message.role === 'user' ? 'user' : 'assistant',
        kind: 'text',
        text,
        createdAt: 0,
      });
    }

    for (const call of message.toolCalls ?? []) {
      const status = outcomes.get(call.id);
      entries.push({
        id: call.id === '' ? nextId('tool') : call.id,
        role: 'tool',
        kind: 'tool-call',
        text: call.name,
        createdAt: 0,
        ...(status === undefined ? {} : { metadata: { status } }),
      });
    }
  }

  return entries;
}
