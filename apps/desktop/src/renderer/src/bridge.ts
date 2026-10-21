import type { WowBridge } from '@shared/bridge';

declare global {
  interface Window {
    wow: WowBridge;
  }
}

/**
 * The preload turns a failed engine call into an Error carrying the engine's own
 * message, which is already written for humans. Nothing to rewrap here.
 */
export const bridge = (): WowBridge => window.wow;
