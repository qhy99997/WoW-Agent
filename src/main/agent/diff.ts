import { createTwoFilesPatch, diffLines } from 'diff'

function countLines(value: string): number {
  if (!value) return 0
  const lines = value.split('\n')
  return lines.length - (lines[lines.length - 1] === '' ? 1 : 0)
}

export function buildDiff(
  path: string,
  before: string,
  after: string
): { patch: string; additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const part of diffLines(before, after)) {
    if (part.added) additions += countLines(part.value)
    else if (part.removed) deletions += countLines(part.value)
  }
  let patch = createTwoFilesPatch(path, path, before, after, 'before', 'after', {
    context: 3
  })
  if (patch.length > 120_000) {
    patch = `${patch.slice(0, 120_000)}\n…[diff truncated]`
  }
  return { patch, additions, deletions }
}
