import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface Line {
  type: 'add' | 'del' | 'context' | 'hunk' | 'meta'
  text: string
}

function parsePatch(patch: string): Line[] {
  return patch.split('\n').map((text) => {
    if (text.startsWith('+++') || text.startsWith('---') || text.startsWith('Index:')) {
      return { type: 'meta', text }
    }
    if (text.startsWith('@@')) return { type: 'hunk', text }
    if (text.startsWith('+')) return { type: 'add', text }
    if (text.startsWith('-')) return { type: 'del', text }
    return { type: 'context', text }
  })
}

export function DiffView({
  patch,
  path,
  additions,
  deletions,
  maxHeight = 420,
  compact = false
}: {
  patch: string
  path?: string
  additions?: number
  deletions?: number
  maxHeight?: number
  compact?: boolean
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const lines = useMemo(() => parsePatch(patch), [patch])

  return (
    <div className={`diff ${compact ? 'diff-compact' : ''}`}>
      <div className="diff-head">
        <div className="row" style={{ minWidth: 0 }}>
          {path ? <span className="mono truncate">{path}</span> : null}
          <span className="diff-stat add">+{additions ?? 0}</span>
          <span className="diff-stat del">−{deletions ?? 0}</span>
        </div>
        <button
          className="icon-btn sm"
          title="复制补丁"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(patch)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              // ignore
            }
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>
      <div className="diff-body" style={{ maxHeight }}>
        <pre>
          {lines.map((line, index) => (
            <div key={index} className={`diff-line ${line.type}`}>
              <span className="diff-sign">
                {line.type === 'add' ? '+' : line.type === 'del' ? '−' : ' '}
              </span>
              <span className="diff-text">{line.text || ' '}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}
