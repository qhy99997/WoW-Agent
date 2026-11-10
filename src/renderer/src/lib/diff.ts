import { createTwoFilesPatch } from 'diff'

export function patchFor(path: string, before: string, after: string): string {
  return createTwoFilesPatch(path, path, before, after, 'before', 'after', { context: 3 })
}
