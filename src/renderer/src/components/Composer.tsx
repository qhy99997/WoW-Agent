import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  Cpu,
  FileText,
  Image as ImageIcon,
  Library,
  Map,
  Paperclip,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Slash,
  Sparkles,
  Square,
  X,
  Zap
} from 'lucide-react'
import type { Attachment, PermissionMode } from '@shared/types'
import { WORKFLOWS, getWorkflow } from '@shared/workflows'
import { formatBytes } from '@shared/utils'
import { api } from '../lib/bridge'
import { WORKFLOW_ICONS } from '../lib/workflowIcons'
import { useAppStore } from '../store/app'

const MODE_META: Record<
  PermissionMode,
  { label: string; description: string; icon: typeof ShieldCheck }
> = {
  ask: {
    label: '询问',
    description: '只读工具自动运行；写入文件和命令需要你批准。',
    icon: ShieldCheck
  },
  auto: {
    label: '自动',
    description: '本任务内所有操作自动批准。仅在可信文件夹中使用。',
    icon: Zap
  },
  plan: {
    label: '计划',
    description: '只读。agent 会先调查并提交计划供你批准。',
    icon: Map
  }
}

const SLASH = [
  { command: 'plan', label: '计划模式', hint: '先调查，再提出方案', icon: Map },
  { command: 'ask', label: '询问模式', hint: '手动批准写入', icon: ShieldCheck },
  { command: 'auto', label: '自动模式', hint: '批准所有操作', icon: Zap },
  { command: 'compact', label: '压缩上下文', hint: '总结较早的对话', icon: Archive },
  { command: 'model', label: '选择模型', hint: '切换供应商或模型', icon: Cpu },
  { command: 'new', label: '新建任务', hint: '开始一个新会话', icon: Plus },
  { command: 'skills', label: '技能', hint: '浏览指令包', icon: BookOpen },
  { command: 'library', label: '资料库', hint: '已保存的笔记和产物', icon: Library },
  { command: 'revert', label: '撤销上一轮', hint: '恢复上一轮的文件', icon: RotateCcw }
]

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function isTextFile(file: File): boolean {
  if (file.type.startsWith('text/')) return true
  if (/json|xml|javascript|typescript|yaml|markdown/.test(file.type)) return true
  return /\.(md|mdx|txt|json|jsonc|ts|tsx|js|jsx|css|scss|html|htm|yml|yaml|toml|py|rb|go|rs|java|c|cpp|h|hpp|cs|sql|csv|tsv|log|sh|ps1)$/i.test(
    file.name
  )
}

export function Composer() {
  const session = useAppStore((state) => state.session)
  const settings = useAppStore((state) => state.settings)
  const running = useAppStore((state) => state.running)
  const draft = useAppStore((state) => state.draft)
  const workflowId = useAppStore((state) => state.workflowId)
  const seedNonce = useAppStore((state) => state.seedNonce)
  const setDraft = useAppStore((state) => state.setDraft)
  const setWorkflow = useAppStore((state) => state.setWorkflow)
  const send = useAppStore((state) => state.send)
  const stop = useAppStore((state) => state.stop)
  const setMode = useAppStore((state) => state.setMode)
  const setModel = useAppStore((state) => state.setModel)
  const compact = useAppStore((state) => state.compact)
  const createSession = useAppStore((state) => state.createSession)
  const setView = useAppStore((state) => state.setView)
  const revertTurn = useAppStore((state) => state.revertTurn)
  const setSettingsOpen = useAppStore((state) => state.setSettingsOpen)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [menu, setMenu] = useState<'workflow' | 'model' | 'mode' | null>(null)
  const [dragging, setDragging] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)

  const workflow = getWorkflow(workflowId ?? undefined)
  const mode = session?.permissionMode ?? 'ask'
  const ModeIcon = MODE_META[mode].icon
  const provider = settings?.providers.find((entry) => entry.id === session?.model.providerId)
  const shortModel = session?.model.model.split('/').pop() ?? 'Model'

  const slashMatch = /^\/(\w*)$/.exec(draft)
  const slashItems = useMemo(() => {
    if (!slashMatch) return []
    const query = slashMatch[1].toLowerCase()
    return SLASH.filter(
      (item) =>
        item.command.startsWith(query) ||
        item.label.toLowerCase().includes(query) ||
        item.hint.toLowerCase().includes(query)
    )
  }, [draft, slashMatch])
  const slashOpen = Boolean(slashMatch) && slashItems.length > 0

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${Math.min(220, Math.max(52, el.scrollHeight))}px`
  }, [draft])

  useEffect(() => {
    if (seedNonce > 0) {
      const el = textareaRef.current
      el?.focus()
      const length = el?.value.length ?? 0
      el?.setSelectionRange(length, length)
    }
  }, [seedNonce])

  useEffect(() => {
    setSlashIndex(0)
  }, [draft])

  const addFiles = async (files: File[]): Promise<void> => {
    const room = 8 - attachments.length
    const selected = files.slice(0, Math.max(0, room))
    const next: Attachment[] = []
    for (const file of selected) {
      const id = crypto.randomUUID()
      const mime = file.type || 'application/octet-stream'
      const base: Attachment = {
        id,
        name: file.name,
        mime,
        size: file.size,
        kind: mime.startsWith('image/') ? 'image' : isTextFile(file) ? 'text' : 'file'
      }
      try {
        if (base.kind === 'image' && file.size <= 10_000_000) {
          base.dataUrl = await readAsDataUrl(file)
        } else if (base.kind === 'text' && file.size <= 300_000) {
          base.text = await file.text()
        }
      } catch {
        // keep metadata if reading fails
      }
      next.push(base)
    }
    setAttachments((current) => [...current, ...next])
  }

  const executeSlash = (command: string): void => {
    setDraft('')
    setMenu(null)
    switch (command) {
      case 'plan':
      case 'ask':
      case 'auto':
        void setMode(command)
        break
      case 'compact':
        void compact()
        break
      case 'model':
        setMenu('model')
        break
      case 'new':
        void createSession()
        break
      case 'skills':
        setView('skills')
        break
      case 'library':
        setView('library')
        break
      case 'revert': {
        const lastTurn = [...(session?.changes ?? [])]
          .reverse()
          .find((change) => !change.reverted)?.turnId
        if (lastTurn) void revertTurn(lastTurn)
        break
      }
    }
  }

  const submit = (): void => {
    if (running) {
      void stop()
      return
    }
    if (!draft.trim() && !attachments.length) return
    void send(draft, attachments)
    setAttachments([])
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (slashOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSlashIndex((index) => (index + 1) % slashItems.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSlashIndex((index) => (index - 1 + slashItems.length) % slashItems.length)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        const item = slashItems[slashIndex]
        if (item) executeSlash(item.command)
        return
      }
      if (event.key === 'Escape') {
        setDraft('')
        return
      }
    }
    const sendOnEnter = settings?.sendOnEnter ?? true
    if (event.key === 'Enter') {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        submit()
        return
      }
      if (sendOnEnter && !event.shiftKey) {
        event.preventDefault()
        submit()
      }
    }
  }

  const modeMeta = MODE_META[mode]

  return (
    <div className="composer-wrap">
      <div
        className={`composer ${dragging ? 'dragging' : ''} ${running ? 'is-running' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (event.dataTransfer.files.length) void addFiles([...event.dataTransfer.files])
        }}
      >
        {dragging ? (
          <div className="composer-drop">
            <Paperclip size={18} />
            拖放文件以添加附件
          </div>
        ) : null}

        {attachments.length ? (
          <div className="attachment-strip">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="attachment-pill">
                {attachment.kind === 'image' && attachment.dataUrl ? (
                  <img src={attachment.dataUrl} alt="" className="attachment-thumb" />
                ) : attachment.kind === 'text' ? (
                  <FileText size={13} />
                ) : (
                  <ImageIcon size={13} />
                )}
                <span className="attachment-name truncate">{attachment.name}</span>
                <span className="attachment-size">{formatBytes(attachment.size)}</span>
                <button
                  className="attachment-remove"
                  title="移除"
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((entry) => entry.id !== attachment.id)
                    )
                  }
                >
                  <X size={11} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          className="composer-input"
          value={draft}
          rows={1}
          aria-label="给 WoW Agent 发消息"
          placeholder={
            running
              ? 'agent 正在工作，你可以先起草下一条消息…'
              : workflow
                ? `描述${workflow.name}任务…`
                : '让 WoW Agent 构建、审查、研究或修复…'
          }
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            const files = [...event.clipboardData.files]
            if (files.length) {
              event.preventDefault()
              void addFiles(files)
            }
          }}
          spellCheck={false}
        />

        <div className="composer-toolbar">
          <div className="composer-tools">
            <div className="menu-anchor">
              <button
                className={`composer-chip ${workflow ? 'accent' : ''}`}
                onClick={() => setMenu(menu === 'workflow' ? null : 'workflow')}
                title="工作流"
              >
                <Sparkles size={13} />
                <span className="chip-label">{workflow?.name ?? '工作流'}</span>
                <ChevronDown size={11} />
              </button>
              {menu === 'workflow' ? (
                <>
                  <div className="menu-scrim" onClick={() => setMenu(null)} />
                  <div className="composer-menu workflow-menu animate-pop">
                    <div className="composer-menu-head">
                      <span className="eyebrow">工作流</span>
                      {workflow ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            setWorkflow(null)
                            setMenu(null)
                          }}
                        >
                          清除
                        </button>
                      ) : null}
                    </div>
                    <button
                      className={`composer-menu-item ${!workflow ? 'active' : ''}`}
                      onClick={() => {
                        setWorkflow(null)
                        setMenu(null)
                      }}
                    >
                      <span className="menu-item-icon">
                        <Slash size={14} />
                      </span>
                      <span className="menu-item-copy">
                        <span>不使用工作流</span>
                        <span className="faint">自由任务</span>
                      </span>
                      {!workflow ? <Check size={13} /> : null}
                    </button>
                    {WORKFLOWS.map((entry) => {
                      const Icon = WORKFLOW_ICONS[entry.icon]
                      return (
                        <button
                          key={entry.id}
                          className={`composer-menu-item ${workflow?.id === entry.id ? 'active' : ''}`}
                          onClick={() => {
                            setWorkflow(entry.id)
                            if (!draft.trim()) setDraft(entry.prompt)
                            if (entry.id === 'plan') void setMode('plan')
                            setMenu(null)
                            textareaRef.current?.focus()
                          }}
                        >
                          <span className={`menu-item-icon tint-${entry.tint}`}>
                            <Icon size={14} />
                          </span>
                          <span className="menu-item-copy">
                            <span>{entry.name}</span>
                            <span className="faint">{entry.tagline}</span>
                          </span>
                          {workflow?.id === entry.id ? <Check size={13} /> : null}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </div>

            <div className="menu-anchor">
              <button
                className="composer-chip"
                onClick={() => setMenu(menu === 'model' ? null : 'model')}
                title={`${provider?.name ?? '未配置供应商'} · ${session?.model.model ?? ''}`}
              >
                <Cpu size={13} />
                <span className="chip-label truncate">{shortModel}</span>
                <ChevronDown size={11} />
              </button>
              {menu === 'model' ? (
                <>
                  <div className="menu-scrim" onClick={() => setMenu(null)} />
                  <div className="composer-menu model-menu animate-pop">
                    <div className="composer-menu-head">
                      <span className="eyebrow">模型</span>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setMenu(null)
                          setSettingsOpen(true, 'models')
                        }}
                      >
                        <Settings2 size={12} /> 管理
                      </button>
                    </div>
                    {settings?.providers
                      .filter((entry) => entry.enabled)
                      .map((entry) => (
                        <div key={entry.id} className="model-group">
                          <div className="model-group-head">
                            <span>{entry.name}</span>
                            {!entry.apiKeySet && entry.kind !== 'mock' ? (
                              <span className="model-need-key">需要密钥</span>
                            ) : null}
                          </div>
                          {entry.models.map((model) => {
                            const active =
                              session?.model.providerId === entry.id &&
                              session?.model.model === model
                            return (
                              <button
                                key={model}
                                className={`composer-menu-item ${active ? 'active' : ''}`}
                                onClick={() => {
                                  void setModel({ providerId: entry.id, model })
                                  setMenu(null)
                                }}
                              >
                                <span className="menu-item-copy">
                                  <span className="mono">{model}</span>
                                </span>
                                {active ? <Check size={13} /> : null}
                              </button>
                            )
                          })}
                        </div>
                      ))}
                    {!settings?.providers.some((entry) => entry.enabled && entry.models.length) ? (
                      <div className="composer-menu-empty">
                        尚未配置模型。请在设置中添加供应商。
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className="menu-anchor">
              <button
                className={`composer-chip mode-${mode}`}
                onClick={() => setMenu(menu === 'mode' ? null : 'mode')}
                title={modeMeta.description}
              >
                <ModeIcon size={13} />
                <span className="chip-label">{modeMeta.label}</span>
                <ChevronDown size={11} />
              </button>
              {menu === 'mode' ? (
                <>
                  <div className="menu-scrim" onClick={() => setMenu(null)} />
                  <div className="composer-menu mode-menu animate-pop">
                    <div className="composer-menu-head">
                      <span className="eyebrow">权限模式</span>
                    </div>
                    {(Object.keys(MODE_META) as PermissionMode[]).map((key) => {
                      const meta = MODE_META[key]
                      const Icon = meta.icon
                      return (
                        <button
                          key={key}
                          className={`composer-menu-item ${mode === key ? 'active' : ''}`}
                          onClick={() => {
                            void setMode(key)
                            setMenu(null)
                          }}
                        >
                          <span className="menu-item-icon">
                            <Icon size={14} />
                          </span>
                          <span className="menu-item-copy">
                            <span>{meta.label}</span>
                            <span className="faint">{meta.description}</span>
                          </span>
                          {mode === key ? <Check size={13} /> : null}
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="composer-actions">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) void addFiles([...event.target.files])
                event.target.value = ''
              }}
            />
            <button
              className="icon-btn"
              title="添加附件"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={15} />
            </button>
            <button
              className={`send-btn ${running ? 'stop' : ''}`}
              title={running ? '停止 (Esc)' : '发送 (Enter)'}
              onClick={submit}
              disabled={!running && !draft.trim() && !attachments.length}
            >
              {running ? <Square size={13} fill="currentColor" /> : <ArrowUp size={17} />}
            </button>
          </div>
        </div>

        {slashOpen ? (
          <>
            <div className="menu-scrim" onClick={() => setDraft('')} />
            <div className="slash-menu animate-pop">
              <div className="slash-head">
                <Slash size={12} />
                <span>命令</span>
              </div>
              {slashItems.map((item, index) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.command}
                    className={`slash-item ${index === slashIndex ? 'active' : ''}`}
                    onMouseEnter={() => setSlashIndex(index)}
                    onClick={() => executeSlash(item.command)}
                  >
                    <Icon size={14} />
                    <span className="slash-command mono">/{item.command}</span>
                    <span className="slash-label">{item.label}</span>
                    <span className="slash-hint faint">{item.hint}</span>
                  </button>
                )
              })}
            </div>
          </>
        ) : null}
      </div>

      <div className="composer-hint">
        {running ? (
          <span className="hint-running">
            <span className="spinner" /> 运行中 — 按停止取消
          </span>
        ) : (
          <span>
            <kbd>{settings?.sendOnEnter ? 'Enter' : 'Ctrl Enter'}</kbd> 发送
            <span className="hint-sep">·</span>
            <kbd>Shift Enter</kbd> 换行
            <span className="hint-sep">·</span>
            <span>输入 <kbd>/</kbd> 查看命令</span>
          </span>
        )}
        <span className="composer-security">
          <ShieldCheck size={12} /> 文件保留在本地 · 操作需审批
        </span>
      </div>
    </div>
  )
}
