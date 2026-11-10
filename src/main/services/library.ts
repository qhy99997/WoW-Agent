import type { LibraryItem } from '@shared/types'
import type { AppPaths } from './paths'
import { readJson, writeJson } from '../util/fsx'
import { newId, now } from '../util/ids'

export class LibraryService {
  private items: LibraryItem[] = []
  private loaded = false

  constructor(private readonly paths: AppPaths) {}

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    this.items = await readJson<LibraryItem[]>(this.paths.libraryFile, [])
  }

  list(): LibraryItem[] {
    return [...this.items].sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async add(input: {
    title: string
    kind: LibraryItem['kind']
    content: string
    tags?: string[]
    sourcePath?: string
    sourceSessionId?: string
  }): Promise<LibraryItem> {
    await this.load()
    const timestamp = now()
    const content = input.content.slice(0, 500_000)
    const item: LibraryItem = {
      id: newId('lib'),
      title: input.title.trim().slice(0, 160) || '未命名',
      kind: input.kind,
      tags: (input.tags ?? []).map((tag) => tag.trim()).filter(Boolean).slice(0, 8),
      excerpt: content.replace(/[#*`>_-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240),
      content,
      sourcePath: input.sourcePath,
      sourceSessionId: input.sourceSessionId,
      createdAt: timestamp,
      updatedAt: timestamp
    }
    this.items.unshift(item)
    await this.flush()
    return item
  }

  async remove(id: string): Promise<void> {
    await this.load()
    this.items = this.items.filter((item) => item.id !== id)
    await this.flush()
  }

  search(query: string): LibraryItem[] {
    const q = query.toLowerCase().trim()
    if (!q) return this.list()
    return this.list().filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.excerpt.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
    )
  }

  private async flush(): Promise<void> {
    await writeJson(this.paths.libraryFile, this.items)
  }
}
