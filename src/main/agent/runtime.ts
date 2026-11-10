import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  AgentCardItem,
  AgentMessage,
  AgentQuestion,
  AppEvent,
  ApprovalCardItem,
  ApprovalDecision,
  AssistantMessageItem,
  Attachment,
  ChangesCardItem,
  CompactionItem,
  FileChange,
  ImagePart,
  NoticeItem,
  PermissionMode,
  ProviderView,
  QuestionCardItem,
  ReasoningItem,
  SendMessageInput,
  SessionDetail,
  TimelineItem,
  TodoCardItem,
  TodoItem,
  ToolCall,
  ToolItem
} from '@shared/types'
import { estimateTokens, truncate } from '@shared/utils'
import { newId, now } from '../util/ids'
import { hashContent, relativeTo, resolveInside } from '../util/fsx'
import type { SessionStore } from '../services/sessions'
import type { SettingsService } from '../services/settings'
import type { LibraryService } from '../services/library'
import type { SkillService } from '../services/skills'
import { buildDiff } from './diff'
import { compactIfNeeded, historyTokens } from './context'
import { HookService } from './hooks'
import { buildSystemPrompt } from './prompt'
import { createProvider } from './providers'
import type { ProviderAdapter, ProviderEvent } from './providers/types'
import type { TaskManager } from './tasks'
import { toProviderTools, toolByName, toolsForAgent } from './tools'
import type { AgentType, ToolDefinition, ToolRunContext } from './tools/types'

interface RuntimeDeps {
  sessions: SessionStore
  settings: SettingsService
  library: LibraryService
  skills: SkillService
  tasks: TaskManager
  /** Test seam: swap the network provider for a deterministic scripted one. */
  providerFactory?: (provider: ProviderView, apiKey?: string) => ProviderAdapter
}

interface RunState {
  abort: AbortController
  approvals: Map<string, (decision: ApprovalDecision) => void>
  questions: Map<string, (answers: Record<string, string[]>) => void>
  readFiles: Map<string, string>
}

interface Scope {
  session: SessionDetail
  run: RunState
  history: AgentMessage[]
  agent?: { id: string; name: string; type: AgentType }
  depth: number
  maxSteps: number
  readFiles: Map<string, string>
  agentCard?: AgentCardItem
}

interface ResolvedProvider {
  adapter: ProviderAdapter
  contextWindow: number
  model: string
  providerId: string
}

const MAX_TIMELINE = 3000
const MAX_CHANGES = 300
const MAX_HISTORY_TOOL_OUTPUT = 60_000
const MAX_TIMELINE_OUTPUT = 20_000

function deriveTitle(text: string): string {
  const clean = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*_>`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return truncate(clean || '新任务', 64)
}

function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.length > 2000) {
      out[key] = `${value.slice(0, 2000)}…（共 ${value.length} 字符）`
    } else {
      out[key] = value
    }
  }
  return out
}

function toolTitle(definition: ToolDefinition, input: Record<string, unknown>): string {
  const target =
    input.path ??
    input.command ??
    input.pattern ??
    input.url ??
    input.task_id ??
    input.description ??
    input.query
  if (typeof target === 'string' && target.trim()) {
    return `${definition.label} · ${truncate(target.split(/\r?\n/)[0], 72)}`
  }
  return definition.label
}

function approvalReason(definition: ToolDefinition): string {
  switch (definition.risk) {
    case 'write':
      return '此工具可以创建或修改工作区中的文件。'
    case 'execute':
      return '此工具可以在你的电脑上运行命令。'
    case 'agent':
      return '此工具可以启动一个可能使用其他工具的子代理。'
    default:
      return '此工具可以访问本地或远程资源。'
  }
}

function formatValidation(error: {
  issues: { path: PropertyKey[]; message: string }[]
}): string {
  return error.issues
    .slice(0, 4)
    .map(
      (issue) =>
        `${issue.path.map((segment) => String(segment)).join('.') || 'input'}: ${issue.message}`
    )
    .join('; ')
}

export class AgentRuntime {
  private runs = new Map<string, RunState>()

  constructor(
    private readonly deps: RuntimeDeps,
    private readonly emit: (event: AppEvent) => void
  ) {}

  isRunning(sessionId: string): boolean {
    return this.runs.has(sessionId)
  }

  async send(input: SendMessageInput): Promise<void> {
    const session = this.deps.sessions.getOrThrow(input.sessionId)
    if (this.runs.has(session.id)) throw new Error('此会话正在运行中。')

    const attachments = input.attachments ?? []
    const text = input.text.trim()
    if (!text && !attachments.length) return

    if (input.workflowId !== undefined) session.workflowId = input.workflowId || undefined
    const run: RunState = {
      abort: new AbortController(),
      approvals: new Map(),
      questions: new Map(),
      readFiles: new Map()
    }
    this.runs.set(session.id, run)
    session.status = 'running'
    session.error = undefined
    session.turnId = newId('turn')
    this.emitSession(session)
    this.emit({ type: 'run:state', sessionId: session.id, running: true })

    const hooks = new HookService(this.deps.settings.get().hooksEnabled)

    try {
      if (session.history.length === 0) {
        await hooks.fire(session.workspace, 'SessionStart', {
          sessionId: session.id
        })
      }

      const promptHook = await hooks.fire(session.workspace, 'UserPromptSubmit', {
        sessionId: session.id,
        prompt: text
      })

      const { promptText, images } = this.buildUserContent(text, attachments)
      const userItem = {
        id: newId('msg'),
        kind: 'message' as const,
        role: 'user' as const,
        content: text,
        attachments: attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          mime: attachment.mime,
          size: attachment.size,
          kind: attachment.kind
        })),
        createdAt: now()
      }
      this.addTimeline(session, userItem)

      if (session.title === '新任务' && text) {
        session.title = deriveTitle(text)
      }

      session.history.push({
        role: 'user',
        content: promptText,
        images: images.length ? images : undefined
      })
      await this.persist(session)

      if (promptHook.blocked) {
        this.addNotice(session, 'warn', '提示被钩子拦截', promptHook.reason)
        await this.finish(session, run)
        return
      }
      if (promptHook.output) {
        this.addNotice(session, 'info', '钩子输出', promptHook.output)
      }

      const scope: Scope = {
        session,
        run,
        history: session.history,
        depth: 0,
        maxSteps: this.deps.settings.get().maxSteps,
        readFiles: run.readFiles
      }
      await this.runLoop(scope)

      if (run.abort.signal.aborted) {
        this.addNotice(session, 'info', '运行已停止', '本轮在完成前被停止。')
      }

      await hooks.fire(session.workspace, 'Stop', {
        sessionId: session.id
      })
      await this.finish(session, run)
    } catch (error) {
      await this.fail(session, run, error)
    } finally {
      this.runs.delete(session.id)
      for (const resolve of run.approvals.values()) resolve({ type: 'deny', reason: '运行已结束' })
      for (const resolve of run.questions.values()) resolve({})
      run.approvals.clear()
      run.questions.clear()
    }
  }

  async stop(sessionId: string): Promise<void> {
    const run = this.runs.get(sessionId)
    if (!run) return
    run.abort.abort()
    for (const resolve of run.approvals.values()) {
      resolve({ type: 'deny', reason: '用户停止了运行' })
    }
    for (const resolve of run.questions.values()) resolve({})
  }

  async respondApproval(
    sessionId: string,
    approvalId: string,
    decision: ApprovalDecision
  ): Promise<void> {
    const run = this.runs.get(sessionId)
    const resolve = run?.approvals.get(approvalId)
    if (!resolve) throw new Error('此审批请求已失效。')
    run?.approvals.delete(approvalId)
    resolve(decision)
  }

  async answerQuestion(
    sessionId: string,
    requestId: string,
    answers: Record<string, string[]>
  ): Promise<void> {
    const run = this.runs.get(sessionId)
    const resolve = run?.questions.get(requestId)
    if (!resolve) throw new Error('此问题已失效。')
    run?.questions.delete(requestId)
    resolve(answers)
  }

  async compact(sessionId: string): Promise<void> {
    const session = this.deps.sessions.getOrThrow(sessionId)
    if (this.runs.has(sessionId)) throw new Error('请先停止当前运行再压缩。')
    const resolved = this.resolveProvider(session)
    const did = await compactIfNeeded({
      session,
      provider: resolved.adapter,
      model: resolved.model,
      contextWindow: resolved.contextWindow,
      compactAt: 0.72,
      force: true,
      enabled: resolved.adapter.kind !== 'mock',
      emit: (item) => this.addTimeline(session, item),
      persist: () => this.persist(session)
    })
    if (!did) {
      this.addNotice(session, 'info', '无需压缩', '对话仍然很短。')
    }
    await this.persist(session)
  }

  async revertTurn(sessionId: string, turnId: string): Promise<number> {
    const session = this.deps.sessions.getOrThrow(sessionId)
    if (this.runs.has(sessionId)) throw new Error('请先停止当前运行再回退。')
    const changes = session.changes
      .filter((change) => change.turnId === turnId && !change.reverted)
      .reverse()
    let reverted = 0
    let skipped = 0
    for (const change of changes) {
      if (change.truncated) {
        skipped += 1
        continue
      }
      try {
        const file = await resolveInside(session.workspace, change.path)
        let current = ''
        try {
          current = await fs.readFile(file, 'utf8')
        } catch {
          current = ''
        }
        if (change.kind === 'create') {
          if (current !== change.after) {
            skipped += 1
            continue
          }
          await fs.unlink(file)
        } else {
          if (current !== change.after) {
            skipped += 1
            continue
          }
          await fs.mkdir(path.dirname(file), { recursive: true })
          await fs.writeFile(file, change.before, 'utf8')
        }
        change.reverted = true
        reverted += 1
      } catch {
        skipped += 1
      }
    }
    const card = session.timeline.find(
      (item): item is ChangesCardItem => item.kind === 'changes' && item.turnId === turnId
    )
    if (card) {
      card.files = session.changes
        .filter((change) => change.turnId === turnId && !change.reverted)
        .map((change) => ({
          id: change.id,
          path: change.path,
          kind: change.kind,
          additions: change.additions,
          deletions: change.deletions
        }))
      this.emit({ type: 'timeline:update', sessionId, item: card })
    }
    this.addNotice(
      session,
      reverted ? 'success' : 'warn',
      reverted ? `已回退 ${reverted} 个文件` : '没有可回退的内容',
      skipped ? `${skipped} 个文件因在本轮之后被修改而跳过。` : undefined
    )
    await this.persist(session)
    return reverted
  }

  /* ---------------------------------------------------------------- */
  /* Agent loop                                                        */
  /* ---------------------------------------------------------------- */

  private async runLoop(scope: Scope): Promise<string> {
    const { session, run } = scope
    const settings = this.deps.settings.get()
    const skills = await this.deps.skills.list(session.workspace)
    const tools = toolsForAgent(scope.agent?.type ?? 'main')
    let finalText = ''

    for (let step = 0; step < scope.maxSteps; step += 1) {
      if (run.abort.signal.aborted) break
      const resolved = this.resolveProvider(session)
      const hooks = new HookService(settings.hooksEnabled)

      if (!scope.agent) {
        await compactIfNeeded({
          session,
          provider: resolved.adapter,
          model: resolved.model,
          contextWindow: resolved.contextWindow,
          compactAt: settings.compactAt,
          enabled: resolved.adapter.kind !== 'mock',
          emit: (item) => this.addTimeline(session, item),
          persist: () => this.persist(session)
        })
      }

      const systemPrompt = await buildSystemPrompt({
        workspace: session.workspace,
        session,
        skills,
        tools,
        agentType: scope.agent?.type,
        agentDescription: scope.agent?.name
      })
      const messages: AgentMessage[] = [
        { role: 'system', content: systemPrompt },
        ...scope.history
      ]

      let text = ''
      let reasoning = ''
      let assistantItem: AssistantMessageItem | null = null
      let reasoningItem: ReasoningItem | null = null
      const toolCalls: ToolCall[] = []
      const startedAt = Date.now()
      let finishReason: 'stop' | 'tool_calls' | 'length' | 'aborted' | 'error' = 'stop'

      try {
        for await (const event of resolved.adapter.stream({
          model: resolved.model,
          messages,
          tools: toProviderTools(tools),
          temperature: settings.temperature,
          signal: run.abort.signal
        })) {
          if (run.abort.signal.aborted) break
          if (event.type === 'text') {
            if (!assistantItem) {
              assistantItem = {
                id: newId('msg'),
                kind: 'message',
                role: 'assistant',
                content: '',
                model: resolved.model,
                createdAt: now()
              }
              this.addTimeline(scope, assistantItem)
            }
            text += event.delta
            this.emit({
              type: 'stream',
              sessionId: session.id,
              id: assistantItem.id,
              field: 'content',
              delta: event.delta
            })
          } else if (event.type === 'reasoning') {
            if (!reasoningItem) {
              reasoningItem = {
                id: newId('think'),
                kind: 'reasoning',
                content: '',
                createdAt: now()
              }
              this.addTimeline(scope, reasoningItem)
            }
            reasoning += event.delta
            this.emit({
              type: 'stream',
              sessionId: session.id,
              id: reasoningItem.id,
              field: 'reasoning',
              delta: event.delta
            })
          } else if (event.type === 'tool_call') {
            toolCalls.push(event.call)
          } else if (event.type === 'usage') {
            if (event.inputTokens) session.usage.inputTokens += event.inputTokens
            if (event.outputTokens) session.usage.outputTokens += event.outputTokens
            if (event.cachedTokens) session.usage.cachedTokens += event.cachedTokens
            if (!scope.agent && event.inputTokens) session.contextTokens = event.inputTokens
          } else if (event.type === 'done') {
            finishReason = event.reason
            if (event.error) {
              this.addNotice(session, 'error', '模型错误', event.error)
            }
          }
        }
      } catch (error) {
        if (!run.abort.signal.aborted) throw error
      }

      if (assistantItem) {
        assistantItem.content = text
        assistantItem.durationMs = Date.now() - startedAt
        this.emit({ type: 'timeline:update', sessionId: session.id, item: assistantItem })
      }
      if (reasoningItem) {
        reasoningItem.content = reasoning
        reasoningItem.durationMs = Date.now() - startedAt
        this.emit({ type: 'timeline:update', sessionId: session.id, item: reasoningItem })
      }

      if (finishReason === 'length') {
        this.addNotice(
          session,
          'warn',
          '响应达到输出上限',
          '请让模型继续，或把任务拆分成更小的步骤。'
        )
      }

      if (run.abort.signal.aborted) {
        if (text) {
          scope.history.push({ role: 'assistant', content: text })
        }
        finalText = text
        break
      }

      if (!text && !toolCalls.length) {
        this.addNotice(
          session,
          'warn',
          '空响应',
          '模型没有返回文本，也没有调用工具。'
        )
        break
      }

      scope.history.push({
        role: 'assistant',
        content: text,
        toolCalls: toolCalls.length ? toolCalls : undefined
      })
      finalText = text

      if (!toolCalls.length) break

      for (const call of toolCalls) {
        if (run.abort.signal.aborted) break
        await this.executeTool(scope, call, hooks)
      }
      if (run.abort.signal.aborted) break
      await this.persist(session)

      if (step === scope.maxSteps - 1) {
        this.addNotice(
          session,
          'warn',
          '达到步数上限',
          `已在 ${scope.maxSteps} 个模型轮次后停止。发送“继续”可接着执行。`
        )
      }
    }

    if (!scope.agent) {
      session.contextTokens = Math.max(session.contextTokens, historyTokens(session.history))
    }
    return finalText
  }

  /* ---------------------------------------------------------------- */
  /* Tools                                                             */
  /* ---------------------------------------------------------------- */

  private async executeTool(scope: Scope, call: ToolCall, hooks: HookService): Promise<void> {
    const { session, run } = scope
    const definition = toolByName(call.name)
    if (!definition) {
      const item: ToolItem = {
        id: newId('tool'),
        kind: 'tool',
        toolCallId: call.id,
        name: call.name,
        title: `未知工具 · ${call.name}`,
        input: {},
        status: 'error',
        output: `模型调用了未知工具：${call.name}`,
        createdAt: now(),
        endedAt: now()
      }
      this.addTimeline(scope, item)
      scope.history.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: item.output ?? ''
      })
      await this.persist(session)
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(call.arguments || '{}')
    } catch (error) {
      const item: ToolItem = {
        id: newId('tool'),
        kind: 'tool',
        toolCallId: call.id,
        name: call.name,
        title: toolTitle(definition, {}),
        input: {},
        status: 'error',
        output: `JSON 参数无效：${error instanceof Error ? error.message : String(error)}`,
        createdAt: now(),
        endedAt: now()
      }
      this.addTimeline(scope, item)
      scope.history.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: item.output ?? ''
      })
      await this.persist(session)
      return
    }

    const validation = definition.schema.safeParse(parsed)
    if (!validation.success) {
      const item: ToolItem = {
        id: newId('tool'),
        kind: 'tool',
        toolCallId: call.id,
        name: call.name,
        title: toolTitle(definition, {}),
        input: sanitizeInput((parsed ?? {}) as Record<string, unknown>),
        status: 'error',
        output: `参数无效：${formatValidation(validation.error)}`,
        createdAt: now(),
        endedAt: now()
      }
      this.addTimeline(scope, item)
      scope.history.push({
        role: 'tool',
        toolCallId: call.id,
        name: call.name,
        content: item.output ?? ''
      })
      await this.persist(session)
      return
    }

    const input = validation.data as Record<string, unknown>
    const displayInput = sanitizeInput(input)
    const planBlocked =
      session.permissionMode === 'plan' &&
      (definition.risk === 'write' || definition.risk === 'execute') &&
      definition.name !== 'exit_plan_mode'

    const needsApproval =
      !planBlocked &&
      (definition.alwaysApprove ||
        (session.permissionMode === 'ask' &&
          (definition.risk === 'write' || definition.risk === 'execute') &&
          !session.allowedTools.includes(definition.name)))

    let toolItem: ToolItem | null = null
    if ((definition.presentation ?? 'tool') === 'tool') {
      toolItem = {
        id: newId('tool'),
        kind: 'tool',
        toolCallId: call.id,
        name: definition.name,
        title: toolTitle(definition, input),
        input: displayInput,
        status: planBlocked ? 'denied' : needsApproval ? 'awaiting_approval' : 'running',
        startedAt: now(),
        createdAt: now()
      }
      this.addTimeline(scope, toolItem)
    }

    if (planBlocked) {
      const message =
        '已阻止：计划模式为只读。在修改文件或运行命令前，请先用 exit_plan_mode 提交计划。'
      if (toolItem) {
        toolItem.status = 'denied'
        toolItem.output = message
        toolItem.endedAt = now()
        this.emit({ type: 'timeline:update', sessionId: session.id, item: toolItem })
      }
      this.appendToolResult(scope, call, definition, message, true)
      await this.persist(session)
      return
    }

    if (needsApproval) {
      const decision = await this.waitForApproval(scope, definition, call.id, displayInput)
      if (decision.type === 'deny') {
        const message = decision.reason
          ? `用户拒绝了权限请求：${decision.reason}`
          : '用户拒绝了这个工具调用的权限。在没有新指令的情况下不要重试。'
        if (toolItem) {
          toolItem.status = 'denied'
          toolItem.output = message
          toolItem.endedAt = now()
          this.emit({ type: 'timeline:update', sessionId: session.id, item: toolItem })
        }
        this.appendToolResult(scope, call, definition, message, true)
        await this.persist(session)
        return
      }
      if (decision.type === 'allow_always' && !session.allowedTools.includes(definition.name)) {
        session.allowedTools.push(definition.name)
      }
      if (toolItem) {
        toolItem.status = 'running'
        toolItem.startedAt = now()
        this.emit({ type: 'timeline:update', sessionId: session.id, item: toolItem })
      }
    }

    if (run.abort.signal.aborted) {
      if (toolItem) {
        toolItem.status = 'cancelled'
        toolItem.endedAt = now()
        this.emit({ type: 'timeline:update', sessionId: session.id, item: toolItem })
      }
      return
    }

    const preHook = await hooks.fire(session.workspace, 'PreToolUse', {
      sessionId: session.id,
      toolName: definition.name,
      toolInput: displayInput
    })
    if (preHook.blocked) {
      const message = `被 PreToolUse 钩子拦截：${preHook.reason ?? '未给出原因'}`
      if (toolItem) {
        toolItem.status = 'denied'
        toolItem.output = message
        toolItem.endedAt = now()
        this.emit({ type: 'timeline:update', sessionId: session.id, item: toolItem })
      }
      this.appendToolResult(scope, call, definition, message, true)
      await this.persist(session)
      return
    }

    const context: ToolRunContext = {
      session,
      workspace: session.workspace,
      signal: run.abort.signal,
      mode: session.permissionMode,
      services: {
        settings: this.deps.settings,
        library: this.deps.library,
        skills: this.deps.skills,
        tasks: this.deps.tasks,
        emit: this.emit,
        persist: (target) => this.persist(target)
      },
      agent: scope.agent,
      depth: scope.depth,
      toolCallId: call.id,
      readFiles: scope.readFiles,
      requestApproval: async () => ({ type: 'allow' }),
      askUser: (toolCallId, questions) => this.askUser(scope, toolCallId, questions),
      spawnAgent: (request) => this.spawnAgent(scope, request),
      updateTodos: (todos) => this.updateTodos(scope, todos),
      addChange: (change) => this.addChange(scope, change),
      touchSession: () => this.emitSession(session),
      emit: this.emit
    }

    let result
    try {
      result = await definition.run(input, context)
    } catch (error) {
      result = {
        content: error instanceof Error ? error.message : String(error),
        isError: true
      }
    }

    if (preHook.output) {
      result = { ...result, content: `${result.content}\n\n[hook] ${preHook.output}` }
    }
    const postHook = await hooks.fire(session.workspace, 'PostToolUse', {
      sessionId: session.id,
      toolName: definition.name,
      toolInput: displayInput,
      toolOutput: result.content.slice(0, 8000)
    })
    if (postHook.output) {
      result = { ...result, content: `${result.content}\n\n[hook] ${postHook.output}` }
    }

    if (toolItem) {
      toolItem.status = result.isError ? 'error' : 'success'
      toolItem.output = truncate(result.content, MAX_TIMELINE_OUTPUT)
      toolItem.detail = result.detail
        ? {
            ...result.detail,
            diff: result.detail.diff?.slice(0, 40_000),
            preview: result.detail.preview?.slice(0, 4000)
          }
        : undefined
      if (result.title) toolItem.title = result.title
      toolItem.endedAt = now()
      this.emit({ type: 'timeline:update', sessionId: session.id, item: toolItem })
    }

    if (scope.agentCard) {
      scope.agentCard.toolCount = (scope.agentCard.toolCount ?? 0) + 1
      this.emit({ type: 'timeline:update', sessionId: session.id, item: scope.agentCard })
    }

    this.appendToolResult(scope, call, definition, result.content, Boolean(result.isError))
    this.trimSession(session)
    await this.persist(session)
  }

  private appendToolResult(
    scope: Scope,
    call: ToolCall,
    definition: ToolDefinition,
    content: string,
    isError: boolean
  ): void {
    scope.history.push({
      role: 'tool',
      toolCallId: call.id,
      name: definition.name,
      content: `${isError ? '[tool error] ' : ''}${truncate(content, MAX_HISTORY_TOOL_OUTPUT)}`
    })
  }

  private async waitForApproval(
    scope: Scope,
    definition: ToolDefinition,
    toolCallId: string,
    displayInput: Record<string, unknown>
  ): Promise<ApprovalDecision> {
    const { session, run } = scope
    const approvalId = newId('appr')
    const item: ApprovalCardItem = {
      id: newId('card'),
      kind: 'approval',
      approvalId,
      toolCallId,
      toolName: definition.name,
      input: displayInput,
      risk: definition.risk,
      reason: approvalReason(definition),
      status: 'pending',
      createdAt: now(),
      agentId: scope.agent?.id,
      agentName: scope.agent?.name
    }
    this.addTimeline(scope, item)

    return new Promise<ApprovalDecision>((resolve) => {
      let settled = false
      const finish = (decision: ApprovalDecision): void => {
        if (settled) return
        settled = true
        run.approvals.delete(approvalId)
        run.abort.signal.removeEventListener('abort', onAbort)
        item.status = decision.type === 'deny' ? 'denied' : 'allowed'
        item.decision = decision.type
        this.emit({ type: 'timeline:update', sessionId: session.id, item })
        resolve(decision)
      }
      const onAbort = (): void => finish({ type: 'deny', reason: '运行已停止' })
      run.approvals.set(approvalId, finish)
      if (run.abort.signal.aborted) {
        finish({ type: 'deny', reason: '运行已停止' })
      } else {
        run.abort.signal.addEventListener('abort', onAbort, { once: true })
      }
    })
  }

  private askUser(
    scope: Scope,
    toolCallId: string,
    questions: AgentQuestion[]
  ): Promise<Record<string, string[]>> {
    const { session, run } = scope
    const requestId = newId('question')
    const item: QuestionCardItem = {
      id: newId('card'),
      kind: 'question',
      requestId,
      toolCallId,
      questions,
      status: 'pending',
      createdAt: now(),
      agentId: scope.agent?.id,
      agentName: scope.agent?.name
    }
    this.addTimeline(scope, item)

    return new Promise<Record<string, string[]>>((resolve) => {
      let settled = false
      const finish = (answers: Record<string, string[]>): void => {
        if (settled) return
        settled = true
        run.questions.delete(requestId)
        run.abort.signal.removeEventListener('abort', onAbort)
        item.status = Object.keys(answers).length ? 'answered' : 'cancelled'
        item.answers = answers
        this.emit({ type: 'timeline:update', sessionId: session.id, item })
        resolve(answers)
      }
      const onAbort = (): void => finish({})
      run.questions.set(requestId, finish)
      if (run.abort.signal.aborted) finish({})
      else run.abort.signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  private async spawnAgent(
    parent: Scope,
    request: { description: string; prompt: string; agentType: AgentType }
  ): Promise<string> {
    const { session, run } = parent
    if (parent.depth > 0) throw new Error('子代理不能再继续委派。')
    const agentId = newId('agent')
    const card: AgentCardItem = {
      id: newId('card'),
      kind: 'agent',
      runId: agentId,
      agentType: request.agentType,
      description: request.description,
      status: 'running',
      model: session.model.model,
      createdAt: now()
    }
    this.addTimeline(parent, card)

    const child: Scope = {
      session,
      run,
      history: [{ role: 'user', content: request.prompt }],
      agent: { id: agentId, name: request.description, type: request.agentType },
      depth: parent.depth + 1,
      maxSteps: 16,
      readFiles: new Map(),
      agentCard: card
    }

    try {
      const result = await this.runLoop(child)
      card.status = 'done'
      card.summary = truncate(result || '（无结果）', 6000)
      card.endedAt = now()
      this.emit({ type: 'timeline:update', sessionId: session.id, item: card })
      await this.persist(session)
      return result
    } catch (error) {
      card.status = run.abort.signal.aborted ? 'cancelled' : 'error'
      card.summary = error instanceof Error ? error.message : String(error)
      card.endedAt = now()
      this.emit({ type: 'timeline:update', sessionId: session.id, item: card })
      await this.persist(session)
      throw error
    }
  }

  /* ---------------------------------------------------------------- */
  /* Session mutations from tools                                      */
  /* ---------------------------------------------------------------- */

  private updateTodos(scope: Scope, todos: TodoItem[]): void {
    const { session } = scope
    session.todos = todos
    const cardId = scope.agent ? `todos-${session.turnId}-${scope.agent.id}` : `todos-${session.turnId}`
    const existing = session.timeline.find(
      (item): item is TodoCardItem => item.id === cardId && item.kind === 'todo'
    )
    if (existing) {
      existing.todos = todos
      this.emit({ type: 'timeline:update', sessionId: session.id, item: existing })
    } else {
      const card: TodoCardItem = {
        id: cardId,
        kind: 'todo',
        todos,
        createdAt: now()
      }
      this.addTimeline(scope, card)
    }
    this.emitSession(session)
  }

  private async addChange(
    scope: Scope,
    change: { path: string; before: string; after: string; kind: FileChange['kind'] }
  ): Promise<FileChange> {
    const { session } = scope
    const existing = session.changes.find(
      (entry) =>
        entry.turnId === session.turnId && entry.path === change.path && !entry.reverted
    )
    const before = existing?.before ?? change.before
    const diff = buildDiff(change.path, before, change.after)
    const truncated =
      before.length > 200_000 ||
      change.after.length > 200_000 ||
      Boolean(existing?.truncated)

    if (existing) {
      existing.after = change.after.slice(0, 200_000)
      existing.additions = diff.additions
      existing.deletions = diff.deletions
      existing.truncated = truncated
      existing.kind = change.kind === 'create' && existing.kind === 'create' ? 'create' : existing.kind
    } else {
      session.changes.push({
        id: newId('change'),
        sessionId: session.id,
        turnId: session.turnId,
        path: change.path,
        kind: change.kind,
        additions: diff.additions,
        deletions: diff.deletions,
        before: before.slice(0, 200_000),
        after: change.after.slice(0, 200_000),
        truncated,
        createdAt: now()
      })
    }

    const turnChanges = session.changes.filter(
      (entry) => entry.turnId === session.turnId && !entry.reverted
    )
    const cardId = `changes-${session.turnId}`
    const summary = turnChanges.map((entry) => ({
      id: entry.id,
      path: entry.path,
      kind: entry.kind,
      additions: entry.additions,
      deletions: entry.deletions
    }))
    const card = session.timeline.find(
      (item): item is ChangesCardItem => item.id === cardId && item.kind === 'changes'
    )
    if (card) {
      card.files = summary
      this.emit({ type: 'timeline:update', sessionId: session.id, item: card })
    } else {
      this.addTimeline(scope, {
        id: cardId,
        kind: 'changes',
        turnId: session.turnId,
        files: summary,
        createdAt: now()
      })
    }
    this.trimSession(session)
    return existing ?? session.changes[session.changes.length - 1]
  }

  /* ---------------------------------------------------------------- */
  /* Helpers                                                           */
  /* ---------------------------------------------------------------- */

  private resolveProvider(session: SessionDetail): ResolvedProvider {
    const provider = this.deps.settings.getProviderRaw(session.model.providerId)
    if (!provider) {
      throw new Error(
        `模型供应商“${session.model.providerId}”已不存在。请在输入框中选择其他模型。`
      )
    }
    if (!provider.enabled) {
      throw new Error(`“${provider.name}”已禁用。请在设置 → 模型中启用它。`)
    }
    const apiKey = this.deps.settings.getApiKey(provider.id)
    return {
      adapter: this.deps.providerFactory
        ? this.deps.providerFactory(provider, apiKey)
        : createProvider(provider, apiKey),
      contextWindow: provider.contextWindow,
      model: session.model.model,
      providerId: provider.id
    }
  }

  private buildUserContent(
    text: string,
    attachments: Attachment[]
  ): { promptText: string; images: ImagePart[] } {
    const parts: string[] = [text]
    const images: ImagePart[] = []
    let budget = 80_000
    for (const attachment of attachments) {
      if (attachment.kind === 'image' && attachment.dataUrl) {
        const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(attachment.dataUrl)
        if (match && images.length < 4 && match[2].length < 8_000_000) {
          images.push({ mediaType: match[1], base64: match[2] })
        }
        parts.push(`[Image attached: ${attachment.name}]`)
        continue
      }
      if (attachment.text) {
        const content = attachment.text.slice(0, budget)
        budget -= content.length
        parts.push(
          `<attached_file name="${attachment.name}">\n${content}\n</attached_file>`
        )
        if (budget <= 0) break
      }
    }
    return { promptText: parts.filter(Boolean).join('\n\n'), images }
  }

  private addTimeline(scope: Scope | SessionDetail, item: TimelineItem): void {
    const session = 'session' in scope ? scope.session : scope
    if ('agent' in scope && scope.agent && !item.agentId) {
      item.agentId = scope.agent.id
      item.agentName = scope.agent.name
    }
    session.timeline.push(item)
    this.trimSession(session)
    this.emit({ type: 'timeline:add', sessionId: session.id, item })
  }

  private addNotice(
    session: SessionDetail,
    level: NoticeItem['level'],
    title: string,
    detail?: string
  ): void {
    const item: NoticeItem = {
      id: newId('notice'),
      kind: 'notice',
      level,
      title,
      detail,
      createdAt: now()
    }
    this.addTimeline(session, item)
  }

  private trimSession(session: SessionDetail): void {
    if (session.timeline.length > MAX_TIMELINE) {
      session.timeline.splice(0, session.timeline.length - MAX_TIMELINE)
    }
    if (session.changes.length > MAX_CHANGES) {
      session.changes.splice(0, session.changes.length - MAX_CHANGES)
    }
  }

  private emitSession(session: SessionDetail): void {
    this.emit({ type: 'session:update', session: this.deps.sessions.summary(session) })
  }

  private async persist(session: SessionDetail): Promise<void> {
    await this.deps.sessions.save(session)
    this.emitSession(session)
  }

  private async finish(session: SessionDetail, run: RunState): Promise<void> {
    session.status = 'idle'
    session.error = undefined
    if (!run.abort.signal.aborted) {
      session.contextTokens = Math.max(session.contextTokens, historyTokens(session.history))
    }
    await this.persist(session)
    this.emit({ type: 'run:state', sessionId: session.id, running: false })
  }

  private async fail(session: SessionDetail, run: RunState, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error)
    session.status = 'error'
    session.error = message
    this.addNotice(session, 'error', '运行失败', message)
    try {
      await this.persist(session)
    } catch {
      // best effort
    }
    this.emit({ type: 'run:state', sessionId: session.id, running: false, error: message })
  }
}

export type { PermissionMode }
