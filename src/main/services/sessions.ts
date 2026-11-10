import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  CreateSessionInput,
  ModelRef,
  PermissionMode,
  SessionDetail,
  SessionSummary
} from '@shared/types'
import { DEFAULT_SETTINGS } from '@shared/defaults'
import type { AppPaths } from './paths'
import { readJson, writeJson } from '../util/fsx'
import { newId, now } from '../util/ids'

function summarise(session: SessionDetail): SessionSummary {
  const { history: _history, timeline: _timeline, todos: _todos, changes: _changes, ...rest } =
    session
  const lastAssistant = [...session.timeline]
    .reverse()
    .find((item) => item.kind === 'message' && item.role === 'assistant' && item.content.trim())
  const lastUser = [...session.timeline]
    .reverse()
    .find((item) => item.kind === 'message' && item.role === 'user')
  const preview = (
    lastAssistant && lastAssistant.kind === 'message'
      ? lastAssistant.content
      : lastUser && lastUser.kind === 'message'
        ? lastUser.content
        : ''
  )
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140)
  return { ...rest, preview }
}

export class SessionStore {
  private cache = new Map<string, SessionDetail>()

  constructor(private readonly paths: AppPaths) {}

  async init(): Promise<void> {
    await fs.mkdir(this.paths.sessions, { recursive: true })
    const entries = await fs.readdir(this.paths.sessions, { withFileTypes: true }).catch(() => [])
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const session = await readJson<SessionDetail | null>(
            this.paths.sessionFile(entry.name),
            null
          )
          if (session && session.id) {
            // A run cannot survive an app restart; clear stale interactive state.
            let dirty = false
            if (session.status === 'running') {
              session.status = 'idle'
              dirty = true
            }
            for (const item of session.timeline) {
              if (item.kind === 'approval' && item.status === 'pending') {
                item.status = 'expired'
                dirty = true
              }
              if (item.kind === 'question' && item.status === 'pending') {
                item.status = 'cancelled'
                dirty = true
              }
            }
            if (dirty) {
              await writeJson(this.paths.sessionFile(session.id), session).catch(() => undefined)
            }
            this.cache.set(session.id, session)
          }
        })
    )
  }

  list(): SessionSummary[] {
    return [...this.cache.values()]
      .map((session) => summarise(session))
      .sort((a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.updatedAt - a.updatedAt)
  }

  get(id: string): SessionDetail | undefined {
    return this.cache.get(id)
  }

  getOrThrow(id: string): SessionDetail {
    const session = this.cache.get(id)
    if (!session) throw new Error(`找不到会话：${id}`)
    return session
  }

  async create(
    input: CreateSessionInput,
    defaults: { model: ModelRef | null; permissionMode: PermissionMode; workspace: string }
  ): Promise<SessionDetail> {
    const timestamp = now()
    const workspace = input.workspace || defaults.workspace
    await fs.mkdir(workspace, { recursive: true }).catch(() => undefined)
    const session: SessionDetail = {
      id: newId('ses'),
      title: input.title?.trim() || '新任务',
      workspace,
      createdAt: timestamp,
      updatedAt: timestamp,
      model: input.model ?? defaults.model ?? { providerId: 'demo', model: 'wow-demo' },
      permissionMode: input.permissionMode ?? defaults.permissionMode,
      workflowId: input.workflowId,
      status: 'idle',
      preview: '',
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      contextTokens: 0,
      history: [],
      timeline: [],
      todos: [],
      changes: [],
      allowedTools: [],
      turnId: newId('turn')
    }
    this.cache.set(session.id, session)
    await this.save(session)
    return session
  }

  async save(session: SessionDetail): Promise<void> {
    session.updatedAt = now()
    await fs.mkdir(this.paths.sessionDir(session.id), { recursive: true })
    await writeJson(this.paths.sessionFile(session.id), session)
  }

  async rename(id: string, title: string): Promise<SessionSummary> {
    const session = this.getOrThrow(id)
    session.title = title.trim().slice(0, 120) || session.title
    await this.save(session)
    return summarise(session)
  }

  async remove(id: string): Promise<void> {
    this.cache.delete(id)
    await fs.rm(this.paths.sessionDir(id), { recursive: true, force: true })
  }

  async setModel(id: string, model: ModelRef): Promise<SessionSummary> {
    const session = this.getOrThrow(id)
    session.model = model
    await this.save(session)
    return summarise(session)
  }

  async setMode(id: string, mode: PermissionMode): Promise<SessionSummary> {
    const session = this.getOrThrow(id)
    session.permissionMode = mode
    await this.save(session)
    return summarise(session)
  }

  summary(session: SessionDetail): SessionSummary {
    return summarise(session)
  }

  async removeAll(): Promise<void> {
    this.cache.clear()
    await fs.rm(this.paths.sessions, { recursive: true, force: true })
    await fs.mkdir(this.paths.sessions, { recursive: true })
  }

  defaultModel(): ModelRef {
    return DEFAULT_SETTINGS.defaultModel ?? { providerId: 'demo', model: 'wow-demo' }
  }

  relativeFile(id: string): string {
    return path.join(this.paths.sessionDir(id), 'session.json')
  }
}
