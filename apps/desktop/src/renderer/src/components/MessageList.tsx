import { memo, useState, type RefObject } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { TranscriptEntry } from '@shared/contract';

interface MessageListProps {
  entries: TranscriptEntry[];
  bottomRef: RefObject<HTMLDivElement | null>;
}

export function MessageList({ entries, bottomRef }: MessageListProps): React.JSX.Element {
  return (
    <div className="wow-scroll min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 py-8">
        {entries.map((entry) => (
          <Message key={entry.id} entry={entry} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

const Message = memo(function Message({ entry }: { entry: TranscriptEntry }): React.JSX.Element {
  if (entry.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-card bg-surface-raised px-4 py-2.5 text-[14px] whitespace-pre-wrap">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.role === 'tool') {
    return <ToolCall name={entry.text} />;
  }

  if (entry.kind === 'error') {
    return (
      <div className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger">
        {entry.text}
      </div>
    );
  }

  if (entry.kind === 'notice') {
    return <p className="text-[12px] text-ink-subtle">{entry.text}</p>;
  }

  if (entry.kind === 'thinking') {
    return (
      <details className="group">
        <summary className="cursor-pointer list-none text-[12px] text-ink-subtle transition-colors hover:text-ink-muted">
          思考过程
        </summary>
        <div className="mt-2 border-l border-hairline pl-3 text-[13px] whitespace-pre-wrap text-ink-muted">
          {entry.text}
        </div>
      </details>
    );
  }

  return <MarkdownText text={entry.text} />;
});

function ToolCall({ name }: { name: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-[12px] text-ink-subtle">
      <span className="inline-block size-1.5 rounded-full bg-accent" />
      <span className="font-mono">{name}</span>
    </div>
  );
}

function MarkdownText({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="text-[14px] leading-[1.65] text-ink">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          h1: ({ children }) => (
            <h1 className="mt-4 mb-2 text-[18px] font-medium first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 mb-2 text-[16px] font-medium first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-3 mb-1.5 text-[15px] font-medium first:mt-0">{children}</h3>
          ),
          a: ({ href, children }) => {
            // Only http(s) links are navigable: model output must never be able
            // to reach `file://`, `javascript:` or other privileged schemes.
            const safe = href !== undefined && /^https?:\/\//i.test(href);
            if (!safe) return <span className="text-ink-muted">{children}</span>;
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
              >
                {children}
              </a>
            );
          },
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-hairline pl-3 text-ink-muted">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-hairline" />,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-hairline px-2 py-1.5 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border-b border-hairline/60 px-2 py-1.5">{children}</td>,
          code: ({ className, children }) => {
            const parts = Array.isArray(children) ? children : [children];
            const text = parts
              .map((part) => (typeof part === 'string' || typeof part === 'number' ? `${part}` : ''))
              .join('')
              .replace(/\n$/, '');
            const fenced = className !== undefined || text.includes('\n');
            if (fenced) return <CodeBlock code={text} />;
            return (
              <code className="rounded-[5px] bg-surface-raised px-1.5 py-0.5 font-mono text-[12.5px]">
                {text}
              </code>
            );
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}

function CodeBlock({ code }: { code: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const copy = (): void => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1400);
    });
  };

  return (
    <div className="group relative my-3">
      <pre className="wow-scroll overflow-x-auto rounded-control border border-hairline bg-surface px-3 py-2.5">
        <code className="font-mono text-[12.5px] leading-[1.6]">{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="absolute top-2 right-2 rounded-[6px] border border-hairline bg-surface-raised px-1.5 py-0.5 text-[10px] text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink"
      >
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  );
}
