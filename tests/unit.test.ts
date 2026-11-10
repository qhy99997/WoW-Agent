import { describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { parseSse } from '../src/main/agent/providers/sse'
import { buildDiff } from '../src/main/agent/diff'
import { resolveInside } from '../src/main/util/fsx'
import { formatTokens, estimateTokens } from '../src/shared/utils'
import { AppPaths } from '../src/main/services/paths'
import { SessionStore } from '../src/main/services/sessions'

describe('shared utils', () => {
  it('estimates ASCII and CJK tokens differently', () => {
    expect(estimateTokens('hello world')).toBeGreaterThan(0)
    expect(estimateTokens('你好世界')).toBeGreaterThanOrEqual(4)
  })

  it('formats token counts compactly', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(18_420)).toBe('18k')
    expect(formatTokens(1_250_000)).toBe('1.3m')
  })
})

describe('diff', () => {
  it('counts additions and deletions', () => {
    const result = buildDiff('a.txt', 'one\ntwo\n', 'one\nthree\n')
    expect(result.additions).toBe(1)
    expect(result.deletions).toBe(1)
    expect(result.patch).toContain('+three')
    expect(result.patch).toContain('-two')
  })
})

describe('path safety', () => {
  it('rejects traversal outside the workspace', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wow-path-'))
    try {
      await expect(resolveInside(root, '../escape.txt')).rejects.toThrow(/escapes/)
      const inside = await resolveInside(root, 'nested/file.txt')
      expect(inside.startsWith(root)).toBe(true)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})

describe('SSE parser', () => {
  it('parses events split across chunks', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"a":1}\n\nevent: delta\nda'))
        controller.enqueue(encoder.encode('ta: two\n\n'))
        controller.close()
      }
    })
    const events = []
    for await (const event of parseSse(stream)) events.push(event)
    expect(events).toHaveLength(2)
    expect(events[0].data).toBe('{"a":1}')
    expect(events[1].event).toBe('delta')
    expect(events[1].data).toBe('two')
  })
})

describe('session store', () => {
  it('persists, reloads, and renames sessions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wow-sessions-'))
    try {
      const paths = new AppPaths(root)
      const store = new SessionStore(paths)
      await store.init()
      const workspace = path.join(root, 'workspace')
      const session = await store.create(
        { workspace, title: 'Original' },
        {
          model: { providerId: 'demo', model: 'wow-demo' },
          permissionMode: 'ask',
          workspace
        }
      )
      await store.rename(session.id, 'Renamed')
      expect(store.list()[0].title).toBe('Renamed')

      const reloaded = new SessionStore(paths)
      await reloaded.init()
      expect(reloaded.get(session.id)?.title).toBe('Renamed')
      expect(reloaded.get(session.id)?.workspace).toBe(workspace)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
