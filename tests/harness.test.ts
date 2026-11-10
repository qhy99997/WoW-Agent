import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type {
  AppEvent,
  ApprovalCardItem,
  AssistantMessageItem,
  PermissionMode,
  ProviderView,
  SessionDetail,
  TimelineItem,
  ToolItem
} from '../src/shared/types'
import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderRequest
} from '../src/main/agent/providers/types'
import { AgentRuntime } from '../src/main/agent/runtime'
import { TaskManager } from '../src/main/agent/tasks'
import { AppPaths } from '../src/main/services/paths'
import { LibraryService } from '../src/main/services/library'
import { SessionStore } from '../src/main/services/sessions'
import { SettingsService } from '../src/main/services/settings'
import { SkillService } from '../src/main/services/skills'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

class ScriptedAdapter implements ProviderAdapter {
  readonly kind = 'openai'
  calls = 0

  constructor(
    private readonly turns: (request: ProviderRequest, call: number) => ProviderEvent[]
  ) {}

  async *stream(request: ProviderRequest): AsyncGenerator<ProviderEvent> {
    const events = this.turns(request, this.calls)
    this.calls += 1
    for (const event of events) yield event
  }

  async ping(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: 'scripted' }
  }
}

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  while (cleanups.length) {
    const cleanup = cleanups.pop()
    await cleanup?.()
  }
})

interface Harness {
  root: string
  workspace: string
  paths: AppPaths
  session: SessionDetail
  sessions: SessionStore
  runtime: AgentRuntime
  events: AppEvent[]
  adapter: ScriptedAdapter
}

async function createHarness(options: {
  turns: (request: ProviderRequest, call: number) => ProviderEvent[]
  mode?: PermissionMode
}): Promise<Harness> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wow-harness-'))
  const workspace = path.join(root, 'workspace')
  await fs.mkdir(workspace, { recursive: true })
  await fs.writeFile(path.join(workspace, 'hello.txt'), 'hello from test\n', 'utf8')

  const paths = new AppPaths(root)
  const secrets = {
    load: async () => undefined,
    has: () => true,
    get: () => 'test-key',
    set: async () => undefined,
    remove: async () => undefined
  } as never
  const settings = new SettingsService(paths, secrets)
  await settings.load()
  const sessions = new SessionStore(paths)
  await sessions.init()
  const library = new LibraryService(paths)
  await library.load()
  const skills = new SkillService(paths)
  await skills.ensureUserDir()
  const tasks = new TaskManager(paths, () => undefined)

  const adapter = new ScriptedAdapter(options.turns)
  const events: AppEvent[] = []
  const runtime = new AgentRuntime(
    {
      sessions,
      settings,
      library,
      skills,
      tasks,
      providerFactory: (_provider: ProviderView) => adapter
    },
    (event) => events.push(event)
  )

  const session = await sessions.create(
    { workspace, title: 'Harness test' },
    {
      model: { providerId: 'demo', model: 'wow-demo' },
      permissionMode: options.mode ?? 'ask',
      workspace
    }
  )

  cleanups.push(async () => {
    tasks.dispose()
    await fs.rm(root, { recursive: true, force: true })
  })

  return { root, workspace, paths, session, sessions, runtime, events, adapter }
}

function textItem(content: string): ProviderEvent {
  return { type: 'text', delta: content }
}

function toolCall(id: string, name: string, args: Record<string, unknown>): ProviderEvent {
  return {
    type: 'tool_call',
    call: { id, name, arguments: JSON.stringify(args) }
  }
}

function waitFor(
  events: AppEvent[],
  predicate: (event: AppEvent) => boolean,
  timeoutMs = 6000
): Promise<AppEvent> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = (): void => {
      const found = events.find(predicate)
      if (found) return resolve(found)
      if (Date.now() - started > timeoutMs) return reject(new Error('Timed out waiting for event'))
      setTimeout(poll, 15)
    }
    poll()
  })
}

describe('agent harness', () => {
  it('runs a tool loop and persists the conversation', async () => {
    const harness = await createHarness({
      turns: (_request, call) =>
        call === 0
          ? [
              textItem('Reading the file.'),
              toolCall('call_read', 'read_file', { path: 'hello.txt' }),
              { type: 'usage', inputTokens: 120, outputTokens: 12 },
              { type: 'done', reason: 'tool_calls' }
            ]
          : [
              textItem('The file says hello.'),
              { type: 'usage', inputTokens: 180, outputTokens: 8 },
              { type: 'done', reason: 'stop' }
            ]
    })

    await harness.runtime.send({ sessionId: harness.session.id, text: 'Read hello.txt' })

    expect(harness.session.status).toBe('idle')
    expect(harness.session.error).toBeUndefined()
    expect(harness.adapter.calls).toBe(2)

    const tool = harness.session.timeline.find((item): item is ToolItem => item.kind === 'tool')
    expect(tool?.status).toBe('success')
    expect(tool?.output).toContain('hello from test')

    const assistants = harness.session.timeline.filter(
      (item): item is AssistantMessageItem =>
        item.kind === 'message' && item.role === 'assistant'
    )
    expect(assistants.at(-1)?.content).toContain('The file says hello.')

    const toolMessages = harness.session.history.filter((message) => message.role === 'tool')
    expect(toolMessages).toHaveLength(1)
    expect(toolMessages[0].content).toContain('hello from test')

    const persisted = JSON.parse(
      await fs.readFile(harness.paths.sessionFile(harness.session.id), 'utf8')
    ) as SessionDetail
    expect(persisted.timeline.length).toBe(harness.session.timeline.length)
    expect(persisted.history.length).toBe(harness.session.history.length)

    expect(
      harness.events.some((event) => event.type === 'stream' && event.delta.includes('hello'))
    ).toBe(true)
    expect(
      harness.events.some((event) => event.type === 'run:state' && event.running === false)
    ).toBe(true)
  })

  it('asks for approval, writes a file, records a checkpoint, and reverts it', async () => {
    const harness = await createHarness({
      turns: (_request, call) =>
        call === 0
          ? [
              textItem('Writing the note.'),
              toolCall('call_write', 'write_file', {
                path: 'notes.txt',
                content: 'alpha\n'
              }),
              { type: 'done', reason: 'tool_calls' }
            ]
          : [textItem('Done writing.'), { type: 'done', reason: 'stop' }]
    })

    const running = harness.runtime.send({
      sessionId: harness.session.id,
      text: 'Write notes.txt'
    })
    const approvalEvent = await waitFor(
      harness.events,
      (event) =>
        event.type === 'timeline:add' &&
        event.item.kind === 'approval' &&
        event.item.status === 'pending'
    )
    const approval = (approvalEvent as Extract<AppEvent, { type: 'timeline:add' }>)
      .item as ApprovalCardItem
    expect(approval.toolName).toBe('write_file')

    await harness.runtime.respondApproval(harness.session.id, approval.approvalId, {
      type: 'allow'
    })
    await running

    expect(await fs.readFile(path.join(harness.workspace, 'notes.txt'), 'utf8')).toBe('alpha\n')
    expect(harness.session.changes).toHaveLength(1)
    expect(harness.session.changes[0].path).toBe('notes.txt')
    expect(harness.session.changes[0].kind).toBe('create')

    const tool = harness.session.timeline.find((item): item is ToolItem => item.kind === 'tool')
    expect(tool?.status).toBe('success')
    const approvalCard = harness.session.timeline.find(
      (item): item is ApprovalCardItem => item.kind === 'approval'
    )
    expect(approvalCard?.status).toBe('allowed')

    const reverted = await harness.runtime.revertTurn(
      harness.session.id,
      harness.session.changes[0].turnId
    )
    expect(reverted).toBe(1)
    await expect(fs.access(path.join(harness.workspace, 'notes.txt'))).rejects.toThrow()
    expect(harness.session.changes[0].reverted).toBe(true)
  })

  it('blocks writes in plan mode', async () => {
    const harness = await createHarness({
      mode: 'plan',
      turns: (_request, call) =>
        call === 0
          ? [
              textItem('I will write the file.'),
              toolCall('call_write', 'write_file', {
                path: 'blocked.txt',
                content: 'nope\n'
              }),
              { type: 'done', reason: 'tool_calls' }
            ]
          : [textItem('Plan only; nothing was written.'), { type: 'done', reason: 'stop' }]
    })

    await harness.runtime.send({ sessionId: harness.session.id, text: 'Write a file' })

    await expect(fs.access(path.join(harness.workspace, 'blocked.txt'))).rejects.toThrow()
    expect(harness.session.changes).toHaveLength(0)
    const tool = harness.session.timeline.find((item): item is ToolItem => item.kind === 'tool')
    expect(tool?.status).toBe('denied')
    expect(tool?.output).toContain('计划模式为只读')
    expect(
      harness.session.timeline.some((item: TimelineItem) => item.kind === 'approval')
    ).toBe(false)
    const assistants = harness.session.timeline.filter(
      (item): item is AssistantMessageItem =>
        item.kind === 'message' && item.role === 'assistant'
    )
    expect(assistants.at(-1)?.content).toContain('Plan only')
  })

  it('delegates to a subagent with isolated context', async () => {
    const harness = await createHarness({
      turns: (_request, call) =>
        call === 0
          ? [
              textItem('Delegating the exploration.'),
              toolCall('call_task', 'task', {
                description: 'Explore the auth module',
                prompt: 'Find the auth module and report the relevant file.',
                agent_type: 'explore'
              }),
              { type: 'done', reason: 'tool_calls' }
            ]
          : call === 1
            ? [textItem('Found auth/session.ts.'), { type: 'done', reason: 'stop' }]
            : [textItem('The subagent found auth/session.ts.'), { type: 'done', reason: 'stop' }]
    })

    await harness.runtime.send({ sessionId: harness.session.id, text: 'Explore auth' })

    expect(harness.adapter.calls).toBe(3)
    const card = harness.session.timeline.find((item) => item.kind === 'agent')
    expect(card?.kind).toBe('agent')
    if (card?.kind === 'agent') {
      expect(card.status).toBe('done')
      expect(card.summary).toContain('Found auth/session.ts.')
    }

    const nested = harness.session.timeline.filter((item) => item.agentId)
    expect(nested.some((item) => item.kind === 'message' && item.content.includes('Found'))).toBe(
      true
    )

    const toolMessage = harness.session.history.find((message) => message.role === 'tool')
    expect(toolMessage?.content).toContain('子代理（explore）已完成')
    expect(toolMessage?.content).toContain('Found auth/session.ts.')

    const mainAssistants = harness.session.history.filter(
      (message) => message.role === 'assistant'
    )
    expect(mainAssistants).toHaveLength(2)
    expect(mainAssistants.at(-1)?.content).toContain('The subagent found')
  })

  it('stops a run that is waiting for approval', async () => {
    const harness = await createHarness({
      turns: (_request, call) =>
        call === 0
          ? [
              toolCall('call_write', 'write_file', {
                path: 'cancelled.txt',
                content: 'no\n'
              }),
              { type: 'done', reason: 'tool_calls' }
            ]
          : [textItem('Should not run.'), { type: 'done', reason: 'stop' }]
    })

    const running = harness.runtime.send({
      sessionId: harness.session.id,
      text: 'Write a file'
    })
    await waitFor(
      harness.events,
      (event) =>
        event.type === 'timeline:add' &&
        event.item.kind === 'approval' &&
        event.item.status === 'pending'
    )
    await harness.runtime.stop(harness.session.id)
    await running
    await sleep(20)

    await expect(fs.access(path.join(harness.workspace, 'cancelled.txt'))).rejects.toThrow()
    const tool = harness.session.timeline.find((item): item is ToolItem => item.kind === 'tool')
    expect(tool?.status).toBe('denied')
    expect(harness.session.status).toBe('idle')
    expect(
      harness.session.timeline.some(
        (item) => item.kind === 'notice' && item.title === '运行已停止'
      )
    ).toBe(true)
  })
})
