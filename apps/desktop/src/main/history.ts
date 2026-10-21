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

  for (const message of history) {
    const injection = message.origin?.kind === 'injection';
    if (injection || message.role === 'system') continue;

    // Tool results are machine-facing: they carry the engine's markup
    // (<mcp-result-extras> and friends) and are not something the user wrote
    // or read. The tool call itself is shown from `message.toolCalls` below.
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
      entries.push({
        id: call.id === '' ? nextId('tool') : call.id,
        role: 'tool',
        kind: 'tool-call',
        text: call.name,
        createdAt: 0,
      });
    }
  }

  return entries;
}
