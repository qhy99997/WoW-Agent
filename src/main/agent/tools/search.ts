import { promises as fs } from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'
import ignore, { type Ignore } from 'ignore'
import { z } from 'zod'
import { formatBytes, isProbablyText } from '@shared/utils'
import { exists, relativeTo, resolveInside } from '../../util/fsx'
import { toolError, type ToolDefinition } from './types'

const DEFAULT_IGNORES = [
  'node_modules/',
  '.git/',
  'out/',
  'dist/',
  'release/',
  '.wow/',
  '.next/',
  'coverage/'
]

async function loadIgnore(root: string): Promise<Ignore> {
  const ig = ignore()
  ig.add(DEFAULT_IGNORES)
  for (const file of ['.gitignore', '.ignore', '.wowignore']) {
    const full = path.join(root, file)
    if (await exists(full)) {
      try {
        ig.add(await fs.readFile(full, 'utf8'))
      } catch {
        // ignore unreadable ignore files
      }
    }
  }
  return ig
}

function isSensitive(file: string): boolean {
  const name = path.basename(file).toLowerCase()
  if (name === '.env' || name.startsWith('.env.')) return true
  if (name.endsWith('.pem') || name.endsWith('.key') || name.endsWith('.pfx')) return true
  if (['id_rsa', 'id_ed25519', 'credentials.json'].includes(name)) return true
  return false
}

const globSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional()
})

const globTool: ToolDefinition = {
  name: 'glob',
  label: '查找文件',
  description:
    'Find files by glob pattern, newest first. Respects .gitignore and skips dependency/build folders.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob such as src/**/*.ts' },
      path: { type: 'string', description: 'Directory to search from (default workspace root)' }
    },
    required: ['pattern']
  },
  schema: globSchema,
  async run(input, context) {
    const args = globSchema.parse(input)
    try {
      if (path.isAbsolute(args.pattern) || args.pattern.split(/[\\/]/).includes('..')) {
        return toolError('模式必须位于工作区内。')
      }
      const base = await resolveInside(context.workspace, args.path ?? '.')
      const stat = await fs.stat(base)
      if (stat.isFile()) {
        return {
          content: relativeTo(context.workspace, base),
          title: `找到 ${path.basename(base)}`
        }
      }
      const ig = await loadIgnore(base)
      const matches = await fg(args.pattern, {
        cwd: base,
        dot: false,
        onlyFiles: true,
        followSymbolicLinks: false,
        suppressErrors: true,
        deep: 10,
        ignore: ['**/node_modules/**', '**/.git/**', '**/out/**', '**/dist/**']
      })
      const filtered = matches
        .map((match) => match.split(path.sep).join('/'))
        .filter((match) => !ig.ignores(match))
        .slice(0, 2000)

      const withStats = await Promise.all(
        filtered.slice(0, 400).map(async (match) => {
          const info = await fs.stat(path.join(base, match)).catch(() => null)
          return { match, mtime: info?.mtimeMs ?? 0, size: info?.size ?? 0 }
        })
      )
      withStats.sort((a, b) => b.mtime - a.mtime)
      const selected = withStats.slice(0, 200)
      if (!selected.length) {
        return {
          content: `没有文件匹配 ${args.pattern}${args.path ? `（在 ${args.path} 下）` : ''}。`,
          title: '无匹配'
        }
      }
      const body = selected
        .map((entry) => `${entry.match}  (${formatBytes(entry.size)})`)
        .join('\n')
      return {
        content: `${selected.length} 个文件匹配 ${args.pattern}：\n${body}`,
        title: `${selected.length} 个文件`,
        detail: { preview: body.slice(0, 4000) }
      }
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error))
    }
  }
}

const grepSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  glob: z.string().optional(),
  case_sensitive: z.boolean().optional(),
  max_results: z.number().int().min(1).max(300).optional()
})

const grepTool: ToolDefinition = {
  name: 'grep',
  label: '搜索代码',
  description:
    'Search file contents with a regular expression. Skips binaries, secrets, dependencies, and build output.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'JavaScript regular expression' },
      path: { type: 'string', description: 'Directory or file to search' },
      glob: { type: 'string', description: 'Optional file glob filter, e.g. **/*.ts' },
      case_sensitive: { type: 'boolean', description: 'Default false' },
      max_results: { type: 'number', description: 'Default 100, max 300' }
    },
    required: ['pattern']
  },
  schema: grepSchema,
  async run(input, context) {
    const args = grepSchema.parse(input)
    try {
      let regex: RegExp
      try {
        regex = new RegExp(args.pattern, args.case_sensitive ? '' : 'i')
      } catch (error) {
        return toolError(`正则表达式无效：${error instanceof Error ? error.message : ''}`)
      }
      const base = await resolveInside(context.workspace, args.path ?? '.')
      const stat = await fs.stat(base)
      const maxResults = args.max_results ?? 100
      let files: string[] = []

      if (stat.isFile()) {
        files = [base]
      } else {
        const ig = await loadIgnore(base)
        const found = await fg(args.glob ?? '**/*', {
          cwd: base,
          dot: false,
          onlyFiles: true,
          followSymbolicLinks: false,
          suppressErrors: true,
          deep: 12,
          ignore: ['**/node_modules/**', '**/.git/**', '**/out/**', '**/dist/**']
        })
        files = found
          .map((match) => match.split(path.sep).join('/'))
          .filter((match) => !ig.ignores(match))
          .map((match) => path.join(base, match))
          .slice(0, 4000)
      }

      const matches: { path: string; line: number; text: string }[] = []
      for (const file of files) {
        if (matches.length >= maxResults) break
        if (isSensitive(file)) continue
        const info = await fs.stat(file).catch(() => null)
        if (!info || !info.isFile() || info.size > 1_000_000) continue
        let buffer: Buffer
        try {
          buffer = await fs.readFile(file)
        } catch {
          continue
        }
        if (!isProbablyText(buffer)) continue
        const lines = buffer.toString('utf8').split(/\r?\n/)
        for (let index = 0; index < lines.length; index += 1) {
          if (matches.length >= maxResults) break
          const line = lines[index]
          if (line.length > 2000) continue
          if (regex.test(line)) {
            matches.push({
              path: relativeTo(context.workspace, file),
              line: index + 1,
              text: line.trim().slice(0, 240)
            })
          }
        }
      }

      if (!matches.length) {
        return {
          content: `没有匹配 /${args.pattern}/ 的结果。`,
          title: '无匹配'
        }
      }

      const grouped = new Map<string, typeof matches>()
      for (const match of matches) {
        const list = grouped.get(match.path) ?? []
        list.push(match)
        grouped.set(match.path, list)
      }
      const body = [...grouped.entries()]
        .map(
          ([file, entries]) =>
            `${file}\n${entries.map((entry) => `  ${entry.line}: ${entry.text}`).join('\n')}`
        )
        .join('\n\n')
      return {
        content: `${matches.length} 处匹配，分布在 ${grouped.size} 个文件中：\n\n${body.slice(0, 40_000)}`,
        title: `${matches.length} 处匹配`,
        detail: { matches: matches.slice(0, 100) }
      }
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error))
    }
  }
}

export const searchTools: ToolDefinition[] = [globTool, grepTool]
