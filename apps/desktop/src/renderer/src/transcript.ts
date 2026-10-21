import type { ApprovalRequest, StreamDelta, TranscriptEntry } from '@shared/contract';

/**
 * Append a streaming delta to the transcript.
 *
 * A delta extends the last entry when its id matches. Anything else is a new
 * entry: two independent bubbles must never merge just because they share a
 * kind (a user prompt and the reply are both `text`).
 */
export function applyDelta(current: TranscriptEntry[], delta: StreamDelta): TranscriptEntry[] {
  const index = current.findIndex((entry) => entry.id === delta.entryId);
  if (index === -1) {
    return [
      ...current,
      {
        id: delta.entryId,
        role: delta.role,
        kind: delta.kind,
        text: delta.text,
        createdAt: Date.now(),
        ...(delta.status === undefined ? {} : { metadata: { status: delta.status } }),
      },
    ];
  }
  const existing = current[index];
  if (existing === undefined) return current;
  const next = [...current];
  // A tool result settles an existing call: it replaces the text and records
  // the outcome rather than appending a second line.
  if (delta.replace === true || delta.status !== undefined) {
    next[index] = {
      ...existing,
      text: delta.text === '' ? existing.text : delta.text,
      ...(delta.status === undefined
        ? {}
        : { metadata: { ...existing.metadata, status: delta.status } }),
    };
    return next;
  }
  next[index] = { ...existing, text: existing.text + delta.text };
  return next;
}

export interface ApprovalQueue {
  readonly current: ApprovalRequest | null;
  readonly pending: readonly ApprovalRequest[];
}

export const EMPTY_APPROVAL_QUEUE: ApprovalQueue = { current: null, pending: [] };

/**
 * Approvals must be queued, not replaced. A model can issue several tool calls
 * in one turn; overwriting the visible request would leave the earlier one
 * unresolved forever and stall the turn, because the engine waits for every
 * approval it asked for.
 */
export function enqueueApproval(queue: ApprovalQueue, request: ApprovalRequest): ApprovalQueue {
  if (queue.current === null) return { current: request, pending: [] };
  if (queue.current.id === request.id) return queue;
  if (queue.pending.some((item) => item.id === request.id)) return queue;
  return { current: queue.current, pending: [...queue.pending, request] };
}

export function resolveApproval(queue: ApprovalQueue, approvalId: string): ApprovalQueue {
  if (queue.current?.id === approvalId) {
    const [next, ...rest] = queue.pending;
    return { current: next ?? null, pending: rest };
  }
  return { current: queue.current, pending: queue.pending.filter((item) => item.id !== approvalId) };
}

export const STALL_TIMEOUT_MS = 90_000;

/**
 * The engine has no wall-clock turn timeout: if the stream dies mid-reply the
 * turn never emits `turn.ended`, so the UI would spin forever. Report a stall
 * once nothing has arrived for the whole window instead.
 */
export function isStalled(lastActivityAt: number, now: number, timeoutMs = STALL_TIMEOUT_MS): boolean {
  return now - lastActivityAt > timeoutMs;
}
