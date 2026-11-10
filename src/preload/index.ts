import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { AppEvent, WowApi } from '../shared/types'

const api: WowApi = {
  app: {
    info: () => ipcRenderer.invoke(IPC.appInfo),
    minimize: () => ipcRenderer.send(IPC.appMinimize),
    toggleMaximize: () => ipcRenderer.send(IPC.appToggleMaximize),
    close: () => ipcRenderer.send(IPC.appClose),
    openExternal: (url) => ipcRenderer.invoke(IPC.appOpenExternal, url),
    showItemInFolder: (target) => ipcRenderer.send(IPC.appShowItem, target),
    pickDirectory: () => ipcRenderer.invoke(IPC.appPickDirectory),
    pickFiles: () => ipcRenderer.invoke(IPC.appPickFiles),
    openPath: (target) => ipcRenderer.invoke(IPC.appOpenPath, target)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet),
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
    updateProvider: (patch) => ipcRenderer.invoke(IPC.providerUpdate, patch),
    removeProvider: (id) => ipcRenderer.invoke(IPC.providerRemove, id),
    testProvider: (id) => ipcRenderer.invoke(IPC.providerTest, id)
  },
  sessions: {
    list: () => ipcRenderer.invoke(IPC.sessionsList),
    create: (input) => ipcRenderer.invoke(IPC.sessionsCreate, input),
    get: (id) => ipcRenderer.invoke(IPC.sessionsGet, id),
    rename: (id, title) => ipcRenderer.invoke(IPC.sessionsRename, id, title),
    remove: (id) => ipcRenderer.invoke(IPC.sessionsRemove, id),
    setModel: (id, model) => ipcRenderer.invoke(IPC.sessionsSetModel, id, model),
    setMode: (id, mode) => ipcRenderer.invoke(IPC.sessionsSetMode, id, mode)
  },
  chat: {
    send: (input) => ipcRenderer.invoke(IPC.chatSend, input),
    stop: (sessionId) => ipcRenderer.invoke(IPC.chatStop, sessionId),
    respondApproval: (sessionId, approvalId, decision) =>
      ipcRenderer.invoke(IPC.chatApproval, sessionId, approvalId, decision),
    answerQuestion: (sessionId, requestId, answers) =>
      ipcRenderer.invoke(IPC.chatAnswer, sessionId, requestId, answers),
    compact: (sessionId) => ipcRenderer.invoke(IPC.chatCompact, sessionId),
    revertTurn: (sessionId, turnId) => ipcRenderer.invoke(IPC.chatRevertTurn, sessionId, turnId)
  },
  workspace: {
    tree: (root, depth) => ipcRenderer.invoke(IPC.workspaceTree, root, depth),
    preview: (file) => ipcRenderer.invoke(IPC.workspacePreview, file),
    gitChanges: (root) => ipcRenderer.invoke(IPC.workspaceGitChanges, root)
  },
  library: {
    list: () => ipcRenderer.invoke(IPC.libraryList),
    add: (input) => ipcRenderer.invoke(IPC.libraryAdd, input),
    remove: (id) => ipcRenderer.invoke(IPC.libraryRemove, id)
  },
  skills: {
    list: (workspace) => ipcRenderer.invoke(IPC.skillsList, workspace),
    open: (target) => ipcRenderer.invoke(IPC.skillsOpen, target)
  },
  tasks: {
    list: () => ipcRenderer.invoke(IPC.tasksList),
    stop: (id) => ipcRenderer.invoke(IPC.tasksStop, id)
  },
  changes: {
    list: (sessionId) => ipcRenderer.invoke(IPC.changesList, sessionId)
  },
  onEvent: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: AppEvent): void => {
      listener(payload)
    }
    ipcRenderer.on(IPC.event, wrapped)
    return () => ipcRenderer.removeListener(IPC.event, wrapped)
  }
}

contextBridge.exposeInMainWorld('wow', api)
