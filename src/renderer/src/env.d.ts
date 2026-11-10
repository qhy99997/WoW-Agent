import type { WowApi } from '@shared/types'

declare global {
  interface Window {
    wow?: WowApi
  }
}

declare module 'ansi-to-html' {
  export default class Convert {
    constructor(options?: Record<string, unknown>)
    toHtml(text: string): string
  }
}

export {}
