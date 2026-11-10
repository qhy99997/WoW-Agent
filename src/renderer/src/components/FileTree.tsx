import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  File,
  FileCode,
  FileImage,
  FileJson,
  FileText,
  Folder,
  FolderOpen
} from 'lucide-react'
import type { FileNode } from '@shared/types'

function iconFor(name: string) {
  if (/\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)$/i.test(name)) return FileImage
  if (/\.(json|jsonc)$/i.test(name)) return FileJson
  if (/\.(ts|tsx|js|jsx|css|scss|html|py|rs|go|java|c|cpp|cs|sh|ps1|vue|svelte)$/i.test(name))
    return FileCode
  if (/\.(md|mdx|txt|csv|tsv|log|yml|yaml|toml|ini)$/i.test(name)) return FileText
  return File
}

function filterTree(nodes: FileNode[], query: string): FileNode[] {
  const q = query.toLowerCase()
  if (!q) return nodes
  const result: FileNode[] = []
  for (const node of nodes) {
    if (node.type === 'file') {
      if (node.name.toLowerCase().includes(q)) result.push(node)
    } else {
      const children = filterTree(node.children ?? [], query)
      if (children.length || node.name.toLowerCase().includes(q)) {
        result.push({ ...node, children })
      }
    }
  }
  return result
}

function TreeRow({
  node,
  depth,
  expanded,
  toggle,
  selected,
  onSelect
}: {
  node: FileNode
  depth: number
  expanded: Set<string>
  toggle: (path: string) => void
  selected: string | null
  onSelect: (node: FileNode) => void
}) {
  const isOpen = expanded.has(node.path)
  const Icon = node.type === 'dir' ? (isOpen ? FolderOpen : Folder) : iconFor(node.name)
  return (
    <div className="tree-branch">
      <button
        className={`tree-row ${selected === node.path ? 'active' : ''} ${node.type}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => (node.type === 'dir' ? toggle(node.path) : onSelect(node))}
        title={node.path}
      >
        {node.type === 'dir' ? (
          <ChevronRight size={12} className={`tree-chevron ${isOpen ? 'open' : ''}`} />
        ) : (
          <span className="tree-spacer" />
        )}
        <Icon size={13} className={`tree-icon ${node.type}`} />
        <span className="tree-name truncate">{node.name}</span>
        {node.type === 'dir' ? (
          <span className="tree-count">{node.children?.length ?? 0}</span>
        ) : null}
      </button>
      {node.type === 'dir' && isOpen
        ? (node.children ?? []).map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              selected={selected}
              onSelect={onSelect}
            />
          ))
        : null}
    </div>
  )
}

export function FileTree({
  nodes,
  selected,
  onSelect,
  query = ''
}: {
  nodes: FileNode[]
  selected: string | null
  onSelect: (node: FileNode) => void
  query?: string
}) {
  const filtered = useMemo(() => filterTree(nodes, query), [nodes, query])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    setExpanded((current) => {
      if (current.size) return current
      const roots = nodes.filter((node) => node.type === 'dir').map((node) => node.path)
      return new Set(roots)
    })
  }, [nodes])

  const toggle = (path: string): void => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (!filtered.length) {
    return (
      <div className="tree-empty">
        {query ? `没有匹配“${query}”的文件。` : '此文件夹为空。'}
      </div>
    )
  }

  return (
    <div className="file-tree">
      {filtered.map((node) => (
        <TreeRow
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
