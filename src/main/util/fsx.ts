import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export async function atomicWrite(file: string, data: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fs.writeFile(tmp, data)
  await fs.rename(tmp, file)
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`)
}

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

export function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * Resolve a model-supplied path inside the workspace. Throws when the path
 * escapes, including through an existing symlinked parent.
 */
export async function resolveInside(root: string, input: string): Promise<string> {
  if (typeof input !== 'string' || input.includes('\0')) {
    throw new Error('Invalid path')
  }
  const base = path.resolve(root)
  const candidate = path.resolve(base, input)
  if (!isInside(base, candidate)) {
    throw new Error(`Path escapes the workspace: ${input}`)
  }

  // Resolve the closest existing ancestor so symlink escapes are caught.
  let probe = candidate
  const suffix: string[] = []
  for (let i = 0; i < 40; i += 1) {
    try {
      const real = await fs.realpath(probe)
      const resolved = path.join(real, ...suffix.reverse())
      if (!isInside(await fs.realpath(base), resolved)) {
        throw new Error(`Path escapes the workspace through a link: ${input}`)
      }
      return candidate
    } catch (error) {
      if (error instanceof Error && error.message.includes('escapes the workspace')) throw error
      const parent = path.dirname(probe)
      if (parent === probe) break
      suffix.push(path.basename(probe))
      probe = parent
    }
  }
  return candidate
}

export function toPosix(value: string): string {
  return value.split(path.sep).join('/')
}

export function relativeTo(root: string, file: string): string {
  return toPosix(path.relative(root, file))
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16)
}

export async function readCapped(
  file: string,
  maxBytes: number
): Promise<{ buffer: Buffer; truncated: boolean; size: number }> {
  const stat = await fs.stat(file)
  const handle = await fs.open(file, 'r')
  try {
    const length = Math.min(stat.size, maxBytes)
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, 0)
    return { buffer: buffer.subarray(0, bytesRead), truncated: stat.size > maxBytes, size: stat.size }
  } finally {
    await handle.close()
  }
}
