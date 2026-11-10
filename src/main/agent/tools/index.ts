import type { ProviderTool } from '../providers/types'
import { agentTools } from './agent'
import { fsTools } from './fs'
import { knowledgeTools } from './knowledge'
import { planTools } from './plan'
import { searchTools } from './search'
import { shellTools } from './shell'
import type { AgentType, ToolDefinition } from './types'
import { webTools } from './web'

export const ALL_TOOLS: ToolDefinition[] = [
  ...fsTools,
  ...searchTools,
  ...shellTools,
  ...webTools,
  ...planTools,
  ...agentTools,
  ...knowledgeTools
]

export const TOOL_MAP = new Map(ALL_TOOLS.map((tool) => [tool.name, tool]))

const READ_ONLY_TOOLS = new Set([
  'read_file',
  'list_dir',
  'glob',
  'grep',
  'web_fetch',
  'web_search',
  'knowledge_search',
  'skill'
])

const CODER_EXCLUDED = new Set(['task', 'ask_user', 'exit_plan_mode'])

export function toolsForAgent(agentType: AgentType | 'main'): ToolDefinition[] {
  if (agentType === 'main') return ALL_TOOLS
  if (agentType === 'explore' || agentType === 'plan') {
    return ALL_TOOLS.filter((tool) => READ_ONLY_TOOLS.has(tool.name))
  }
  return ALL_TOOLS.filter((tool) => !CODER_EXCLUDED.has(tool.name))
}

export function toProviderTools(tools: ToolDefinition[]): ProviderTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }))
}

export function toolByName(name: string): ToolDefinition | undefined {
  return TOOL_MAP.get(name)
}

export * from './types'
