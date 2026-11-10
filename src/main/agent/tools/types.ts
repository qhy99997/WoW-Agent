import type { z } from 'zod'
import type {
  AgentQuestion,
  AppEvent,
  ApprovalDecision,
  FileChange,
  PermissionMode,
  RiskClass,
  SessionDetail,
  TodoItem,
  ToolDetail
} from '@shared/types'
import type { SettingsService } from '../../services/settings'
import type { LibraryService } from '../../services/library'
import type { SkillService } from '../../services/skills'
import type { TaskManager } from '../tasks'

export type AgentType = 'explore' | 'plan' | 'coder'

export interface HarnessServices {
  settings: SettingsService
  library: LibraryService
  skills: SkillService
  tasks: TaskManager
  emit: (event: AppEvent) => void
  persist: (session: SessionDetail) => Promise<void>
}

export interface ToolRunContext {
  session: SessionDetail
  workspace: string
  signal: AbortSignal
  mode: PermissionMode
  services: HarnessServices
  agent?: { id: string; name: string; type: AgentType }
  depth: number
  toolCallId: string
  readFiles: Map<string, string>
  requestApproval: (request: {
    toolCallId: string
    toolName: string
    risk: RiskClass
    input: Record<string, unknown>
    reason: string
  }) => Promise<ApprovalDecision>
  askUser: (
    toolCallId: string,
    questions: AgentQuestion[]
  ) => Promise<Record<string, string[]>>
  spawnAgent: (input: {
    description: string
    prompt: string
    agentType: AgentType
  }) => Promise<string>
  updateTodos: (todos: TodoItem[]) => void
  addChange: (change: {
    path: string
    before: string
    after: string
    kind: FileChange['kind']
  }) => Promise<FileChange>
  touchSession: () => void
  emit: (event: AppEvent) => void
}

export interface ToolResult {
  content: string
  isError?: boolean
  title?: string
  detail?: ToolDetail
  summary?: string
}

export type ToolPresentation = 'tool' | 'todo' | 'question' | 'agent'

export interface ToolDefinition {
  name: string
  label: string
  description: string
  risk: RiskClass
  parameters: Record<string, unknown>
  schema: z.ZodType
  presentation?: ToolPresentation
  alwaysApprove?: boolean
  run: (input: unknown, context: ToolRunContext) => Promise<ToolResult>
}

export function toolError(message: string): ToolResult {
  return { content: message, isError: true }
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}
