import { z } from 'zod'
import { toolError, type ToolDefinition } from './types'

const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(8).optional()
})

const knowledgeSearchTool: ToolDefinition = {
  name: 'knowledge_search',
  label: '搜索资料库',
  description:
    'Search the user’s saved knowledge library (notes, artifacts, and deposited files). Use before asking the user to repeat context.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'number', description: 'Default 5, max 8' }
    },
    required: ['query']
  },
  schema: searchSchema,
  async run(input, context) {
    const args = searchSchema.parse(input)
    const results = context.services.library.search(args.query).slice(0, args.limit ?? 5)
    if (!results.length) {
      return {
        content: `资料库中没有匹配“${args.query}”的条目。资料库可能为空。`,
        title: '资料库无匹配'
      }
    }
    const body = results
      .map(
        (item, index) =>
          `${index + 1}. ${item.title}${item.tags.length ? ` [${item.tags.join(', ')}]` : ''}\n${item.content.slice(0, 1800)}`
      )
      .join('\n\n---\n\n')
    return {
      content: `“${args.query}”的资料库结果：\n\n${body}`,
      title: `${results.length} 条资料库结果`,
      detail: { preview: body.slice(0, 4000) }
    }
  }
}

const saveSchema = z.object({
  title: z.string().min(1).max(160),
  content: z.string().min(1).max(200_000),
  tags: z.array(z.string().min(1).max(32)).max(8).optional()
})

const knowledgeSaveTool: ToolDefinition = {
  name: 'knowledge_save',
  label: '保存到资料库',
  description:
    'Save a finished note, summary, or artifact to the knowledge library so it can be reused later.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      content: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } }
    },
    required: ['title', 'content']
  },
  schema: saveSchema,
  async run(input, context) {
    const args = saveSchema.parse(input)
    const item = await context.services.library.add({
      title: args.title,
      kind: 'note',
      content: args.content,
      tags: args.tags,
      sourceSessionId: context.session.id
    })
    context.services.emit({ type: 'library:update', items: context.services.library.list() })
    return {
      content: `已将“${item.title}”保存到资料库（${item.id}）。`,
      title: '已保存到资料库'
    }
  }
}

const skillSchema = z.object({ name: z.string().min(1) })

const skillTool: ToolDefinition = {
  name: 'skill',
  label: '加载技能',
  description:
    'Load the full instructions for a registered skill. Use when the task matches a skill description.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Skill name' } },
    required: ['name']
  },
  schema: skillSchema,
  async run(input, context) {
    const args = skillSchema.parse(input)
    const skill = await context.services.skills.get(args.name, context.workspace)
    if (!skill) {
      const available = (await context.services.skills.list(context.workspace))
        .map((entry) => `${entry.name}: ${entry.description}`)
        .join('\n')
      return toolError(`未找到技能“${args.name}”。\n\n可用技能：\n${available}`)
    }
    return {
      content: `# 技能：${skill.name}\n${skill.description}\n\n${skill.body}`,
      title: `已加载技能 ${skill.name}`,
      detail: { preview: skill.body.slice(0, 4000) }
    }
  }
}

export const knowledgeTools: ToolDefinition[] = [
  knowledgeSearchTool,
  knowledgeSaveTool,
  skillTool
]
