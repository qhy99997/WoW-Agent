import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  AppSettings,
  CreateSessionInput,
  FileNode,
  FilePreview,
  LibraryItem,
  ModelRef,
  PermissionMode,
  ProviderPatch,
  SettingsPatch
} from '@shared/types'
import { IPC } from '@shared/ipc'
import type { AppPaths } from './services/paths'
import type { SettingsService } from './services/settings'
import type { SessionStore } from './services/sessions'
import type { LibraryService } from './services/library'
import type { SkillService } from './services/skills'
import type { TaskManager } from './agent/tasks'
import type { AgentRuntime } from './agent/runtime'
import { createProvider } from './agent/providers'
import { isProbablyText } from '@shared/utils'
import { readCapped, exists } from './util/fsx'
import { broadcast } from './window'

const execFileAsync = promisify(execFile)

export interface IpcDeps {
  paths: AppPaths
  settings: SettingsService
  sessions: SessionStore
  library: LibraryService
  skills: SkillService
  tasks: TaskManager
  runtime: AgentRuntime
}

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.avif'])
const TEXT_EXT = new Set([
  '.md',
  '.mdx',
  '.txt',
  '.json',
  '.jsonc',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.scss',
  '.html',
  '.htm',
  '.xml',
  '.yml',
  '.yaml',
  '.toml',
  '.ini',
  '.env',
  '.sh',
  '.bash',
  '.ps1',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cs',
  '.sql',
  '.csv',
  '.tsv',
  '.log',
  '.svg'
])

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.ts': 'text/typescript',
  '.csv': 'text/csv',
  '.txt': 'text/plain'
}

const LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.json': 'json',
  '.md': 'markdown',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.htm': 'html',
  '.xml': 'xml',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'ini',
  '.ini': 'ini',
  '.sh': 'bash',
  '.bash': 'bash',
  '.ps1': 'powershell',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.sql': 'sql',
  '.csv': 'plaintext',
  '.svg': 'xml'
}

function mimeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${name} 必须是非空字符串。`)
  return value
}

function allowedRoots(deps: IpcDeps): string[] {
  const settings = deps.settings.get()
  const roots = new Set<string>()
  roots.add(app.getPath('home'))
  if (settings.defaultWorkspace) roots.add(settings.defaultWorkspace)
  for (const workspace of settings.recentWorkspaces) roots.add(workspace)
  for (const session of deps.sessions.list()) roots.add(session.workspace)
  return [...roots].map((root) => path.resolve(root))
}

async function ensureAllowed(deps: IpcDeps, input: string): Promise<string> {
  const candidate = path.resolve(input)
  let real = candidate
  try {
    real = await fs.realpath(candidate)
  } catch {
    // Keep the resolved path for non-existent targets.
  }
  const roots = allowedRoots(deps)
  const ok = roots.some((root) => {
    const rel = path.relative(root, real)
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
  })
  if (!ok) throw new Error('该路径超出了此应用可读取的工作区范围。')
  return real
}

async function buildTree(root: string, maxDepth = 4): Promise<FileNode[]> {
  const counter = { count: 0 }
  const skip = new Set(['node_modules', '.git', 'out', 'dist', 'release', '.next', '.cache', 'coverage'])
  const walk = async (dir: string, depth: number): Promise<FileNode[]> => {
    if (counter.count > 1500) return []
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    entries.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    const nodes: FileNode[] = []
    for (const entry of entries) {
      if (counter.count > 1500 || nodes.length >= 250) break
      if (skip.has(entry.name)) continue
      if (entry.isSymbolicLink()) continue
      const full = path.join(dir, entry.name)
      counter.count += 1
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: full,
          type: 'dir',
          children: depth < maxDepth ? await walk(full, depth + 1) : undefined
        })
      } else {
        const info = await fs.stat(full).catch(() => null)
        nodes.push({
          name: entry.name,
          path: full,
          type: 'file',
          size: info?.size,
          modifiedAt: info?.mtimeMs
        })
      }
    }
    return nodes
  }
  return walk(root, 0)
}

async function previewFile(deps: IpcDeps, input: string): Promise<FilePreview> {
  const file = await ensureAllowed(deps, input)
  const stat = await fs.stat(file)
  if (!stat.isFile()) throw new Error('不是文件。')
  const ext = path.extname(file).toLowerCase()
  const name = path.basename(file)
  const base = {
    path: file,
    name,
    size: stat.size,
    modifiedAt: stat.mtimeMs
  }

  if (IMAGE_EXT.has(ext) && stat.size <= 12_000_000) {
    const buffer = await fs.readFile(file)
    return {
      ...base,
      kind: 'image',
      content: `data:${mimeFor(file)};base64,${buffer.toString('base64')}`,
      language: 'image',
      truncated: false
    }
  }
  if (ext === '.pdf') {
    return { ...base, kind: 'pdf', content: '', language: 'pdf', truncated: false }
  }
  const { buffer, truncated } = await readCapped(file, 2_000_000)
  if (!isProbablyText(buffer)) {
    return { ...base, kind: 'binary', content: '', language: 'binary', truncated }
  }
  return {
    ...base,
    kind: ext === '.md' || ext === '.mdx' ? 'markdown' : ext === '.html' || ext === '.htm' ? 'html' : 'text',
    content: buffer.toString('utf8'),
    language: LANGUAGE[ext] ?? 'plaintext',
    truncated
  }
}

async function gitChanges(root: string) {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1'], {
      cwd: root,
      timeout: 6000,
      windowsHide: true
    })
    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        const status = line.slice(0, 2)
        const raw = line.slice(3).trim()
        const file = raw.includes(' -> ') ? raw.split(' -> ').pop()! : raw
        return {
          id: `git-${index}-${file}`,
          path: file,
          kind: (status.includes('?') || status.includes('A')
            ? 'create'
            : status.includes('D')
              ? 'delete'
              : 'modify') as 'create' | 'modify' | 'delete',
          additions: 0,
          deletions: 0
        }
      })
  } catch {
    return []
  }
}

export function registerIpc(deps: IpcDeps): void {
  const handle = (channel: string, fn: (...args: never[]) => unknown): void => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        return await (fn as (...values: unknown[]) => unknown)(...args)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`[ipc] ${channel}:`, message)
        throw new Error(message)
      }
    })
  }

  /* App ------------------------------------------------------------ */
  handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node ?? '',
    platform: process.platform,
    dataDir: deps.paths.root
  }))
  handle(IPC.appOpenExternal, async (url: unknown) => {
    const value = assertString(url, 'url')
    if (!/^https?:\/\//i.test(value)) throw new Error('只能打开 http(s) 链接。')
    await shell.openExternal(value)
  })
  handle(IPC.appShowItem, async (target: unknown) => {
    const file = await ensureAllowed(deps, assertString(target, 'path'))
    shell.showItemInFolder(file)
  })
  handle(IPC.appOpenPath, async (target: unknown) => {
    const file = await ensureAllowed(deps, assertString(target, 'path'))
    return shell.openPath(file)
  })
  handle(IPC.appPickDirectory, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
  handle(IPC.appPickFiles, async () => {
    const win = BrowserWindow.getFocusedWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })
      : await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
    if (result.canceled) return []
    const files = []
    for (const file of result.filePaths.slice(0, 8)) {
      const stat = await fs.stat(file).catch(() => null)
      if (!stat?.isFile()) continue
      const ext = path.extname(file).toLowerCase()
      const kind: 'image' | 'text' | 'file' = IMAGE_EXT.has(ext)
        ? 'image'
        : TEXT_EXT.has(ext)
          ? 'text'
          : 'file'
      const entry: {
        name: string
        path: string
        size: number
        mime: string
        kind: 'image' | 'text' | 'file'
        content?: string
        dataUrl?: string
      } = {
        name: path.basename(file),
        path: file,
        size: stat.size,
        mime: mimeFor(file),
        kind
      }
      if (kind === 'image' && stat.size <= 10_000_000) {
        const buffer = await fs.readFile(file)
        entry.dataUrl = `data:${mimeFor(file)};base64,${buffer.toString('base64')}`
      } else if (kind === 'text' && stat.size <= 300_000) {
        entry.content = await fs.readFile(file, 'utf8')
      }
      files.push(entry)
    }
    return files
  })

  ipcMain.on(IPC.appMinimize, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })
  ipcMain.on(IPC.appToggleMaximize, (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.on(IPC.appClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  /* Settings ------------------------------------------------------- */
  handle(IPC.settingsGet, () => deps.settings.get())
  handle(IPC.settingsUpdate, async (patch: unknown) => {
    const next = await deps.settings.update((patch ?? {}) as SettingsPatch)
    broadcast(IPC.event, { type: 'settings:update', settings: next })
    return next
  })
  handle(IPC.providerUpdate, async (patch: unknown) => {
    const next = await deps.settings.updateProvider((patch ?? {}) as ProviderPatch)
    broadcast(IPC.event, { type: 'settings:update', settings: next })
    return next
  })
  handle(IPC.providerRemove, async (id: unknown) => {
    const next = await deps.settings.removeProvider(assertString(id, 'provider id'))
    broadcast(IPC.event, { type: 'settings:update', settings: next })
    return next
  })
  handle(IPC.providerTest, async (id: unknown) => {
    const providerId = assertString(id, 'provider id')
    const provider = deps.settings.getProviderRaw(providerId)
    if (!provider) throw new Error('找不到供应商。')
    const adapter = createProvider(provider, deps.settings.getApiKey(providerId))
    return adapter.ping()
  })

  /* Sessions ------------------------------------------------------- */
  handle(IPC.sessionsList, () => deps.sessions.list())
  handle(IPC.sessionsCreate, async (input: unknown) => {
    const value = (input ?? {}) as CreateSessionInput
    const settings = deps.settings.get()
    const workspace =
      value.workspace || settings.defaultWorkspace || app.getPath('documents')
    await fs.mkdir(workspace, { recursive: true })
    const session = await deps.sessions.create(
      { ...value, workspace },
      {
        model: settings.defaultModel,
        permissionMode: settings.defaultPermissionMode,
        workspace
      }
    )
    deps.settings.rememberWorkspace(workspace)
    await deps.settings.flush()
    return session
  })
  handle(IPC.sessionsGet, (id: unknown) => deps.sessions.getOrThrow(assertString(id, 'session id')))
  handle(IPC.sessionsRename, async (id: unknown, title: unknown) => {
    const summary = await deps.sessions.rename(
      assertString(id, 'session id'),
      assertString(title, 'title')
    )
    broadcast(IPC.event, { type: 'session:update', session: summary })
    return summary
  })
  handle(IPC.sessionsRemove, async (id: unknown) => {
    const sessionId = assertString(id, 'session id')
    await deps.runtime.stop(sessionId)
    await deps.sessions.remove(sessionId)
    broadcast(IPC.event, { type: 'session:removed', sessionId })
  })
  handle(IPC.sessionsSetModel, async (id: unknown, model: unknown) => {
    const summary = await deps.sessions.setModel(
      assertString(id, 'session id'),
      model as ModelRef
    )
    broadcast(IPC.event, { type: 'session:update', session: summary })
    return summary
  })
  handle(IPC.sessionsSetMode, async (id: unknown, mode: unknown) => {
    const summary = await deps.sessions.setMode(
      assertString(id, 'session id'),
      mode as PermissionMode
    )
    broadcast(IPC.event, { type: 'session:update', session: summary })
    return summary
  })

  /* Chat ----------------------------------------------------------- */
  handle(IPC.chatSend, async (input: unknown) => {
    const value = input as Parameters<AgentRuntime['send']>[0]
    if (!value?.sessionId) throw new Error('缺少会话 ID。')
    void deps.runtime.send(value).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      broadcast(IPC.event, {
        type: 'notice',
        sessionId: value.sessionId,
        notice: { level: 'error', title: '无法启动运行', detail: message }
      })
      broadcast(IPC.event, { type: 'run:state', sessionId: value.sessionId, running: false, error: message })
    })
  })
  handle(IPC.chatStop, (id: unknown) => deps.runtime.stop(assertString(id, 'session id')))
  handle(IPC.chatApproval, async (sessionId: unknown, approvalId: unknown, decision: unknown) => {
    await deps.runtime.respondApproval(
      assertString(sessionId, 'session id'),
      assertString(approvalId, 'approval id'),
      decision as Parameters<AgentRuntime['respondApproval']>[2]
    )
  })
  handle(IPC.chatAnswer, async (sessionId: unknown, requestId: unknown, answers: unknown) => {
    await deps.runtime.answerQuestion(
      assertString(sessionId, 'session id'),
      assertString(requestId, 'request id'),
      (answers ?? {}) as Record<string, string[]>
    )
  })
  handle(IPC.chatCompact, (id: unknown) => deps.runtime.compact(assertString(id, 'session id')))
  handle(IPC.chatRevertTurn, async (id: unknown, turnId: unknown) => {
    return deps.runtime.revertTurn(assertString(id, 'session id'), assertString(turnId, 'turn id'))
  })

  /* Workspace ------------------------------------------------------ */
  handle(IPC.workspaceTree, async (root: unknown, depth: unknown) => {
    const directory = await ensureAllowed(deps, assertString(root, 'workspace'))
    const stat = await fs.stat(directory)
    if (!stat.isDirectory()) throw new Error('工作区不是目录。')
    const maxDepth = Math.min(Math.max(Number(depth) || 4, 1), 6)
    return buildTree(directory, maxDepth)
  })
  handle(IPC.workspacePreview, (file: unknown) => previewFile(deps, assertString(file, 'path')))
  handle(IPC.workspaceGitChanges, async (root: unknown) => {
    const directory = await ensureAllowed(deps, assertString(root, 'workspace'))
    return gitChanges(directory)
  })

  /* Library -------------------------------------------------------- */
  handle(IPC.libraryList, () => deps.library.list())
  handle(IPC.libraryAdd, async (input: unknown) => {
    const value = input as {
      title: string
      kind: LibraryItem['kind']
      content: string
      tags?: string[]
      sourcePath?: string
      sourceSessionId?: string
    }
    if (!value?.title || !value?.content) throw new Error('标题和内容为必填项。')
    const item = await deps.library.add(value)
    broadcast(IPC.event, { type: 'library:update', items: deps.library.list() })
    return item
  })
  handle(IPC.libraryRemove, async (id: unknown) => {
    await deps.library.remove(assertString(id, 'library id'))
    broadcast(IPC.event, { type: 'library:update', items: deps.library.list() })
  })

  /* Skills --------------------------------------------------------- */
  handle(IPC.skillsList, async (workspace: unknown) => {
    const dir = typeof workspace === 'string' && workspace ? workspace : undefined
    return deps.skills.list(dir)
  })
  handle(IPC.skillsOpen, async (target: unknown) => {
    const file = assertString(target, 'path')
    if (!(await exists(file))) throw new Error('找不到技能文件。')
    await shell.openPath(file)
  })

  /* Tasks ---------------------------------------------------------- */
  handle(IPC.tasksList, () => deps.tasks.list())
  handle(IPC.tasksStop, async (id: unknown) => {
    await deps.tasks.stop(assertString(id, 'task id'))
  })

  /* Changes -------------------------------------------------------- */
  handle(IPC.changesList, (id: unknown) => {
    const session = deps.sessions.getOrThrow(assertString(id, 'session id'))
    return session.changes
  })
}

export function broadcastSettings(settings: AppSettings): void {
  broadcast(IPC.event, { type: 'settings:update', settings })
}
