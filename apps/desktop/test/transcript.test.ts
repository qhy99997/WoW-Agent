import { describe, expect, it } from 'vitest';

import type { ApprovalRequest, StreamDelta } from '@shared/contract';
import {
  applyDelta,
  EMPTY_APPROVAL_QUEUE,
  enqueueApproval,
  isStalled,
  resolveApproval,
  STALL_TIMEOUT_MS,
  type ApprovalQueue,
} from '../src/renderer/src/transcript';

function delta(overrides: Partial<StreamDelta> & { entryId: string }): StreamDelta {
  return {
    sessionId: 's1',
    role: 'assistant',
    kind: 'text',
    text: '',
    done: false,
    ...overrides,
  };
}

function request(id: string): ApprovalRequest {
  return {
    id,
    sessionId: 's1',
    title: `approve ${id}`,
    options: [{ id: 'allow_once', label: 'allow' }],
  };
}

describe('applyDelta', () => {
  it('creates an entry for an unseen id', () => {
    const entries = applyDelta([], delta({ entryId: 'e1', text: 'hello' }));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ id: 'e1', role: 'assistant', text: 'hello' });
  });

  it('records a status on a brand-new entry', () => {
    const entries = applyDelta([], delta({ entryId: 't1', role: 'tool', status: 'ok' }));

    expect(entries[0]?.metadata).toEqual({ status: 'ok' });
  });

  it('replaces the text and records a status when a tool result arrives', () => {
    const started = applyDelta([], delta({ entryId: 't1', role: 'tool', kind: 'tool-call', text: 'Write' }));
    const settled = applyDelta(
      started,
      delta({ entryId: 't1', role: 'tool', kind: 'tool-call', text: 'Write', status: 'error', replace: true }),
    );

    expect(settled).toHaveLength(1);
    expect(settled[0]).toMatchObject({ text: 'Write', metadata: { status: 'error' } });
  });

  it('does not duplicate the tool name when the result carries no text', () => {
    const started = applyDelta([], delta({ entryId: 't1', role: 'tool', kind: 'tool-call', text: 'Write' }));
    const settled = applyDelta(started, delta({ entryId: 't1', role: 'tool', text: '', status: 'ok' }));

    expect(settled[0]?.text).toBe('Write');
  });

  it('keeps appending for a plain delta on a tool entry', () => {
    const started = applyDelta([], delta({ entryId: 't1', role: 'tool', text: 'Write' }));
    const appended = applyDelta(started, delta({ entryId: 't1', role: 'tool', text: ' ok' }));

    expect(appended[0]?.text).toBe('Write ok');
  });

  it('appends to the matching entry by id', () => {
    let entries = applyDelta([], delta({ entryId: 'e1', text: 'hel' }));
    entries = applyDelta(entries, delta({ entryId: 'e1', text: 'lo' }));

    expect(entries).toHaveLength(1);
    expect(entries[0]?.text).toBe('hello');
  });

  it('never merges two entries that only share a kind', () => {
    let entries = applyDelta([], delta({ entryId: 'user-1', role: 'user', text: 'question' }));
    entries = applyDelta(entries, delta({ entryId: 'assistant-1', text: 'answer' }));

    expect(entries.map((entry) => entry.text)).toEqual(['question', 'answer']);
  });

  it('keeps entries in arrival order', () => {
    let entries = applyDelta([], delta({ entryId: 'a', text: '1' }));
    entries = applyDelta(entries, delta({ entryId: 'b', text: '2' }));
    entries = applyDelta(entries, delta({ entryId: 'a', text: '1x' }));

    expect(entries.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(entries[0]?.text).toBe('11x');
  });
});

describe('approval queue', () => {
  it('shows the first request immediately', () => {
    const queue = enqueueApproval(EMPTY_APPROVAL_QUEUE, request('a'));

    expect(queue.current?.id).toBe('a');
    expect(queue.pending).toEqual([]);
  });

  it('queues later requests instead of dropping the visible one', () => {
    let queue: ApprovalQueue = enqueueApproval(EMPTY_APPROVAL_QUEUE, request('a'));
    queue = enqueueApproval(queue, request('b'));
    queue = enqueueApproval(queue, request('c'));

    expect(queue.current?.id).toBe('a');
    expect(queue.pending.map((item) => item.id)).toEqual(['b', 'c']);
  });

  it('advances to the next request once the current one resolves', () => {
    let queue = enqueueApproval(EMPTY_APPROVAL_QUEUE, request('a'));
    queue = enqueueApproval(queue, request('b'));

    queue = resolveApproval(queue, 'a');
    expect(queue.current?.id).toBe('b');
    expect(queue.pending).toEqual([]);

    queue = resolveApproval(queue, 'b');
    expect(queue.current).toBeNull();
  });

  it('removes a queued request resolved out of order without touching the current', () => {
    let queue = enqueueApproval(EMPTY_APPROVAL_QUEUE, request('a'));
    queue = enqueueApproval(queue, request('b'));

    queue = resolveApproval(queue, 'b');
    expect(queue.current?.id).toBe('a');
    expect(queue.pending).toEqual([]);
  });

  it('ignores duplicate deliveries of the same request', () => {
    let queue = enqueueApproval(EMPTY_APPROVAL_QUEUE, request('a'));
    queue = enqueueApproval(queue, request('b'));
    queue = enqueueApproval(queue, request('b'));

    expect(queue.pending.map((item) => item.id)).toEqual(['b']);
  });

  it('ignores resolving an unknown id', () => {
    const queue = enqueueApproval(EMPTY_APPROVAL_QUEUE, request('a'));

    expect(resolveApproval(queue, 'nope')).toEqual(queue);
  });
});

describe('isStalled', () => {
  it('is false while output keeps arriving', () => {
    expect(isStalled(1_000, 1_500, 90_000)).toBe(false);
  });

  it('is false exactly at the threshold', () => {
    expect(isStalled(0, STALL_TIMEOUT_MS, STALL_TIMEOUT_MS)).toBe(false);
  });

  it('is true once the window passes with no activity', () => {
    expect(isStalled(0, STALL_TIMEOUT_MS + 1, STALL_TIMEOUT_MS)).toBe(true);
  });
});
