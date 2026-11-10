/**
 * Shared domain model for WoW Agent.
 *
 * The renderer never touches the filesystem or model APIs directly. Everything
 * below crosses the typed IPC bridge, so it must stay serialisable.
 */

export type PermissionMode = 'ask' | 'auto' | 'plan'
export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentName = 'ember' | 'moss' | 'ocean'

export type ProviderKind = 'openai' | 'anthropic' | 'mock'

export interface ModelRef {
  providerId: string
  model: string
}

export interface ProviderView {
  id: string
  name: string
  kind: ProviderKind
  baseUrl: string
  models: string[]
  contextWindow: number
  apiKeySet: boolean
  enabled: boolean
  /** Extra headers, e.g. OpenRouter attribution. */
  headers: Record<string, string>
  /** True for the offline demo provider. */
  builtin?: boolean
}

export interface AppSettings {
  theme: ThemeMode
  accent: AccentName
  providers: ProviderView[]
  defaultModel: ModelRef | null
  defaultPermissionMode: PermissionMode
  defaultWorkspace: string | null
  recentWorkspaces: string[]
  maxSteps: number
  temperature: number
  /** Compact history when estimated context use exceeds this ratio. */
  compactAt: number
  sendOnEnter: boolean
  showReasoning: boolean
  hooksEnabled: boolean
  onboarded: boolean
}

export interface SettingsPatch {
  theme?: ThemeMode
  accent?: AccentName
  defaultModel?: ModelRef | null
  defaultPermissionMode?: PermissionMode
  defaultWorkspace?: string | null
  maxSteps?: number
  temperature?: number
  compactAt?: number
  sendOnEnter?: boolean
  showReasoning?: boolean
  hooksEnabled?: boolean
  onboarded?: boolean
}

export interface ProviderPatch {
  id: string
  name?: string
  kind?: ProviderKind
  baseUrl?: string
  models?: string[]
  contextWindow?: number
  enabled?: boolean
  headers?: Record<string, string>
  /** Only send when the user typed a new key. Never returned to the renderer. */
  apiKey?: string
}

/* ------------------------------------------------------------------ */
/* Conversations                                                       */
/* ------------------------------------------------------------------ */

export interface ImagePart {
  mediaType: string
  base64: string
}

/** Canonical provider-agnostic history message. */
export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: ImagePart[]
  toolCalls?: ToolCall[]
  toolCallId?: string
  name?: string
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export type TodoPriority = 'high' | 'medium' | 'low'

export interface TodoItem {
  id: string
  content: string
  status: TodoStatus
  priority: TodoPriority
}

export type RiskClass = 'read' | 'write' | 'execute' | 'network' | 'agent'

export interface Attachment {
  id: string
  name: string
  mime: string
  size: number
  kind: 'image' | 'text' | 'file'
  dataUrl?: string
  text?: string
}

export type ToolStatus =
  | 'awaiting_approval'
  | 'running'
  | 'success'
  | 'error'
  | 'denied'
  | 'cancelled'

export interface ToolDetail {
  path?: string
  diff?: string
  additions?: number
  deletions?: number
  command?: string
  cwd?: string
  exitCode?: number
  matches?: { path: string; line: number; text: string }[]
  url?: string
  preview?: string
}

interface TimelineBase {
  id: string
  createdAt: number
  /** Set when the item was produced inside a subagent. */
  agentId?: string
  agentName?: string
}

export interface UserMessageItem extends TimelineBase {
  kind: 'message'
  role: 'user'
  content: string
  attachments?: Attachment[]
}

export interface AssistantMessageItem extends TimelineBase {
  kind: 'message'
  role: 'assistant'
  content: string
  model?: string
  durationMs?: number
}

export interface ReasoningItem extends TimelineBase {
  kind: 'reasoning'
  content: string
  durationMs?: number
}

export interface ToolItem extends TimelineBase {
  kind: 'tool'
  toolCallId: string
  name: string
  title: string
  input: Record<string, unknown>
  status: ToolStatus
  output?: string
  detail?: ToolDetail
  startedAt?: number
  endedAt?: number
}

export interface TodoCardItem extends TimelineBase {
  kind: 'todo'
  todos: TodoItem[]
}

export interface NoticeItem extends TimelineBase {
  kind: 'notice'
  level: 'info' | 'success' | 'warn' | 'error'
  title: string
  detail?: string
}

export interface ChangesCardItem extends TimelineBase {
  kind: 'changes'
  turnId: string
  files: FileChangeSummary[]
}

export interface CompactionItem extends TimelineBase {
  kind: 'compaction'
  beforeTokens: number
  afterTokens: number
  summary: string
}

export type AgentRunStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface AgentCardItem extends TimelineBase {
  kind: 'agent'
  /** ID shared by every timeline item produced inside this subagent run. */
  runId: string
  agentType: string
  description: string
  status: AgentRunStatus
  summary?: string
  model?: string
  toolCount?: number
  endedAt?: number
}

export interface QuestionOption {
  label: string
  description?: string
}

export interface AgentQuestion {
  id: string
  header: string
  question: string
  options: QuestionOption[]
  multiSelect?: boolean
}

export interface QuestionCardItem extends TimelineBase {
  kind: 'question'
  requestId: string
  toolCallId: string
  questions: AgentQuestion[]
  status: 'pending' | 'answered' | 'cancelled'
  answers?: Record<string, string[]>
}

export interface ApprovalCardItem extends TimelineBase {
  kind: 'approval'
  approvalId: string
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  risk: RiskClass
  reason: string
  status: 'pending' | 'allowed' | 'denied' | 'expired'
  decision?: 'allow' | 'allow_always' | 'deny'
}

export type TimelineItem =
  | UserMessageItem
  | AssistantMessageItem
  | ReasoningItem
  | ToolItem
  | TodoCardItem
  | NoticeItem
  | ChangesCardItem
  | CompactionItem
  | AgentCardItem
  | QuestionCardItem
  | ApprovalCardItem

export interface FileChangeSummary {
  id: string
  path: string
  kind: 'create' | 'modify' | 'delete'
  additions: number
  deletions: number
}

export interface FileChange extends FileChangeSummary {
  sessionId: string
  turnId: string
  before: string
  after: string
  truncated: boolean
  createdAt: number
  reverted?: boolean
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
}

export type SessionStatus = 'idle' | 'running' | 'error'

export interface SessionSummary {
  id: string
  title: string
  workspace: string
  createdAt: number
  updatedAt: number
  model: ModelRef
  permissionMode: PermissionMode
  workflowId?: string
  status: SessionStatus
  error?: string
  preview: string
  usage: Usage
  contextTokens: number
  pinned?: boolean
}

export interface SessionDetail extends SessionSummary {
  history: AgentMessage[]
  timeline: TimelineItem[]
  todos: TodoItem[]
  plan?: string
  changes: FileChange[]
  allowedTools: string[]
  turnId: string
}

export interface CreateSessionInput {
  workspace?: string
  model?: ModelRef
  permissionMode?: PermissionMode
  workflowId?: string
  title?: string
}

export interface SendMessageInput {
  sessionId: string
  text: string
  attachments?: Attachment[]
  workflowId?: string
}

export type ApprovalDecision =
  | { type: 'allow' }
  | { type: 'allow_always' }
  | { type: 'deny'; reason?: string }

/* ------------------------------------------------------------------ */
/* Files, tasks, library, skills                                       */
/* ------------------------------------------------------------------ */

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  size?: number
  modifiedAt?: number
  children?: FileNode[]
}

export interface FilePreview {
  path: string
  name: string
  kind: 'text' | 'markdown' | 'image' | 'html' | 'pdf' | 'binary'
  content: string
  language: string
  size: number
  modifiedAt: number
  truncated: boolean
}

export type BackgroundTaskStatus = 'running' | 'done' | 'error' | 'stopped'

export interface BackgroundTask {
  id: string
  sessionId: string
  kind: 'shell' | 'agent'
  label: string
  command: string
  cwd: string
  status: BackgroundTaskStatus
  startedAt: number
  endedAt?: number
  exitCode?: number
  output: string
  outputPath?: string
}

export interface LibraryItem {
  id: string
  title: string
  kind: 'note' | 'file' | 'artifact' | 'link'
  tags: string[]
  excerpt: string
  content: string
  sourcePath?: string
  sourceSessionId?: string
  createdAt: number
  updatedAt: number
}

export interface SkillInfo {
  name: string
  description: string
  scope: 'builtin' | 'user' | 'workspace'
  path: string
  whenToUse?: string
  body: string
}

export interface Workflow {
  id: string
  name: string
  tagline: string
  description: string
  prompt: string
  systemHint?: string
  icon: 'globe' | 'code' | 'search' | 'table' | 'file-text' | 'sparkles'
  tint: string
}

/* ------------------------------------------------------------------ */
/* Runtime events                                                      */
/* ------------------------------------------------------------------ */

export interface Notice {
  level: 'info' | 'success' | 'warn' | 'error'
  title: string
  detail?: string
}

export type AppEvent =
  | { type: 'timeline:add'; sessionId: string; item: TimelineItem }
  | { type: 'timeline:update'; sessionId: string; item: TimelineItem }
  | { type: 'timeline:patch'; sessionId: string; id: string; patch: Record<string, unknown> }
  | {
      type: 'stream'
      sessionId: string
      id: string
      field: 'content' | 'reasoning'
      delta: string
    }
  | { type: 'session:update'; session: SessionSummary }
  | { type: 'session:removed'; sessionId: string }
  | { type: 'run:state'; sessionId: string; running: boolean; error?: string }
  | { type: 'tasks:update'; tasks: BackgroundTask[] }
  | { type: 'settings:update'; settings: AppSettings }
  | { type: 'library:update'; items: LibraryItem[] }
  | { type: 'notice'; sessionId?: string; notice: Notice }

export interface ProviderTestResult {
  ok: boolean
  message: string
  latencyMs?: number
  models?: string[]
}

export interface AppInfo {
  version: string
  electron: string
  chrome: string
  node: string
  platform: string
  dataDir: string
}

export interface WowApi {
  app: {
    info(): Promise<AppInfo>
    minimize(): void
    toggleMaximize(): void
    close(): void
    openExternal(url: string): Promise<void>
    showItemInFolder(path: string): void
    pickDirectory(): Promise<string | null>
    pickFiles(): Promise<
      {
        name: string
        path: string
        size: number
        mime: string
        kind: 'image' | 'text' | 'file'
        content?: string
        dataUrl?: string
      }[]
    >
    openPath(path: string): Promise<string>
  }
  settings: {
    get(): Promise<AppSettings>
    update(patch: SettingsPatch): Promise<AppSettings>
    updateProvider(patch: ProviderPatch): Promise<AppSettings>
    removeProvider(id: string): Promise<AppSettings>
    testProvider(id: string): Promise<ProviderTestResult>
  }
  sessions: {
    list(): Promise<SessionSummary[]>
    create(input?: CreateSessionInput): Promise<SessionDetail>
    get(id: string): Promise<SessionDetail>
    rename(id: string, title: string): Promise<SessionSummary>
    remove(id: string): Promise<void>
    setModel(id: string, model: ModelRef): Promise<SessionSummary>
    setMode(id: string, mode: PermissionMode): Promise<SessionSummary>
  }
  chat: {
    send(input: SendMessageInput): Promise<void>
    stop(sessionId: string): Promise<void>
    respondApproval(
      sessionId: string,
      approvalId: string,
      decision: ApprovalDecision
    ): Promise<void>
    answerQuestion(
      sessionId: string,
      requestId: string,
      answers: Record<string, string[]>
    ): Promise<void>
    compact(sessionId: string): Promise<void>
    revertTurn(sessionId: string, turnId: string): Promise<number>
  }
  workspace: {
    tree(root: string, depth?: number): Promise<FileNode[]>
    preview(path: string): Promise<FilePreview>
    gitChanges(root: string): Promise<FileChangeSummary[]>
  }
  library: {
    list(): Promise<LibraryItem[]>
    add(input: {
      title: string
      kind: LibraryItem['kind']
      content: string
      tags?: string[]
      sourcePath?: string
      sourceSessionId?: string
    }): Promise<LibraryItem>
    remove(id: string): Promise<void>
  }
  skills: {
    list(workspace?: string): Promise<SkillInfo[]>
    open(path: string): Promise<void>
  }
  tasks: {
    list(): Promise<BackgroundTask[]>
    stop(id: string): Promise<void>
  }
  changes: {
    list(sessionId: string): Promise<FileChange[]>
  }
  onEvent(listener: (event: AppEvent) => void): () => void
}
