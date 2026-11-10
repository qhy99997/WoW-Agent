import { promises as fs } from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'
import type { SkillInfo } from '@shared/types'
import type { AppPaths } from './paths'
import { BUILTIN_SKILLS } from '@shared/builtin-skills'
import { exists } from '../util/fsx'

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  if (!raw.startsWith('---')) return { meta: {}, body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: raw }
  const header = raw.slice(3, end).trim()
  const body = raw.slice(end + 4).replace(/^\r?\n/, '')
  const meta: Record<string, string> = {}
  for (const line of header.split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim())
    if (match) meta[match[1]] = match[2].replace(/^["']|["']$/g, '')
  }
  return { meta, body }
}

export class SkillService {
  constructor(private readonly paths: AppPaths) {}

  async list(workspace?: string): Promise<SkillInfo[]> {
    const skills = new Map<string, SkillInfo>()
    for (const skill of BUILTIN_SKILLS) skills.set(skill.name, skill)

    const roots: { dir: string; scope: 'user' | 'workspace' }[] = [
      { dir: this.paths.skills, scope: 'user' }
    ]
    if (workspace) {
      roots.push(
        { dir: path.join(workspace, '.wow', 'skills'), scope: 'workspace' },
        { dir: path.join(workspace, '.agents', 'skills'), scope: 'workspace' }
      )
    }

    for (const { dir, scope } of roots) {
      if (!(await exists(dir))) continue
      const files = await fg('**/SKILL.md', {
        cwd: dir,
        absolute: true,
        onlyFiles: true,
        followSymbolicLinks: false,
        deep: 3
      })
      for (const file of files) {
        try {
          const raw = await fs.readFile(file, 'utf8')
          const { meta, body } = parseFrontmatter(raw)
          const fallbackName = path.basename(path.dirname(file))
          const name = (meta.name || fallbackName).trim()
          if (!name) continue
          skills.set(name, {
            name,
            description: meta.description || body.split(/\r?\n/).find(Boolean) || '自定义技能',
            whenToUse: meta.whenToUse || meta.when_to_use,
            scope,
            path: file,
            body: body.slice(0, 40_000)
          })
        } catch {
          // Ignore unreadable skill files.
        }
      }
    }
    return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name))
  }

  async get(name: string, workspace?: string): Promise<SkillInfo | undefined> {
    const skills = await this.list(workspace)
    return skills.find((skill) => skill.name === name)
  }

  async ensureUserDir(): Promise<void> {
    await fs.mkdir(this.paths.skills, { recursive: true })
  }
}
