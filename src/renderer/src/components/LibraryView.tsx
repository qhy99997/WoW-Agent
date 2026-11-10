import { useMemo, useState } from 'react'
import {
  Boxes,
  File,
  FileText,
  Globe,
  Library,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react'
import type { LibraryItem } from '@shared/types'
import { relativeTime } from '@shared/utils'
import { useAppStore } from '../store/app'
import { CopyButton, Markdown } from './Markdown'

const KIND_ICON = {
  note: FileText,
  file: File,
  artifact: Boxes,
  link: Globe
}

const KIND_LABEL: Record<string, string> = {
  note: '笔记',
  file: '文件',
  artifact: '产物',
  link: '链接'
}

export function LibraryView() {
  const library = useAppStore((state) => state.library)
  const addLibraryItem = useAppStore((state) => state.addLibraryItem)
  const removeLibraryItem = useAppStore((state) => state.removeLibraryItem)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<LibraryItem | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ title: '', tags: '', content: '' })

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return library
    return library.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.excerpt.toLowerCase().includes(q) ||
        item.tags.some((tag) => tag.toLowerCase().includes(q))
    )
  }, [library, query])

  const saveNote = async (): Promise<void> => {
    if (!form.title.trim() || !form.content.trim()) return
    await addLibraryItem({
      title: form.title,
      kind: 'note',
      content: form.content,
      tags: form.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    })
    setForm({ title: '', tags: '', content: '' })
    setCreating(false)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <div className="page-eyebrow">
            <Library size={12} /> 知识
          </div>
          <h1 className="page-title">资料库</h1>
          <p className="page-sub">
            agent 可在不同任务间复用的笔记、简报和成品。
          </p>
        </div>
        <div className="page-actions">
          <div className="page-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索资料库…"
            />
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14} /> 新建笔记
          </button>
        </div>
      </header>

      <div className="page-scroll">
        {filtered.length ? (
          <div className="library-grid">
            {filtered.map((item) => {
              const Icon = KIND_ICON[item.kind]
              return (
                <button
                  key={item.id}
                  className="library-card animate-rise"
                  onClick={() => setSelected(item)}
                >
                  <div className="library-card-top">
                    <span className={`library-kind ${item.kind}`}>
                      <Icon size={14} />
                    </span>
                    <span className="library-date">{relativeTime(item.updatedAt)}</span>
                  </div>
                  <span className="library-title">{item.title}</span>
                  <span className="library-excerpt">{item.excerpt || '暂无预览'}</span>
                  <div className="library-tags">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="page-empty">
            <Library size={28} />
            <strong>{query ? '没有匹配结果' : '资料库为空'}</strong>
            <span>
              {query
                ? '换个关键词试试。'
                : '从画布中保存文件，或让 agent 存入一篇完成的笔记。'}
            </span>
          </div>
        )}
      </div>

      {selected ? (
        <div className="modal-backdrop" onMouseDown={() => setSelected(null)}>
          <div className="modal library-detail" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <span className="eyebrow">{KIND_LABEL[selected.kind] ?? selected.kind}</span>
                <h2>{selected.title}</h2>
                <div className="modal-sub">
                  更新于 {relativeTime(selected.updatedAt)}
                  {selected.sourcePath ? ` · ${selected.sourcePath}` : ''}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setSelected(null)} title="关闭">
                <X size={16} />
              </button>
            </header>
            <div className="library-detail-body">
              <Markdown>{selected.content}</Markdown>
            </div>
            <footer className="modal-foot">
              <button
                className="btn btn-danger btn-sm"
                onClick={() => {
                  if (window.confirm(`从资料库中移除“${selected.title}”？`)) {
                    void removeLibraryItem(selected.id)
                    setSelected(null)
                  }
                }}
              >
                <Trash2 size={13} /> 移除
              </button>
              <div className="spacer" />
              <CopyButton text={selected.content} label="复制" />
            </footer>
          </div>
        </div>
      ) : null}

      {creating ? (
        <div className="modal-backdrop" onMouseDown={() => setCreating(false)}>
          <div className="modal note-modal" onMouseDown={(event) => event.stopPropagation()}>
            <header className="modal-head">
              <div>
                <span className="eyebrow">新建笔记</span>
                <h2>添加到资料库</h2>
              </div>
              <button className="icon-btn" onClick={() => setCreating(false)} title="关闭">
                <X size={16} />
              </button>
            </header>
            <div className="note-form">
              <label>
                <span>标题</span>
                <input
                  className="input"
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="产品发布简报"
                  autoFocus
                />
              </label>
              <label>
                <span>标签</span>
                <input
                  className="input"
                  value={form.tags}
                  onChange={(event) => setForm({ ...form, tags: event.target.value })}
                  placeholder="产品, 简报"
                />
              </label>
              <label>
                <span>内容</span>
                <textarea
                  className="textarea"
                  rows={10}
                  value={form.content}
                  onChange={(event) => setForm({ ...form, content: event.target.value })}
                  placeholder="支持 Markdown…"
                />
              </label>
            </div>
            <footer className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setCreating(false)}>
                取消
              </button>
              <div className="spacer" />
              <button
                className="btn btn-primary"
                disabled={!form.title.trim() || !form.content.trim()}
                onClick={() => void saveNote()}
              >
                <Plus size={14} /> 保存笔记
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  )
}
