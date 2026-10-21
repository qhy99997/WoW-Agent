import { describe, expect, it } from 'vitest';

import type { ContextMessage } from '@moonshot-ai/kimi-code-sdk';

import { projectHistory } from '../src/main/history';

function message(overrides: Partial<ContextMessage> & { role: ContextMessage['role'] }): ContextMessage {
  return {
    content: [],
    toolCalls: [],
    ...overrides,
  } as ContextMessage;
}

function text(value: string): ContextMessage['content'] {
  return [{ type: 'text', text: value }];
}

describe('projectHistory', () => {
  it('maps a user prompt and an assistant reply to two entries', () => {
    const entries = projectHistory([
      message({ role: 'user', id: 'm1', content: text('hello') }),
      message({ role: 'assistant', id: 'm2', content: text('hi there') }),
    ]);

    expect(entries.map((entry) => [entry.role, entry.text])).toEqual([
      ['user', 'hello'],
      ['assistant', 'hi there'],
    ]);
    expect(entries.map((entry) => entry.id)).toEqual(['m1', 'm2']);
  });

  it('drops injected context so permission-mode notices never reach the UI', () => {
    const entries = projectHistory([
      message({ role: 'user', id: 'm1', content: text('do the thing') }),
      message({
        role: 'user',
        content: text('<system-reminder>auto mode</system-reminder>'),
        origin: { kind: 'injection' } as ContextMessage['origin'],
      }),
      message({ role: 'assistant', id: 'm3', content: text('done') }),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.text)).toEqual(['do the thing', 'done']);
  });

  it('drops system messages', () => {
    const entries = projectHistory([
      message({ role: 'system', content: text('system prompt') }),
      message({ role: 'user', id: 'm1', content: text('hi') }),
    ]);

    expect(entries.map((entry) => entry.text)).toEqual(['hi']);
  });

  it('drops tool result messages so engine markup never reaches the UI', () => {
    const entries = projectHistory([
      message({ role: 'user', id: 'm1', content: text('list the dirs') }),
      message({
        role: 'assistant',
        id: 'm2',
        content: [],
        toolCalls: [
          { type: 'function', id: 'call_1', name: 'mcp__fs__list', arguments: '{}' },
        ],
      }),
      message({
        role: 'tool',
        toolCallId: 'call_1',
        content: text('\n<mcp-result-extras>\n{"_meta":{}}\n</mcp-result-extras>'),
      }),
    ]);

    const all = entries.map((entry) => entry.text).join('\n');
    expect(all).not.toContain('mcp-result-extras');
    expect(entries.map((entry) => [entry.role, entry.text])).toEqual([
      ['user', 'list the dirs'],
      ['tool', 'mcp__fs__list'],
    ]);
  });

  it('expands tool calls into their own entries', () => {
    const entries = projectHistory([
      message({ role: 'user', id: 'm1', content: text('read a file') }),
      message({
        role: 'assistant',
        id: 'm2',
        content: text('reading'),
        toolCalls: [
          { type: 'function', id: 'call_1', name: 'Read', arguments: '{}' },
          { type: 'function', id: 'call_2', name: 'Bash', arguments: '{}' },
        ],
      }),
    ]);

    expect(entries.map((entry) => [entry.role, entry.kind, entry.text])).toEqual([
      ['user', 'text', 'read a file'],
      ['assistant', 'text', 'reading'],
      ['tool', 'tool-call', 'Read'],
      ['tool', 'tool-call', 'Bash'],
    ]);
  });

  it('joins multiple text parts into one entry', () => {
    const entries = projectHistory([
      message({
        role: 'assistant',
        id: 'm1',
        content: [
          { type: 'text', text: 'part one ' },
          { type: 'text', text: 'part two' },
        ],
      }),
    ]);

    expect(entries[0]?.text).toBe('part one part two');
  });

  it('synthesises unique ids when the engine omits them', () => {
    const entries = projectHistory([
      message({ role: 'assistant', content: text('a') }),
      message({ role: 'assistant', content: text('b') }),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.id).not.toBe(entries[1]?.id);
    expect(entries.every((entry) => entry.id !== '')).toBe(true);
  });

  it('returns an empty list for an empty history', () => {
    expect(projectHistory([])).toEqual([]);
  });

  it('marks a tool call as failed when its result is an error', () => {
    const entries = projectHistory([
      message({
        role: 'assistant',
        id: 'm1',
        content: [],
        toolCalls: [{ type: 'function', id: 'call_1', name: 'Read', arguments: '{}' }],
      }),
      message({
        role: 'tool',
        toolCallId: 'call_1',
        isError: true,
        content: text('"/nope.txt" does not exist.'),
      }),
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.metadata).toEqual({ status: 'error' });
  });

  it('marks a tool call as ok when its result succeeded', () => {
    const entries = projectHistory([
      message({
        role: 'assistant',
        id: 'm1',
        content: [],
        toolCalls: [{ type: 'function', id: 'call_1', name: 'Read', arguments: '{}' }],
      }),
      message({ role: 'tool', toolCallId: 'call_1', content: text('file contents') }),
    ]);

    expect(entries[0]?.metadata).toEqual({ status: 'ok' });
  });

  it('leaves a call without a result unmarked', () => {
    const entries = projectHistory([
      message({
        role: 'assistant',
        id: 'm1',
        content: [],
        toolCalls: [{ type: 'function', id: 'call_1', name: 'Read', arguments: '{}' }],
      }),
    ]);

    expect(entries[0]?.metadata).toBeUndefined();
  });

  it('matches a result that appears before its call', () => {
    const entries = projectHistory([
      message({ role: 'tool', toolCallId: 'call_1', isError: true, content: text('boom') }),
      message({
        role: 'assistant',
        id: 'm1',
        content: [],
        toolCalls: [{ type: 'function', id: 'call_1', name: 'Read', arguments: '{}' }],
      }),
    ]);

    expect(entries[0]?.metadata).toEqual({ status: 'error' });
  });

  it('pairs results with the right call when several are present', () => {
    const entries = projectHistory([
      message({
        role: 'assistant',
        id: 'm1',
        content: [],
        toolCalls: [
          { type: 'function', id: 'call_1', name: 'Read', arguments: '{}' },
          { type: 'function', id: 'call_2', name: 'Write', arguments: '{}' },
        ],
      }),
      message({ role: 'tool', toolCallId: 'call_1', content: text('ok') }),
      message({ role: 'tool', toolCallId: 'call_2', isError: true, content: text('denied') }),
    ]);

    expect(entries.map((entry) => entry.metadata)).toEqual([
      { status: 'ok' },
      { status: 'error' },
    ]);
  });
});
