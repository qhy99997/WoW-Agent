import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { SessionDetail } from '@shared/types'
import { exists } from '../util/fsx'
import { resolveShell } from './tasks'

export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'Stop'

interface HookEntry {
  matcher?: string
  command: string
  timeout?: number
}

export interface HookOutcome {
  blocked: boolean
  reason?: string
  output?: string
}

interface HookPayload {
  event: HookEvent
  sessionId: string
  workspace: string
  toolName?: string
  toolInput?: unknown
  toolOutput?: string
  prompt?: string
  error?: string
}

/**
 * Workspace hooks, configured in .wow/hooks.json. Hooks are shell commands
 * that receive a JSON payload on stdin. Exit code 2 blocks PreToolUse.
 */
export class HookService {
  constructor(private readonly enabled: boolean) {}

  async fire(
    workspace: string,
    event: HookEvent,
    payload: Omit<HookPayload, 'event' | 'workspace'>
  ): Promise<HookOutcome> {
    const fullPayload: HookPayload = { ...payload, event, workspace }
    if (!this.enabled) return { blocked: false }
    const file = path.join(workspace, '.wow', 'hooks.json')
    if (!(await exists(file))) return { blocked: false }

    let config: Partial<Record<HookEvent, HookEntry[]>>
    try {
      config = JSON.parse(await fs.readFile(file, 'utf8')) as Partial<
        Record<HookEvent, HookEntry[]>
      >
    } catch {
      return { blocked: false, output: 'hooks.json could not be parsed; hooks were skipped.' }
    }

    const entries = Array.isArray(config[event]) ? config[event] : []
    if (!entries?.length) return { blocked: false }

    const outputs: string[] = []
    for (const entry of entries) {
      if (!entry?.command || typeof entry.command !== 'string') continue
      if (entry.matcher && payload.toolName) {
        try {
          if (!new RegExp(entry.matcher).test(payload.toolName)) continue
        } catch {
          // Invalid matcher: run the hook rather than silently skipping it.
        }
      }
      const result = await this.runCommand(
        workspace,
        entry.command,
        Math.min(Math.max(entry.timeout ?? 15, 1), 120),
        fullPayload
      )
      if (result.output) outputs.push(result.output)
      if (event === 'PreToolUse' && result.code === 2) {
        return {
          blocked: true,
          reason: result.output || result.stderr || 'Blocked by a PreToolUse hook.',
          output: outputs.join('\n').slice(0, 8000)
        }
      }
      if (result.code !== 0 && result.stderr) {
        outputs.push(`[hook exit ${result.code}] ${result.stderr}`)
      }
    }
    return { blocked: false, output: outputs.join('\n').slice(0, 8000) || undefined }
  }

  private runCommand(
    workspace: string,
    command: string,
    timeoutSeconds: number,
    payload: HookPayload
  ): Promise<{ code: number; output: string; stderr: string }> {
    return new Promise((resolve) => {
      const shell = resolveShell()
      const child = spawn(shell.path, shell.args(command), {
        cwd: workspace,
        windowsHide: true,
        env: {
          ...process.env,
          WOW_EVENT: payload.event,
          WOW_WORKSPACE: workspace,
          WOW_SESSION_ID: payload.sessionId,
          WOW_TOOL_NAME: payload.toolName ?? '',
          WOW_AGENT: '1'
        },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      let stdout = ''
      let stderr = ''
      let done = false
      const finish = (code: number): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        resolve({ code, output: stdout.slice(0, 8000), stderr: stderr.slice(0, 4000) })
      }
      const timer = setTimeout(() => {
        stderr += `\n[hook timed out after ${timeoutSeconds}s]`
        if (process.platform === 'win32') {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore'
          })
        } else {
          child.kill('SIGKILL')
        }
        finish(124)
      }, timeoutSeconds * 1000)

      child.stdout.on('data', (data: Buffer) => {
        stdout += data.toString('utf8')
        if (stdout.length > 16_000) stdout = stdout.slice(-16_000)
      })
      child.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf8')
        if (stderr.length > 8000) stderr = stderr.slice(-8000)
      })
      child.on('error', (error) => {
        stderr += `\n${error.message}`
        finish(1)
      })
      child.on('close', (code) => finish(code ?? 1))
      try {
        child.stdin.write(JSON.stringify(payload))
        child.stdin.end()
      } catch {
        // The hook may not read stdin.
      }
    })
  }
}

export function hookSessionContext(session: SessionDetail): {
  sessionId: string
  workspace: string
} {
  return { sessionId: session.id, workspace: session.workspace }
}
