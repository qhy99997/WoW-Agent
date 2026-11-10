import { create } from 'zustand'
import type {
  AppEvent,
  AppInfo,
  AppSettings,
  Attachment,
  BackgroundTask,
  FileNode,
  FilePreview,
  LibraryItem,
  ModelRef,
  PermissionMode,
  ProviderPatch,
  ProviderTestResult,
  SessionDetail,
  SessionSummary,
  SettingsPatch,
  SkillInfo,
  TimelineItem
} from '@shared/types'
import { api } from '../lib/bridge'

export type View = 'chat' | 'library' | 'tasks' | 'skills'
export type CanvasTab = 'plan' | 'changes' | 'files' | 'terminal'
export type SettingsSection = 'general' | 'models' | 'permissions' | 'data' | 'about'
export type ToastLevel = 'info' | 'success' | 'warn' | 'error'

export interface Toast {
  id: string
  level: ToastLevel
  title: string
  detail?: string
}

interface AppStore {
  booted: boolean
  bootError: string | null
  settings: AppSettings | null
  sessions: SessionSummary[]
  session: SessionDetail | null
  sessionLoading: boolean
  view: View
  running: boolean
  tasks: BackgroundTask[]
  library: LibraryItem[]
  skills: SkillInfo[]
  appInfo: AppInfo | null

  canvasOpen: boolean
  canvasTab: CanvasTab
  canvasWidth: number
  settingsOpen: boolean
  settingsSection: SettingsSection
  paletteOpen: boolean

  fileTree: FileNode[]
  treeLoading: boolean
  selectedPath: string | null
  preview: FilePreview | null
  previewLoading: boolean

  draft: string
  workflowId: string | null
  seedNonce: number
  toasts: Toast[]

  boot: () => Promise<void>
  openSession: (id: string) => Promise<void>
  createSession: (workspace?: string) => Promise<void>
  refreshCurrent: () => Promise<void>
  send: (text: string, attachments?: Attachment[]) => Promise<void>
  stop: () => Promise<void>
  setMode: (mode: PermissionMode) => Promise<void>
  setModel: (model: ModelRef) => Promise<void>
  renameSession: (id: string, title: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  respondApproval: (
    approvalId: string,
    decision: 'allow' | 'allow_always' | 'deny'
  ) => Promise<void>
  answerQuestion: (requestId: string, answers: Record<string, string[]>) => Promise<void>
  compact: () => Promise<void>
  revertTurn: (turnId: string) => Promise<void>

  updateSettings: (patch: SettingsPatch) => Promise<void>
  updateProvider: (patch: ProviderPatch) => Promise<AppSettings | null>
  removeProvider: (id: string) => Promise<void>
  testProvider: (id: string) => Promise<ProviderTestResult>

  loadLibrary: () => Promise<void>
  addLibraryItem: (input: {
    title: string
    kind: LibraryItem['kind']
    content: string
    tags?: string[]
    sourcePath?: string
  }) => Promise<void>
  removeLibraryItem: (id: string) => Promise<void>
  loadTasks: () => Promise<void>
  stopTask: (id: string) => Promise<void>
  loadSkills: (workspace?: string) => Promise<void>
  refreshTree: () => Promise<void>
  previewFile: (node: FileNode) => Promise<void>
  clearPreview: () => void
  savePreviewToLibrary: () => Promise<void>

  setView: (view: View) => void
  setDraft: (draft: string) => void
  seedComposer: (text: string, workflowId?: string | null) => void
  setWorkflow: (workflowId: string | null) => void
  toggleCanvas: () => void
  openCanvas: (tab?: CanvasTab) => void
  setCanvasTab: (tab: CanvasTab) => void
  setCanvasWidth: (width: number) => void
  setSettingsOpen: (open: boolean, section?: SettingsSection) => void
  setSettingsSection: (section: SettingsSection) => void
  setPaletteOpen: (open: boolean) => void
  addToast: (level: ToastLevel, title: string, detail?: string) => void
  dismissToast: (id: string) => void
}

const uid = (): string => crypto.randomUUID()
let unsubscribe: (() => void) | null = null
let bootPromise: Promise<void> | null = null

function sortSessions(sessions: SessionSummary[]): SessionSummary[] {
  return [...sessions].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.updatedAt - a.updatedAt
  )
}

function upsertSummary(
  sessions: SessionSummary[],
  summary: SessionSummary
): SessionSummary[] {
  return sortSessions([summary, ...sessions.filter((entry) => entry.id !== summary.id)])
}

function readCanvasWidth(): number {
  try {
    const stored = Number(localStorage.getItem('wow:canvas-width'))
    if (Number.isFinite(stored) && stored >= 320 && stored <= 720) return stored
  } catch {
    // ignore storage errors
  }
  return 408
}

export const useAppStore = create<AppStore>((set, get) => ({
  booted: false,
  bootError: null,
  settings: null,
  sessions: [],
  session: null,
  sessionLoading: false,
  view: 'chat',
  running: false,
  tasks: [],
  library: [],
  skills: [],
  appInfo: null,
  canvasOpen: true,
  canvasTab: 'plan',
  canvasWidth: readCanvasWidth(),
  settingsOpen: false,
  settingsSection: 'general',
  paletteOpen: false,
  fileTree: [],
  treeLoading: false,
  selectedPath: null,
  preview: null,
  previewLoading: false,
  draft: '',
  workflowId: null,
  seedNonce: 0,
  toasts: [],

  boot: async () => {
    if (get().booted) return
    if (bootPromise) return bootPromise
    bootPromise = (async () => {
      try {
        if (!unsubscribe) unsubscribe = api.onEvent(handleEvent)
        const [settings, sessions, library, tasks, appInfo] = await Promise.all([
          api.settings.get(),
          api.sessions.list(),
          api.library.list(),
          api.tasks.list(),
          api.app.info()
        ])
        set({ settings, sessions, library, tasks, appInfo })
        if (sessions.length) {
          await get().openSession(sessions[0].id)
        } else {
          await get().createSession()
        }
        set({ booted: true, bootError: null })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        set({ bootError: message, booted: true })
      } finally {
        bootPromise = null
      }
    })()
    return bootPromise
  },

  openSession: async (id) => {
    const current = get().session
    if (current?.id === id && !get().sessionLoading) return
    set({ sessionLoading: true })
    try {
      const session = await api.sessions.get(id)
      set({
        session,
        sessionLoading: false,
        running: session.status === 'running',
        view: 'chat',
        workflowId: session.workflowId ?? null,
        draft: '',
        selectedPath: null,
        preview: null,
        fileTree: [],
        canvasTab: session.changes.length ? 'changes' : 'plan'
      })
      void get().loadSkills(session.workspace)
      void get().refreshTree()
    } catch (error) {
      set({ sessionLoading: false })
      get().addToast('error', '无法打开任务', error instanceof Error ? error.message : String(error))
    }
  },

  createSession: async (workspace) => {
    try {
      const session = await api.sessions.create({ workspace })
      const sessions = await api.sessions.list()
      set({
        sessions,
        session,
        running: false,
        view: 'chat',
        draft: '',
        workflowId: null,
        selectedPath: null,
        preview: null,
        fileTree: [],
        canvasTab: 'plan'
      })
      void get().loadSkills(session.workspace)
      void get().refreshTree()
    } catch (error) {
      get().addToast('error', '无法创建任务', error instanceof Error ? error.message : String(error))
    }
  },

  refreshCurrent: async () => {
    const id = get().session?.id
    if (!id) return
    const session = await api.sessions.get(id)
    set({ session, running: session.status === 'running' })
  },

  send: async (text, attachments) => {
    const session = get().session
    if (!session || get().running) return
    const trimmed = text.trim()
    if (!trimmed && !(attachments?.length ?? 0)) return
    set({ running: true, draft: '' })
    try {
      await api.chat.send({
        sessionId: session.id,
        text: trimmed,
        attachments,
        workflowId: get().workflowId ?? undefined
      })
    } catch (error) {
      set({ running: false })
      get().addToast('error', '无法发送', error instanceof Error ? error.message : String(error))
    }
  },

  stop: async () => {
    const session = get().session
    if (!session) return
    set({ running: false })
    await api.chat.stop(session.id)
  },

  setMode: async (mode) => {
    const session = get().session
    if (!session) return
    set({ session: { ...session, permissionMode: mode } })
    try {
      const summary = await api.sessions.setMode(session.id, mode)
      set({
        sessions: upsertSummary(get().sessions, summary),
        session: get().session ? { ...get().session!, permissionMode: mode } : null
      })
    } catch (error) {
      get().addToast('error', '无法切换模式', error instanceof Error ? error.message : String(error))
    }
  },

  setModel: async (model) => {
    const session = get().session
    if (!session) return
    set({ session: { ...session, model } })
    try {
      const summary = await api.sessions.setModel(session.id, model)
      set({
        sessions: upsertSummary(get().sessions, summary),
        session: get().session ? { ...get().session!, model } : null
      })
    } catch (error) {
      get().addToast('error', '无法切换模型', error instanceof Error ? error.message : String(error))
    }
  },

  renameSession: async (id, title) => {
    try {
      const summary = await api.sessions.rename(id, title)
      set({
        sessions: upsertSummary(get().sessions, summary),
        session:
          get().session?.id === id ? { ...get().session!, title: summary.title } : get().session
      })
    } catch (error) {
      get().addToast('error', '无法重命名', error instanceof Error ? error.message : String(error))
    }
  },

  deleteSession: async (id) => {
    try {
      await api.sessions.remove(id)
      const sessions = get().sessions.filter((session) => session.id !== id)
      set({ sessions })
      if (get().session?.id === id) {
        if (sessions.length) await get().openSession(sessions[0].id)
        else await get().createSession()
      }
    } catch (error) {
      get().addToast('error', '无法删除任务', error instanceof Error ? error.message : String(error))
    }
  },

  respondApproval: async (approvalId, decision) => {
    const session = get().session
    if (!session) return
    set({
      session: {
        ...session,
        timeline: session.timeline.map((item) =>
          item.kind === 'approval' && item.approvalId === approvalId
            ? {
                ...item,
                status: decision === 'deny' ? 'denied' : 'allowed',
                decision
              }
            : item
        )
      }
    })
    try {
      await api.chat.respondApproval(session.id, approvalId, {
        type: decision
      })
    } catch (error) {
      get().addToast('error', '审批失败', error instanceof Error ? error.message : String(error))
    }
  },

  answerQuestion: async (requestId, answers) => {
    const session = get().session
    if (!session) return
    set({
      session: {
        ...session,
        timeline: session.timeline.map((item) =>
          item.kind === 'question' && item.requestId === requestId
            ? { ...item, status: 'answered', answers }
            : item
        )
      }
    })
    try {
      await api.chat.answerQuestion(session.id, requestId, answers)
    } catch (error) {
      get().addToast('error', '无法发送回答', error instanceof Error ? error.message : String(error))
    }
  },

  compact: async () => {
    const session = get().session
    if (!session) return
    try {
      await api.chat.compact(session.id)
      get().addToast('success', '上下文已压缩')
    } catch (error) {
      get().addToast('error', '压缩失败', error instanceof Error ? error.message : String(error))
    }
  },

  revertTurn: async (turnId) => {
    const session = get().session
    if (!session) return
    try {
      const count = await api.chat.revertTurn(session.id, turnId)
      await get().refreshCurrent()
      get().addToast(
        count ? 'success' : 'warn',
        count ? `已回退 ${count} 个文件` : '没有可回退的内容'
      )
    } catch (error) {
      get().addToast('error', '回退失败', error instanceof Error ? error.message : String(error))
    }
  },

  updateSettings: async (patch) => {
    try {
      const settings = await api.settings.update(patch)
      set({ settings })
    } catch (error) {
      get().addToast('error', '无法保存设置', error instanceof Error ? error.message : String(error))
    }
  },

  updateProvider: async (patch) => {
    try {
      const settings = await api.settings.updateProvider(patch)
      set({ settings })
      return settings
    } catch (error) {
      get().addToast('error', '无法保存供应商', error instanceof Error ? error.message : String(error))
      return null
    }
  },

  removeProvider: async (id) => {
    try {
      const settings = await api.settings.removeProvider(id)
      set({ settings })
    } catch (error) {
      get().addToast('error', '无法移除供应商', error instanceof Error ? error.message : String(error))
    }
  },

  testProvider: (id) => api.settings.testProvider(id),

  loadLibrary: async () => {
    try {
      set({ library: await api.library.list() })
    } catch {
      // non-fatal
    }
  },

  addLibraryItem: async (input) => {
    try {
      const item = await api.library.add(input)
      set({ library: [item, ...get().library.filter((entry) => entry.id !== item.id)] })
      get().addToast('success', '已保存到资料库', item.title)
    } catch (error) {
      get().addToast('error', '无法保存到资料库', error instanceof Error ? error.message : String(error))
    }
  },

  removeLibraryItem: async (id) => {
    try {
      await api.library.remove(id)
      set({ library: get().library.filter((item) => item.id !== id) })
    } catch (error) {
      get().addToast('error', '无法移除条目', error instanceof Error ? error.message : String(error))
    }
  },

  loadTasks: async () => {
    try {
      set({ tasks: await api.tasks.list() })
    } catch {
      // non-fatal
    }
  },

  stopTask: async (id) => {
    try {
      await api.tasks.stop(id)
    } catch (error) {
      get().addToast('error', '无法停止任务', error instanceof Error ? error.message : String(error))
    }
  },

  loadSkills: async (workspace) => {
    try {
      set({ skills: await api.skills.list(workspace ?? get().session?.workspace) })
    } catch {
      // non-fatal
    }
  },

  refreshTree: async () => {
    const root = get().session?.workspace
    if (!root) return
    set({ treeLoading: true })
    try {
      const fileTree = await api.workspace.tree(root, 4)
      set({ fileTree, treeLoading: false })
    } catch (error) {
      set({ treeLoading: false })
      get().addToast('error', '无法读取工作区', error instanceof Error ? error.message : String(error))
    }
  },

  previewFile: async (node) => {
    if (node.type === 'dir') return
    set({ selectedPath: node.path, previewLoading: true })
    try {
      const preview = await api.workspace.preview(node.path)
      set({ preview, previewLoading: false })
    } catch (error) {
      set({ previewLoading: false })
      get().addToast('error', '无法预览文件', error instanceof Error ? error.message : String(error))
    }
  },

  clearPreview: () => set({ selectedPath: null, preview: null }),

  savePreviewToLibrary: async () => {
    const preview = get().preview
    if (!preview) return
    await get().addLibraryItem({
      title: preview.name,
      kind: preview.kind === 'markdown' ? 'note' : 'artifact',
      content: preview.content,
      sourcePath: preview.path,
      tags: ['文件']
    })
  },

  setView: (view) => {
    set({ view })
    if (view === 'library') void get().loadLibrary()
    if (view === 'tasks') void get().loadTasks()
    if (view === 'skills') void get().loadSkills()
  },

  setDraft: (draft) => set({ draft }),

  seedComposer: (text, workflowId) =>
    set((state) => ({
      draft: text,
      workflowId: workflowId === undefined ? state.workflowId : workflowId,
      seedNonce: state.seedNonce + 1
    })),

  setWorkflow: (workflowId) => set({ workflowId }),

  toggleCanvas: () => set((state) => ({ canvasOpen: !state.canvasOpen })),

  openCanvas: (tab) =>
    set((state) => ({ canvasOpen: true, canvasTab: tab ?? state.canvasTab })),

  setCanvasTab: (canvasTab) => set({ canvasTab, canvasOpen: true }),

  setCanvasWidth: (canvasWidth) => {
    const width = Math.min(680, Math.max(330, canvasWidth))
    set({ canvasWidth: width })
    try {
      localStorage.setItem('wow:canvas-width', String(width))
    } catch {
      // ignore
    }
  },

  setSettingsOpen: (settingsOpen, section) =>
    set((state) => ({
      settingsOpen,
      settingsSection: section ?? (settingsOpen ? 'general' : state.settingsSection),
      paletteOpen: settingsOpen ? false : state.paletteOpen
    })),

  setSettingsSection: (settingsSection) => set({ settingsSection }),

  setPaletteOpen: (paletteOpen) =>
    set((state) => ({
      paletteOpen,
      settingsOpen: paletteOpen ? false : state.settingsOpen
    })),

  addToast: (level, title, detail) => {
    const id = uid()
    set((state) => ({ toasts: [...state.toasts, { id, level, title, detail }].slice(-4) }))
    setTimeout(() => get().dismissToast(id), 4800)
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}))

/* ------------------------------------------------------------------ */
/* Main-process events                                                 */
/* ------------------------------------------------------------------ */

function handleEvent(event: AppEvent): void {
  const store = useAppStore.getState()
  const session = store.session

  switch (event.type) {
    case 'timeline:add': {
      if (!session || session.id !== event.sessionId) return
      const exists = session.timeline.some((item) => item.id === event.item.id)
      useAppStore.setState({
        session: {
          ...session,
          timeline: exists
            ? session.timeline.map((item) => (item.id === event.item.id ? event.item : item))
            : [...session.timeline, event.item]
        }
      })
      if (event.item.kind === 'approval' && event.item.status === 'pending') {
        store.addToast('warn', '需要审批', event.item.reason)
      }
      if (event.item.kind === 'question' && event.item.status === 'pending') {
        store.addToast('info', 'agent 有一个问题')
      }
      syncDerived(event.sessionId, event.item)
      return
    }
    case 'timeline:update': {
      if (!session || session.id !== event.sessionId) return
      useAppStore.setState({
        session: {
          ...session,
          timeline: session.timeline.map((item) =>
            item.id === event.item.id ? event.item : item
          )
        }
      })
      syncDerived(event.sessionId, event.item)
      return
    }
    case 'timeline:patch': {
      if (!session || session.id !== event.sessionId) return
      useAppStore.setState({
        session: {
          ...session,
          timeline: session.timeline.map((item) =>
            item.id === event.id ? ({ ...item, ...event.patch } as typeof item) : item
          )
        }
      })
      return
    }
    case 'stream': {
      if (!session || session.id !== event.sessionId) return
      useAppStore.setState({
        session: {
          ...session,
          timeline: session.timeline.map((item) => {
            if (item.id !== event.id) return item
            if (item.kind === 'message' || item.kind === 'reasoning') {
              return { ...item, content: item.content + event.delta }
            }
            return item
          })
        }
      })
      return
    }
    case 'session:update': {
      useAppStore.setState({
        sessions: upsertSummary(store.sessions, event.session),
        session:
          session?.id === event.session.id
            ? { ...session, ...event.session }
            : session
      })
      return
    }
    case 'session:removed': {
      const sessions = store.sessions.filter((entry) => entry.id !== event.sessionId)
      useAppStore.setState({ sessions })
      if (session?.id === event.sessionId) {
        useAppStore.setState({ session: null })
        if (sessions.length) void store.openSession(sessions[0].id)
        else void store.createSession()
      }
      return
    }
    case 'run:state': {
      if (!session || session.id !== event.sessionId) return
      useAppStore.setState({ running: event.running })
      if (event.error) store.addToast('error', '运行失败', event.error)
      return
    }
    case 'tasks:update':
      useAppStore.setState({ tasks: event.tasks })
      return
    case 'settings:update':
      useAppStore.setState({ settings: event.settings })
      return
    case 'library:update':
      useAppStore.setState({ library: event.items })
      return
    case 'notice':
      store.addToast(event.notice.level, event.notice.title, event.notice.detail)
      return
  }
}

/** Mirror todo/changes cards into the session fields the canvas reads. */
function syncDerived(sessionId: string, item: TimelineItem): void {
  const state = useAppStore.getState()
  if (state.session?.id !== sessionId) return
  if (item.kind === 'todo') {
    useAppStore.setState({ session: { ...state.session, todos: item.todos } })
  }
  if (item.kind === 'changes') {
    void api.changes
      .list(sessionId)
      .then((changes) => {
        const current = useAppStore.getState().session
        if (current?.id === sessionId) {
          useAppStore.setState({ session: { ...current, changes } })
        }
      })
      .catch(() => undefined)
  }
}
