import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import type { BackgroundTask } from '@shared/types'
import type { AppPaths } from '../services/paths'
import { newId, now } from '../util/ids'

const OUTPUT_CAP = 200_000
const EVENT_CAP = 60_000
const MAX_TASKS = 24

export interface Shell {
  path: string
  args: (command: string) => string[]
}

export function resolveShell(): Shell {
  if (process.platform === 'win32') {
    const candidates = [
      process.env.WOW_SHELL,
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\cmd\\git.exe'
    ].filter(Boolean) as string[]
    for (const candidate of candidates) {
      if (candidate && existsSync(candidate)) {
        if (candidate.endsWith('git.exe')) {
          return { path: candidate, args: (command) => ['bash', '-lc', command] }
        }
        return { path: candidate, args: (command) => ['-lc', command] }
      }
    }
    return {
      path: 'powershell.exe',
      args: (command) => [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        command
      ]
    }
  }
  return { path: '/bin/bash', args: (command) => ['-lc', command] }
}

function killTree(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    killer.on('error', () => undefined)
  } else {
    try {
      child.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
}

function appendCapped(current: string, chunk: string): string {
  const next = current + chunk
  if (next.length <= OUTPUT_CAP) return next
  return `…[earlier output truncated]\n${next.slice(next.length - OUTPUT_CAP)}`
}

export interface RunShellOptions {
  sessionId: string
  command: string
  cwd: string
  timeoutMs: number
  background: boolean
  signal?: AbortSignal
}

export class TaskManager {
  private tasks = new Map<string, BackgroundTask>()
  private children = new Map<string, ChildProcess>()
  private stopped = new Set<string>()
  private emitTimer: NodeJS.Timeout | null = null
  private shell = resolveShell()

  constructor(
    private readonly paths: AppPaths,
    private readonly emit: (tasks: BackgroundTask[]) => void
  ) {}

  list(): BackgroundTask[] {
    return [...this.tasks.values()].sort((a, b) => b.startedAt - a.startedAt)
  }

  get(id: string): BackgroundTask | undefined {
    return this.tasks.get(id)
  }

  listForSession(sessionId: string): BackgroundTask[] {
    return this.list().filter((task) => task.sessionId === sessionId)
  }

  async runShell(options: RunShellOptions): Promise<{
    task: BackgroundTask
    timedOut: boolean
  }> {
    const id = newId('task')
    const task: BackgroundTask = {
      id,
      sessionId: options.sessionId,
      kind: 'shell',
      label: options.command.split(/\r?\n/)[0].slice(0, 90),
      command: options.command,
      cwd: options.cwd,
      status: 'running',
      startedAt: now(),
      output: ''
    }
    this.tasks.set(id, task)
    this.trim()
    this.emitNow()

    const child = spawn(this.shell.path, this.shell.args(options.command), {
      cwd: options.cwd,
      env: {
        ...process.env,
        TERM: 'dumb',
        NO_COLOR: '1',
        WOW_AGENT: '1',
        WOW_SESSION_ID: options.sessionId
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    this.children.set(id, child)

    child.stdout?.on('data', (data: Buffer) => {
      task.output = appendCapped(task.output, data.toString('utf8'))
      this.scheduleEmit()
    })
    child.stderr?.on('data', (data: Buffer) => {
      task.output = appendCapped(task.output, data.toString('utf8'))
      this.scheduleEmit()
    })

    let timedOut = false
    let cancelled = false
    const timer =
      !options.background && options.timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true
            killTree(child)
          }, options.timeoutMs)
        : null

    const onAbort = (): void => {
      if (options.background) return
      cancelled = true
      killTree(child)
    }
    if (!options.background) options.signal?.addEventListener('abort', onAbort, { once: true })

    const finished = new Promise<void>((resolve) => {
      child.on('error', (error) => {
        task.output = appendCapped(task.output, `\n[spawn error] ${error.message}\n`)
        task.status = 'error'
        task.exitCode = -1
        task.endedAt = now()
        resolve()
      })
      child.on('close', (code, signal) => {
        task.exitCode = code ?? (signal ? -1 : 0)
        const stoppedByUser = this.stopped.has(id)
        this.stopped.delete(id)
        task.status =
          timedOut || cancelled || stoppedByUser
            ? 'stopped'
            : task.exitCode === 0
              ? 'done'
              : 'error'
        if (timedOut) {
          task.output = appendCapped(
            task.output,
            `\n[command timed out after ${Math.round(options.timeoutMs / 1000)}s and was stopped]\n`
          )
        } else if (cancelled) {
          task.output = appendCapped(task.output, '\n[cancelled]\n')
        }
        task.endedAt = now()
        resolve()
      })
    })

    if (options.background) {
      finished.then(() => {
        if (timer) clearTimeout(timer)
        this.children.delete(id)
        this.finalise(task)
      })
      return { task, timedOut: false }
    }

    await finished
    if (timer) clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
    this.children.delete(id)
    this.finalise(task)
    return { task, timedOut: timedOut || cancelled }
  }

  async stop(id: string): Promise<boolean> {
    const task = this.tasks.get(id)
    const child = this.children.get(id)
    if (!task || task.status !== 'running') return false
    this.stopped.add(id)
    if (child) killTree(child)
    task.status = 'stopped'
    task.endedAt = now()
    task.output = appendCapped(task.output, '\n[stopped by user]\n')
    this.children.delete(id)
    this.finalise(task)
    return true
  }

  async waitFor(id: string, timeoutMs: number): Promise<BackgroundTask | undefined> {
    const task = this.tasks.get(id)
    if (!task) return undefined
    const deadline = now() + Math.max(0, Math.min(timeoutMs, 90_000))
    while (task.status === 'running' && now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    return task
  }

  dispose(): void {
    for (const child of this.children.values()) killTree(child)
    this.children.clear()
    if (this.emitTimer) clearTimeout(this.emitTimer)
  }

  private finalise(task: BackgroundTask): void {
    void fs
      .mkdir(this.paths.tasks, { recursive: true })
      .then(() => fs.writeFile(this.paths.taskLog(task.id), task.output, 'utf8'))
      .catch(() => undefined)
    this.emitNow()
  }

  private trim(): void {
    const sorted = this.list()
    for (const task of sorted.slice(MAX_TASKS)) {
      if (task.status === 'running') continue
      this.tasks.delete(task.id)
    }
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null
      this.emitNow()
    }, 300)
  }

  private emitNow(): void {
    const tasks = this.list().map((task) => ({
      ...task,
      output:
        task.output.length > EVENT_CAP
          ? `…[earlier output truncated]\n${task.output.slice(-EVENT_CAP)}`
          : task.output
    }))
    this.emit(tasks)
  }
}
