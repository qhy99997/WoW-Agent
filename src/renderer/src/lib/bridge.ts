import type { WowApi } from '@shared/types'
import { createMockBridge } from './mockBridge'

/**
 * In Electron, the preload exposes window.wow. In a plain browser (visual QA),
 * we fall back to an in-memory bridge with a seeded workspace.
 */
export const isDesktop = typeof window !== 'undefined' && Boolean(window.wow)
export const api: WowApi = window.wow ?? createMockBridge()
