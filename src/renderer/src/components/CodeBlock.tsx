import { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import hljs from 'highlight.js/lib/common'

const ALIASES: Record<string, string> = {
  tsx: 'typescript',
  jsx: 'javascript',
  ts: 'typescript',
  js: 'javascript',
  md: 'markdown',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  yml: 'yaml',
  jsonc: 'json',
  ps1: 'powershell',
  htm: 'xml',
  svg: 'xml',
  csharp: 'csharp',
  'c++': 'cpp'
}

export function highlightCode(code: string, language?: string): string {
  const lang = language ? ALIASES[language.toLowerCase()] ?? language.toLowerCase() : ''
  try {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    }
  } catch {
    // fall through to auto
  }
  try {
    return hljs.highlightAuto(code).value
  } catch {
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
}

export function CodeBlock({
  code,
  language = 'text',
  filename,
  maxHeight
}: {
  code: string
  language?: string
  filename?: string
  maxHeight?: number
}): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const html = useMemo(() => highlightCode(code, language), [code, language])

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // clipboard may be unavailable
    }
  }

  return (
    <div className="codeblock">
      <div className="codeblock-head">
        <span className="mono faint">{filename ?? language}</span>
        <button className="icon-btn sm" onClick={copy} title="复制代码" aria-label="复制代码">
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre style={maxHeight ? { maxHeight } : undefined}>
        <code
          className={`hljs language-${language}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  )
}
