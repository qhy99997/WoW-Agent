import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { api } from '../lib/bridge'
import { CodeBlock } from './CodeBlock'

export function Markdown({ children }: { children: string }): React.JSX.Element {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const text = String(children).replace(/\n$/, '')
            const match = /language-([\w+#-]+)/.exec(className ?? '')
            const isBlock = Boolean(match) || text.includes('\n')
            if (!isBlock) {
              return <code className="inline-code">{children}</code>
            }
            return <CodeBlock code={text} language={match?.[1] ?? 'text'} />
          },
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault()
                if (href && /^https?:\/\//i.test(href)) void api.app.openExternal(href)
              }}
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="md-table-wrap">
              <table>{children}</table>
            </div>
          ),
          input: ({ node: _node, ...props }) => <input {...props} disabled />
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

export function CopyButton({
  text,
  label = '复制'
}: {
  text: string
  label?: string
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // ignore
        }
      }}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? '已复制' : label}
    </button>
  )
}
