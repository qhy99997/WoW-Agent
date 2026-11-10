import { promises as fs } from 'node:fs'
import { z } from 'zod'
import { formatDuration } from '@shared/utils'
import { resolveInside } from '../../util/fsx'
import { toolError, type ToolDefinition } from './types'

const bashSchema = z.object({
  command: z.string().min(1).max(20_000),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().min(1000).max(300_000).optional(),
  background: z.boolean().optional()
})

const TASK_STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  done: '已完成',
  error: '错误',
  stopped: '已停止'
}

const bashTool: ToolDefinition = {
  name: 'bash',
  label: '运行命令',
  description:
    'Run a shell command in the workspace. Git Bash is used on Windows. Foreground commands time out after 60s by default; use background for long-running servers.',
  risk: 'execute',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command' },
      cwd: { type: 'string', description: 'Workspace-relative working directory' },
      timeout_ms: { type: 'number', description: 'Foreground timeout, default 60000, max 300000' },
      background: { type: 'boolean', description: 'Return immediately with a task id' }
    },
    required: ['command']
  },
  schema: bashSchema,
  async run(input, context) {
    const args = bashSchema.parse(input)
    try {
      const cwd = await resolveInside(context.workspace, args.cwd ?? '.')
      const stat = await fs.stat(cwd)
      if (!stat.isDirectory()) return toolError('cwd 不是目录。')

      const { task } = await context.services.tasks.runShell({
        sessionId: context.session.id,
        command: args.command,
        cwd,
        timeoutMs: args.timeout_ms ?? 60_000,
        background: Boolean(args.background),
        signal: context.signal
      })

      if (args.background) {
        return {
          content: `已启动后台任务 ${task.id}。\n使用 task_output 并传入此 id 读取输出，或使用 task_stop 结束它。`,
          title: `已启动 ${task.label}`,
          detail: { command: args.command, cwd, preview: task.id }
        }
      }

      const output = task.output.trim()
      const duration = formatDuration((task.endedAt ?? Date.now()) - task.startedAt)
      const header = `$ ${args.command}\n[退出码 ${task.exitCode ?? '?'} · ${duration}]`
      const body = output.length > 30_000 ? `${output.slice(-30_000)}\n…[输出已截断]` : output
      return {
        content: `${header}\n\n${body || '（无输出）'}`,
        title: `${task.label}`,
        isError: task.status === 'error',
        detail: {
          command: args.command,
          cwd,
          exitCode: task.exitCode,
          preview: body.slice(0, 4000)
        }
      }
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error))
    }
  }
}

const taskListSchema = z.object({})

const taskListTool: ToolDefinition = {
  name: 'task_list',
  label: '列出后台任务',
  description: 'List shell and agent tasks for this session.',
  risk: 'read',
  parameters: { type: 'object', properties: {} },
  schema: taskListSchema,
  async run(_input, context) {
    const tasks = context.services.tasks.listForSession(context.session.id)
    if (!tasks.length) return { content: '没有后台任务。', title: '没有任务' }
    const body = tasks
      .map(
        (task) =>
          `${task.id}  ${TASK_STATUS_LABEL[task.status] ?? task.status}  ${task.label}${task.exitCode !== undefined ? `  （退出码 ${task.exitCode}）` : ''}`
      )
      .join('\n')
    return { content: body, title: `${tasks.length} 个任务` }
  }
}

const taskOutputSchema = z.object({
  task_id: z.string().min(1),
  wait_ms: z.number().int().min(0).max(60_000).optional()
})

const taskOutputTool: ToolDefinition = {
  name: 'task_output',
  label: '读取任务输出',
  description: 'Read a task status and output. Optionally wait up to 60 seconds for completion.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      task_id: { type: 'string' },
      wait_ms: { type: 'number', description: 'Wait up to 60000ms for the task to finish' }
    },
    required: ['task_id']
  },
  schema: taskOutputSchema,
  async run(input, context) {
    const args = taskOutputSchema.parse(input)
    let task = context.services.tasks.get(args.task_id)
    if (!task) return toolError(`找不到任务：${args.task_id}`)
    if (task.status === 'running' && args.wait_ms) {
      task = (await context.services.tasks.waitFor(args.task_id, args.wait_ms)) ?? task
    }
    const output = task.output.trim()
    const body = output.length > 30_000 ? `${output.slice(-30_000)}\n…[已截断]` : output
    const status = TASK_STATUS_LABEL[task.status] ?? task.status
    return {
      content: `任务 ${task.id} · ${status}${task.exitCode !== undefined ? ` · 退出码 ${task.exitCode}` : ''}\n\n${body || '（暂无输出）'}`,
      title: `任务 ${status}`,
      detail: { command: task.command, preview: body.slice(0, 4000) }
    }
  }
}

const taskStopSchema = z.object({ task_id: z.string().min(1) })

const taskStopTool: ToolDefinition = {
  name: 'task_stop',
  label: '停止任务',
  description: 'Stop a running background task and its child processes.',
  risk: 'execute',
  parameters: {
    type: 'object',
    properties: { task_id: { type: 'string' } },
    required: ['task_id']
  },
  schema: taskStopSchema,
  async run(input, context) {
    const args = taskStopSchema.parse(input)
    const task = context.services.tasks.get(args.task_id)
    if (!task) return toolError(`找不到任务：${args.task_id}`)
    const stopped = await context.services.tasks.stop(args.task_id)
    const status = TASK_STATUS_LABEL[task.status] ?? task.status
    return {
      content: stopped ? `已停止 ${task.id}。` : `任务 ${task.id} 未在运行（${status}）。`,
      title: stopped ? '任务已停止' : '任务已结束'
    }
  }
}

export const shellTools: ToolDefinition[] = [bashTool, taskListTool, taskOutputTool, taskStopTool]
