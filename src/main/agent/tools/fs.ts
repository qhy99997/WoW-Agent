import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { formatBytes, isProbablyText } from '@shared/utils'
import type { FileChange } from '@shared/types'
import { hashContent, readCapped, relativeTo, resolveInside } from '../../util/fsx'
import { buildDiff } from '../diff'
import { toolError, type ToolDefinition, type ToolRunContext } from './types'

const MAX_EDITABLE = 2_000_000
const MAX_READ = 5_000_000
const MAX_LINES = 4000
const MAX_OUTPUT = 100_000

async function readText(file: string): Promise<{ text: string; size: number }> {
  const stat = await fs.stat(file)
  if (!stat.isFile()) throw new Error(`${file} 不是文件`)
  if (stat.size > MAX_READ) {
    throw new Error(
      `文件大小为 ${formatBytes(stat.size)}；读取上限为 ${formatBytes(MAX_READ)}。请改为读取一个范围。`
    )
  }
  const { buffer, size } = await readCapped(file, MAX_READ)
  if (!isProbablyText(buffer)) throw new Error('这看起来是二进制文件。')
  return { text: buffer.toString('utf8'), size }
}

async function currentHash(file: string): Promise<string | null> {
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile() || stat.size > MAX_EDITABLE) return null
    const { buffer } = await readCapped(file, MAX_EDITABLE)
    if (!isProbablyText(buffer)) return null
    return hashContent(buffer.toString('utf8'))
  } catch {
    return null
  }
}

async function addFileChange(
  context: ToolRunContext,
  file: string,
  before: string,
  after: string,
  kind: FileChange['kind']
): Promise<{ additions: number; deletions: number; patch: string }> {
  const relative = relativeTo(context.workspace, file)
  const diff = buildDiff(relative, before, after)
  await context.addChange({ path: relative, before, after, kind })
  return diff
}

const readSchema = z.object({
  path: z.string().min(1),
  offset: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_LINES).optional()
})

const readTool: ToolDefinition = {
  name: 'read_file',
  label: '读取文件',
  description:
    'Read a text file from the workspace. Returns numbered lines. Use offset and limit for large files.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative file path' },
      offset: { type: 'number', description: '1-based first line (default 1)' },
      limit: { type: 'number', description: 'Maximum lines to return (default 2000)' }
    },
    required: ['path']
  },
  schema: readSchema,
  async run(input, context) {
    const args = readSchema.parse(input)
    try {
      const file = await resolveInside(context.workspace, args.path)
      const { text, size } = await readText(file)
      const lines = text.split('\n')
      const offset = args.offset ?? 1
      const limit = args.limit ?? 2000
      if (offset > lines.length) {
        return toolError(`偏移量 ${offset} 超出文件末尾（共 ${lines.length} 行）。`)
      }
      const selected = lines.slice(offset - 1, offset - 1 + limit)
      let body = selected.map((line, index) => `${offset + index}→${line}`).join('\n')
      if (body.length > MAX_OUTPUT) {
        body = `${body.slice(0, MAX_OUTPUT)}\n…[输出已截断；请使用更小的范围]`
      }
      const relative = relativeTo(context.workspace, file)
      context.readFiles.set(
        file,
        size <= MAX_EDITABLE ? hashContent(text) : 'large'
      )
      const last = offset + selected.length - 1
      const more =
        last < lines.length
          ? `\n[显示第 ${offset}-${last} 行，共 ${lines.length} 行；继续时使用 offset ${last + 1}]`
          : ''
      return {
        content: `${relative} · ${lines.length} 行 · ${formatBytes(size)}\n\n${body}${more}`,
        title: `读取 ${relative}`,
        detail: { path: relative, preview: body.slice(0, 4000) }
      }
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error))
    }
  }
}

const writeSchema = z.object({
  path: z.string().min(1),
  content: z.string().max(MAX_EDITABLE)
})

const writeTool: ToolDefinition = {
  name: 'write_file',
  label: '写入文件',
  description:
    'Create a file or replace its full contents. If the file already exists you must read it first in this session.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative file path' },
      content: { type: 'string', description: 'Full file contents' }
    },
    required: ['path', 'content']
  },
  schema: writeSchema,
  async run(input, context) {
    const args = writeSchema.parse(input)
    try {
      const file = await resolveInside(context.workspace, args.path)
      const relative = relativeTo(context.workspace, file)
      let exists = false
      let before = ''
      try {
        const stat = await fs.stat(file)
        exists = stat.isFile()
        if (exists) {
          if (stat.size > MAX_EDITABLE) {
            return toolError(
              `文件大小为 ${formatBytes(stat.size)}；超过 ${formatBytes(MAX_EDITABLE)} 的文件无法编辑。`
            )
          }
          const current = await readText(file)
          before = current.text
          const expected = context.readFiles.get(file)
          if (!expected) {
            return toolError(`写入前请先读取 ${relative}。`)
          }
          if (expected !== hashContent(before)) {
            return toolError(
              `${relative} 在读取后已在磁盘上发生变化。请重新读取后再写入。`
            )
          }
        }
      } catch {
        exists = false
      }

      if (before === args.content) {
        context.readFiles.set(file, hashContent(args.content))
        return { content: `${relative} 未更改。`, title: `写入 ${relative}` }
      }

      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, args.content, 'utf8')
      context.readFiles.set(file, hashContent(args.content))
      const diff = await addFileChange(
        context,
        file,
        before,
        args.content,
        exists ? 'modify' : 'create'
      )
      const lines = args.content.split('\n').length
      return {
        content: `${exists ? '已更新' : '已创建'} ${relative}（${lines} 行，${formatBytes(
          Buffer.byteLength(args.content)
        )}；+${diff.additions} −${diff.deletions}）`,
        title: `${exists ? '已更新' : '已创建'} ${relative}`,
        detail: {
          path: relative,
          diff: diff.patch,
          additions: diff.additions,
          deletions: diff.deletions
        }
      }
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error))
    }
  }
}

const editSchema = z.object({
  path: z.string().min(1),
  old_string: z.string().min(1),
  new_string: z.string(),
  replace_all: z.boolean().optional()
})

const editTool: ToolDefinition = {
  name: 'edit_file',
  label: '编辑文件',
  description:
    'Replace an exact string in a file. The file must have been read first. By default old_string must occur exactly once.',
  risk: 'write',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      old_string: { type: 'string', description: 'Exact text to find' },
      new_string: { type: 'string', description: 'Replacement text' },
      replace_all: { type: 'boolean', description: 'Replace every occurrence' }
    },
    required: ['path', 'old_string', 'new_string']
  },
  schema: editSchema,
  async run(input, context) {
    const args = editSchema.parse(input)
    try {
      const file = await resolveInside(context.workspace, args.path)
      const relative = relativeTo(context.workspace, file)
      let current: { text: string; size: number }
      try {
        current = await readText(file)
      } catch {
        return toolError(`文件不存在：${relative}`)
      }
      if (current.size > MAX_EDITABLE) {
        return toolError(`文件太大，无法编辑（${formatBytes(current.size)}）。`)
      }
      const expected = context.readFiles.get(file)
      if (!expected) return toolError(`编辑前请先读取 ${relative}。`)
      if (expected !== hashContent(current.text)) {
        return toolError(`${relative} 在读取后已在磁盘上发生变化。请重新读取。`)
      }
      if (args.old_string === args.new_string) {
        return { content: `${relative} 未更改。`, title: `编辑 ${relative}` }
      }

      const occurrences = current.text.split(args.old_string).length - 1
      if (occurrences === 0) {
        return toolError(`在 ${relative} 中未找到 old_string。请读取文件后重试。`)
      }
      if (occurrences > 1 && !args.replace_all) {
        return toolError(
          `old_string 在 ${relative} 中出现 ${occurrences} 次。请提供更多上下文，或设置 replace_all。`
        )
      }
      const after = args.replace_all
        ? current.text.split(args.old_string).join(args.new_string)
        : (() => {
            const index = current.text.indexOf(args.old_string)
            return (
              current.text.slice(0, index) +
              args.new_string +
              current.text.slice(index + args.old_string.length)
            )
          })()

      await fs.writeFile(file, after, 'utf8')
      context.readFiles.set(file, hashContent(after))
      const diff = await addFileChange(context, file, current.text, after, 'modify')
      return {
        content: `已编辑 ${relative}（${occurrences} 处替换；+${diff.additions} −${diff.deletions}）`,
        title: `已编辑 ${relative}`,
        detail: {
          path: relative,
          diff: diff.patch,
          additions: diff.additions,
          deletions: diff.deletions
        }
      }
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error))
    }
  }
}

const listSchema = z.object({
  path: z.string().optional(),
  depth: z.number().int().min(1).max(3).optional()
})

const listTool: ToolDefinition = {
  name: 'list_dir',
  label: '列出目录',
  description: 'List a directory as a shallow tree. Use glob for file patterns.',
  risk: 'read',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Workspace-relative directory (default .)' },
      depth: { type: 'number', description: 'Depth 1-3 (default 1)' }
    }
  },
  schema: listSchema,
  async run(input, context) {
    const args = listSchema.parse(input)
    try {
      const base = await resolveInside(context.workspace, args.path ?? '.')
      const stat = await fs.stat(base)
      if (!stat.isDirectory()) return toolError('不是目录。')
      const depth = args.depth ?? 1
      const lines: string[] = []
      let entries = 0
      let truncated = false

      const walk = async (dir: string, level: number, prefix: string): Promise<void> => {
        if (level > depth || entries > 400) return
        const children = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
        children.sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        for (const child of children) {
          if (entries > 400) {
            truncated = true
            return
          }
          if (child.isSymbolicLink()) {
            lines.push(`${prefix}${child.name} → （链接）`)
            entries += 1
            continue
          }
          const full = path.join(dir, child.name)
          if (child.isDirectory()) {
            lines.push(`${prefix}${child.name}/`)
            entries += 1
            await walk(full, level + 1, `${prefix}  `)
          } else {
            const info = await fs.stat(full).catch(() => null)
            lines.push(`${prefix}${child.name}${info ? `  ${formatBytes(info.size)}` : ''}`)
            entries += 1
          }
        }
      }
      await walk(base, 1, '')
      const relative = relativeTo(context.workspace, base) || '.'
      let body = lines.join('\n')
      if (body.length > 20_000) body = `${body.slice(0, 20_000)}\n…[已截断]`
      return {
        content: `${relative}/\n${body}${truncated ? '\n…[更多条目已省略]' : ''}`,
        title: `已列出 ${relative}`,
        detail: { path: relative, preview: body.slice(0, 4000) }
      }
    } catch (error) {
      return toolError(error instanceof Error ? error.message : String(error))
    }
  }
}

export const fsTools: ToolDefinition[] = [readTool, writeTool, editTool, listTool]
export { currentHash }
