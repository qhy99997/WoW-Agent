import { BrowserWindow, nativeTheme, screen, shell } from 'electron'
import path from 'node:path'
import { readJson, writeJson } from './util/fsx'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized: boolean
}

const DEFAULT_STATE: WindowState = { width: 1440, height: 920, maximized: false }

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export async function createMainWindow(options: {
  preload: string
  rendererUrl?: string
  rendererFile: string
  icon?: string
  stateFile: string
}): Promise<BrowserWindow> {
  const state = await readJson<WindowState>(options.stateFile, DEFAULT_STATE)
  const workArea = screen.getPrimaryDisplay().workArea
  const defaultWidth = Math.min(1440, workArea.width - 32)
  const defaultHeight = Math.min(920, workArea.height - 32)
  const savedFits =
    state.width <= workArea.width && state.height <= workArea.height && isVisible(state)
  const width = savedFits ? state.width : defaultWidth
  const height = savedFits ? state.height : defaultHeight
  const x = savedFits && state.x !== undefined
    ? state.x
    : workArea.x + Math.round((workArea.width - width) / 2)
  const y = savedFits && state.y !== undefined
    ? state.y
    : workArea.y + Math.round((workArea.height - height) / 2)

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: 1040,
    minHeight: 680,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#121310' : '#f2efe7',
    title: 'WoW Agent',
    icon: options.icon,
    webPreferences: {
      preload: options.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: true
    }
  })

  mainWindow = win

  win.once('ready-to-show', () => {
    if (state.maximized) win.maximize()
    win.show()
  })

  win.on('close', () => {
    const bounds = win.getNormalBounds()
    const next: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: win.isMaximized()
    }
    void writeJson(options.stateFile, next).catch(() => undefined)
  })

  win.on('closed', () => {
    mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const current = win.webContents.getURL()
    if (url !== current) event.preventDefault()
  })

  if (options.rendererUrl) {
    await win.loadURL(options.rendererUrl)
  } else {
    await win.loadFile(options.rendererFile)
  }

  return win
}

function isVisible(state: WindowState): boolean {
  if (state.x === undefined || state.y === undefined) return true
  const displays = screen.getAllDisplays()
  return displays.some((display) => {
    const { x, y, width, height } = display.workArea
    return (
      state.x! >= x - 40 &&
      state.y! >= y - 40 &&
      state.x! < x + width - 80 &&
      state.y! < y + height - 80
    )
  })
}

export function broadcast(channel: string, payload: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(channel, payload)
  }
}

export function windowStateFile(userData: string): string {
  return path.join(userData, 'window-state.json')
}
