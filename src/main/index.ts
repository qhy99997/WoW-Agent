import { app, dialog, Menu } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { IPC } from '@shared/ipc'
import { AgentRuntime } from './agent/runtime'
import { TaskManager } from './agent/tasks'
import { registerIpc } from './ipc'
import { LibraryService } from './services/library'
import { AppPaths } from './services/paths'
import { SecretStore } from './services/secrets'
import { SessionStore } from './services/sessions'
import { SettingsService } from './services/settings'
import { SkillService } from './services/skills'
import { broadcast, createMainWindow, windowStateFile } from './window'

app.setName('WoW Agent')
if (process.platform === 'win32') app.setAppUserModelId('com.wowagent.desktop')
if (process.env.WOW_DEBUG_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.WOW_DEBUG_PORT)
}

const lock = app.requestSingleInstanceLock()
if (!lock) {
  app.quit()
} else {
  let tasks: TaskManager | null = null

  app.on('second-instance', () => {
    const windows = require('electron').BrowserWindow.getAllWindows()
    if (windows[0]) {
      if (windows[0].isMinimized()) windows[0].restore()
      windows[0].focus()
    }
  })

  app.whenReady().then(async () => {
    try {
      Menu.setApplicationMenu(null)
      const paths = new AppPaths(app.getPath('userData'))
      await fs.mkdir(paths.sessions, { recursive: true })
      await fs.mkdir(paths.tasks, { recursive: true })

      const secrets = new SecretStore(paths.secretsFile)
      const settings = new SettingsService(paths, secrets)
      await settings.load()
      if (!settings.get().defaultWorkspace) {
        await settings.update({ defaultWorkspace: app.getPath('documents') })
      }

      const sessions = new SessionStore(paths)
      await sessions.init()

      const library = new LibraryService(paths)
      await library.load()

      const skills = new SkillService(paths)
      await skills.ensureUserDir()

      tasks = new TaskManager(paths, (next) => {
        broadcast(IPC.event, { type: 'tasks:update', tasks: next })
      })

      const runtime = new AgentRuntime(
        { sessions, settings, library, skills, tasks },
        (event) => broadcast(IPC.event, event)
      )

      registerIpc({ paths, settings, sessions, library, skills, tasks, runtime })

      const icon = app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(app.getAppPath(), 'resources', 'icon.png')

      const win = await createMainWindow({
        preload: path.join(__dirname, '../preload/index.js'),
        rendererUrl: process.env['ELECTRON_RENDERER_URL'],
        rendererFile: path.join(__dirname, '../renderer/index.html'),
        icon,
        stateFile: windowStateFile(paths.root)
      })

      if (process.env.WOW_DEVTOOLS === '1') {
        win.webContents.openDevTools({ mode: 'detach' })
      }

      app.on('activate', () => {
        if (!require('electron').BrowserWindow.getAllWindows().length) {
          void createMainWindow({
            preload: path.join(__dirname, '../preload/index.js'),
            rendererUrl: process.env['ELECTRON_RENDERER_URL'],
            rendererFile: path.join(__dirname, '../renderer/index.html'),
            icon,
            stateFile: windowStateFile(paths.root)
          })
        }
      })
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error)
      dialog.showErrorBox('WoW Agent 启动失败', message)
      app.quit()
    }
  })

  app.on('before-quit', () => {
    tasks?.dispose()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
