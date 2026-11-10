import { safeStorage } from 'electron'
import { existsSync } from 'node:fs'
import { promises as fs } from 'node:fs'
import { readJson, writeJson } from '../util/fsx'

/**
 * API keys live outside settings.json and are encrypted with the OS keystore
 * (DPAPI on Windows) when available.
 */
export class SecretStore {
  private data: Record<string, string> = {}
  private loaded = false

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    if (!existsSync(this.file)) return
    try {
      this.data = await readJson<Record<string, string>>(this.file, {})
    } catch {
      this.data = {}
    }
  }

  has(id: string): boolean {
    return Boolean(this.data[id])
  }

  get(id: string): string | undefined {
    const stored = this.data[id]
    if (!stored) return undefined
    try {
      if (stored.startsWith('enc:')) {
        if (!safeStorage.isEncryptionAvailable()) return undefined
        return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
      }
      if (stored.startsWith('plain:')) {
        return Buffer.from(stored.slice(6), 'base64').toString('utf8')
      }
      return undefined
    } catch {
      return undefined
    }
  }

  async set(id: string, value: string): Promise<void> {
    await this.load()
    const trimmed = value.trim()
    if (!trimmed) {
      delete this.data[id]
      await this.flush()
      return
    }
    if (safeStorage.isEncryptionAvailable()) {
      this.data[id] = `enc:${safeStorage.encryptString(trimmed).toString('base64')}`
    } else {
      this.data[id] = `plain:${Buffer.from(trimmed, 'utf8').toString('base64')}`
    }
    await this.flush()
  }

  async remove(id: string): Promise<void> {
    await this.load()
    delete this.data[id]
    await this.flush()
  }

  private async flush(): Promise<void> {
    await fs.mkdir(this.file.replace(/[\\/][^\\/]+$/, ''), { recursive: true })
    await writeJson(this.file, this.data)
  }
}
