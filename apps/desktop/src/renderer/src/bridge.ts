import type { WowBridge } from '@shared/bridge.js';

declare global {
  interface Window {
    wow: WowBridge;
  }
}

export const bridge = (): WowBridge => window.wow;
