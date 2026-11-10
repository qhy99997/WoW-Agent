import { useState } from 'react'
import {
  ArrowLeft,
  ExternalLink,
  FileCode,
  FileImage,
  FolderOpen,
  RefreshCw,
  Save,
  Search
} from 'lucide-react'
import { formatBytes } from '@shared/utils'
import { api } from '../lib/bridge'
import { useAppStore } from '../store/app'
import { CodeBlock } from './CodeBlock'
import { FileTree } from './FileTree'
import { Markdown } from './Markdown'

function baseName(path?: string): string {
  if (!path) return '工作区'
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function FilesPanel() {
  const session = useAppStore((state) => state.session)
  const fileTree = useAppStore((state) => state.fileTree)
  const treeLoading = useAppStore((state) => state.treeLoading)
  const preview = useAppStore((state) => state.preview)
  const previewLoading = useAppStore((state) => state.previewLoading)
  const selectedPath = useAppStore((state) => state.selectedPath)
  const refreshTree = useAppStore((state) => state.refreshTree)
  const previewFile = useAppStore((state) => state.previewFile)
  const clearPreview = useAppStore((state) => state.clearPreview)
  const savePreviewToLibrary = useAppStore((state) => state.savePreviewToLibrary)
  const [query, setQuery] = useState('')

  if (preview || previewLoading) {
    return (
      <div className="files-panel preview-pane">
        <div className="preview-head">
          <button className="icon-btn sm" onClick={clearPreview} title="返回文件列表">
            <ArrowLeft size={14} />
          </button>
          <div className="preview-title">
            <span className="truncate">{preview?.name ?? '加载中…'}</span>
            {preview ? (
              <span className="faint">
                {formatBytes(preview.size)} · {preview.language}
              </span>
            ) : null}
          </div>
          {preview ? (
            <div className="preview-actions">
              {['text', 'markdown', 'html'].includes(preview.kind) ? (
                <button
                  className="icon-btn sm"
                  title="保存到资料库"
                  onClick={() => void savePreviewToLibrary()}
                >
                  <Save size={13} />
                </button>
              ) : null}
              <button
                className="icon-btn sm"
                title="用默认应用打开"
                onClick={() => void api.app.openPath(preview.path)}
              >
                <ExternalLink size={13} />
              </button>
            </div>
          ) : null}
        </div>

        {previewLoading ? (
          <div className="panel-loading">
            <span className="spinner" /> 正在读取文件…
          </div>
        ) : preview ? (
          <div className="preview-body">
            {preview.truncated ? (
              <div className="preview-warning">仅显示此文件的前 2 MB。</div>
            ) : null}
            {preview.kind === 'image' ? (
              <div className="preview-image-wrap">
                <img src={preview.content} alt={preview.name} />
              </div>
            ) : preview.kind === 'pdf' ? (
              <div className="panel-empty">
                <FileImage size={26} />
                <strong>PDF 文档</strong>
                <span>在默认查看器中打开。</span>
                <button className="btn btn-sm" onClick={() => void api.app.openPath(preview.path)}>
                  <ExternalLink size={13} /> 打开 PDF
                </button>
              </div>
            ) : preview.kind === 'binary' ? (
              <div className="panel-empty">
                <FileCode size={26} />
                <strong>二进制文件</strong>
                <span>此文件无法以文本形式显示。</span>
                <button className="btn btn-sm" onClick={() => void api.app.openPath(preview.path)}>
                  <ExternalLink size={13} /> 打开文件
                </button>
              </div>
            ) : preview.kind === 'markdown' ? (
              <div className="preview-markdown">
                <Markdown>{preview.content}</Markdown>
              </div>
            ) : preview.kind === 'html' ? (
              <div className="stack">
                <div className="preview-html-bar">
                  <span className="faint">渲染预览会在浏览器中打开。</span>
                  <button className="btn btn-sm" onClick={() => void api.app.openPath(preview.path)}>
                    <ExternalLink size={13} /> 打开
                  </button>
                </div>
                <CodeBlock code={preview.content} language="html" filename={preview.name} />
              </div>
            ) : (
              <CodeBlock
                code={preview.content}
                language={preview.language}
                filename={preview.name}
                maxHeight={600}
              />
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="files-panel">
      <div className="files-toolbar">
        <div className="files-root">
          <FolderOpen size={13} />
          <span className="truncate">{baseName(session?.workspace)}</span>
        </div>
        <div className="files-actions">
          <div className="tree-search">
            <Search size={12} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="筛选"
              aria-label="筛选文件"
            />
          </div>
          <button
            className="icon-btn sm"
            onClick={() => void refreshTree()}
            title="刷新文件"
          >
            <RefreshCw size={13} className={treeLoading ? 'spin' : ''} />
          </button>
        </div>
      </div>
      {treeLoading && !fileTree.length ? (
        <div className="panel-loading">
          <span className="spinner" /> 正在读取工作区…
        </div>
      ) : (
        <FileTree
          nodes={fileTree}
          selected={selectedPath}
          onSelect={(node) => void previewFile(node)}
          query={query}
        />
      )}
    </div>
  )
}
