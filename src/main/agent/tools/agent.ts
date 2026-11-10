import { z } from 'zod'
import { toolError, type AgentType, type ToolDefinition } from './types'

const agentSchema = z.object({
  description: z.string().min(3).max(200),
  prompt: z.string().min(10).max(40_000),
  agent_type: z.enum(['explore', 'plan', 'coder']).optional()
})

const agentTool: ToolDefinition = {
  name: 'task',
  label: '委派任务',
  description:
    'Delegate a self-contained subtask to a subagent with its own context. explore and plan are read-only; coder can edit files. The subagent returns only its final answer.',
  risk: 'agent',
  presentation: 'agent',
  parameters: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Short label shown to the user' },
      prompt: {
        type: 'string',
        description: 'Complete, self-contained instructions; the subagent cannot see this conversation'
      },
      agent_type: { type: 'string', enum: ['explore', 'plan', 'coder'] }
    },
    required: ['description', 'prompt']
  },
  schema: agentSchema,
  async run(input, context) {
    const args = agentSchema.parse(input)
    if (context.depth > 0) {
      return toolError('子代理不能再继续委派。')
    }
    const agentType: AgentType = args.agent_type ?? 'coder'
    try {
      const result = await context.spawnAgent({
        description: args.description,
        prompt: args.prompt,
        agentType
      })
      return {
        content: `子代理（${agentType}）已完成：\n\n${result || '（无输出）'}`,
        title: `${args.description}`,
        detail: { preview: result.slice(0, 4000) }
      }
    } catch (error) {
      return toolError(
        `子代理失败：${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}

const askSchema = z.object({
  questions: z
    .array(
      z.object({
        header: z.string().min(1).max(24),
        question: z.string().min(3).max(500),
        options: z
          .array(
            z.object({
              label: z.string().min(1).max(80),
              description: z.string().max(240).optional()
            })
          )
          .min(2)
          .max(4),
        multiSelect: z.boolean().optional()
      })
    )
    .min(1)
    .max(4)
})

const askTool: ToolDefinition = {
  name: 'ask_user',
  label: '询问你',
  description:
    'Ask the user one to four structured questions with options. Use when a decision blocks progress; do not use for trivial confirmation.',
  risk: 'read',
  presentation: 'question',
  parameters: {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            header: { type: 'string', description: 'Short label, max 24 chars' },
            question: { type: 'string' },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  label: { type: 'string' },
                  description: { type: 'string' }
                },
                required: ['label']
              }
            },
            multiSelect: { type: 'boolean' }
          },
          required: ['header', 'question', 'options']
        }
      }
    },
    required: ['questions']
  },
  schema: askSchema,
  async run(input, context) {
    const args = askSchema.parse(input)
    const questions = args.questions.map((question, index) => ({
      id: `q${index + 1}`,
      header: question.header,
      question: question.question,
      options: question.options,
      multiSelect: question.multiSelect
    }))
    const answers = await context.askUser(context.toolCallId, questions)
    const body = questions
      .map((question) => {
        const selected = answers[question.id] ?? []
        return `${question.question}\n→ ${selected.length ? selected.join(', ') : '（已跳过）'}`
      })
      .join('\n\n')
    return {
      content: `用户已回答：\n\n${body}`,
      title: '用户已回答'
    }
  }
}

export const agentTools: ToolDefinition[] = [agentTool, askTool]
