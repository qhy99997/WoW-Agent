import path from 'node:path'

export class AppPaths {
  readonly root: string
  readonly sessions: string
  readonly tasks: string
  readonly skills: string
  readonly logs: string
  readonly settingsFile: string
  readonly secretsFile: string
  readonly libraryFile: string

  constructor(root: string) {
    this.root = root
    this.sessions = path.join(root, 'sessions')
    this.tasks = path.join(root, 'tasks')
    this.skills = path.join(root, 'skills')
    this.logs = path.join(root, 'logs')
    this.settingsFile = path.join(root, 'settings.json')
    this.secretsFile = path.join(root, 'secrets.json')
    this.libraryFile = path.join(root, 'library.json')
  }

  sessionDir(id: string): string {
    return path.join(this.sessions, id)
  }

  sessionFile(id: string): string {
    return path.join(this.sessionDir(id), 'session.json')
  }

  taskLog(id: string): string {
    return path.join(this.tasks, `${id}.log`)
  }
}
