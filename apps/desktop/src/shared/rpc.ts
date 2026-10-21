import type { RpcResult } from './contract';

/**
 * An Error thrown inside the sandboxed preload does not reach the renderer
 * intact: Electron rebuilds it and keeps only `message`/`stack`. So the failure
 * is re-thrown as an Error whose message is the engine's own, and the renderer
 * treats that as the display text.
 *
 * The engine's messages are written for humans (`Session "x" was not found`),
 * which is what the UI needs; the machine-readable code is kept in `RpcError`
 * on the main side for logging.
 */
export function unwrap<T>(result: RpcResult<T>): T {
  if (result.ok) return result.value;
  throw new Error(result.error.message);
}

export interface ErrorText {
  readonly text: string;
}

/** One place to turn whatever was thrown into something displayable. */
export function describeError(error: unknown): ErrorText {
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message !== '') return { text: message };
  }
  if (typeof error === 'string' && error !== '') return { text: error };
  return { text: '出错了，但拿不到详细信息。' };
}
