import { randomUUID } from 'node:crypto'

export function newId(prefix?: string): string {
  const id = randomUUID().replace(/-/g, '').slice(0, 20)
  return prefix ? `${prefix}_${id}` : id
}

export function now(): number {
  return Date.now()
}
