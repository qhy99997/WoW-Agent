import { z } from 'zod'
import type { TodoItem } from '@shared/types'
import { toolError, type ToolDefinition } from './types'

const todoSchema = z.object({
  todos: z
    .array(
      z.object({
        content: z.string().min(1).max(240),
        status: z.enum(['pending', 'in_progress', 'completed']),
        priority: z.enum(['high', 'medium', 'low']).optional()
      })
    )
    .min(1)
    .max(20)
})

const todoTool: ToolDefinition = {
  name: 'todo_write',
  label: '更新计划',
  description:
    'Create or update the visible task plan. Use for multi-step work; keep exactly one item in_progress.',
  risk: 'read',
  presentation: 'todo',
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] }
          },
          required: ['content', 'status']
        }
      }
    },
    required: ['todos']
  },
  schema: todoSchema,
  async run(input, context) {
    const args = todoSchema.parse(input)
    const todos: TodoItem[] = args.todos.map((todo, index) => ({
      id: `todo-${index + 1}`,
      content: todo.content,
      status: todo.status,
      priority: todo.priority ?? 'medium'
    }))
    context.updateTodos(todos)
    const done = todos.filter((todo) => todo.status === 'completed').length
    const active = todos.find((todo) => todo.status === 'in_progress')
    return {
      content: `计划已更新：${done}/${todos.length} 已完成${active ? `；当前：${active.content}` : ''}。`,
      title: '计划已更新',
      detail: { preview: todos.map((todo) => `[${todo.status}] ${todo.content}`).join('\n') }
    }
  }
}

const exitPlanSchema = z.object({
  plan: z.string().min(20).max(30_000)
})

const exitPlanTool: ToolDefinition = {
  name: 'exit_plan_mode',
  label: '提交计划',
  description:
    'Present a finished implementation plan and leave Plan mode. The user must approve the plan.',
  risk: 'read',
  alwaysApprove: true,
  parameters: {
    type: 'object',
    properties: {
      plan: { type: 'string', description: 'Complete plan with steps, files, and risks' }
    },
    required: ['plan']
  },
  schema: exitPlanSchema,
  async run(input, context) {
    const args = exitPlanSchema.parse(input)
    if (context.mode !== 'plan') {
      return toolError('当前不在计划模式。只应在规划时调用此工具。')
    }
    context.session.plan = args.plan
    context.session.permissionMode = 'ask'
    context.touchSession()
    return {
      content: `计划已批准并保存。已切换到询问模式，可以开始实施。\n\n${args.plan}`,
      title: '计划已批准',
      detail: { preview: args.plan.slice(0, 4000) }
    }
  }
}

export const planTools: ToolDefinition[] = [todoTool, exitPlanTool]
