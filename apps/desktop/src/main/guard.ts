import type { RpcResult } from '../shared/contract';

/**
 * Every IPC handler answers with a tagged result instead of throwing: a thrown
 * error crossing the bridge loses its type and arrives at the renderer as an
 * opaque `Error invoking remote method`, which is useless to show a user.
 *
 * Errors are reduced to `{ code, message }` here, at the boundary, so the
 * renderer never sees a non-serialisable value.
 */
export async function guard<T>(run: () => Promise<T> | T): Promise<RpcResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: toRpcError(error) };
  }
}

export function toRpcError(error: unknown): { code: string; message: string; hint?: string } {
  if (typeof error === 'object' && error !== null) {
    // Do not rely on `instanceof Error`: the engine ships its own Error subclass
    // from a bundled build, so a cross-realm instance fails the check and every
    // field would be lost. Duck-type instead.
    const record = error as { code?: unknown; name?: unknown; message?: unknown; hint?: unknown };
    const message = typeof record.message === 'string' ? record.message : 'Unexpected error';
    const explicit = record.code;
    const code =
      typeof explicit === 'string' && explicit !== ''
        ? explicit
        : typeof record.name === 'string' && record.name !== 'Error' && record.name !== 'WowError'
          ? record.name
          : 'internal';
    return typeof record.hint === 'string'
      ? { code, message, hint: record.hint }
      : { code, message };
  }
  if (typeof error === 'string') return { code: 'internal', message: error };
  return { code: 'internal', message: 'Unexpected error' };
}
