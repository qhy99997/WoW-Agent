import type { RefObject } from 'react';

import type { TranscriptEntry } from '@shared/contract.js';

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

function Message({ entry }: { entry: TranscriptEntry }): React.JSX.Element {
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
    return (
      <div className="flex items-center gap-2 text-[12px] text-ink-subtle">
        <span className="inline-block size-1.5 rounded-full bg-accent" />
        <span className="font-mono">{entry.text}</span>
      </div>
    );
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

  return (
    <div className="text-[14px] leading-[1.65] whitespace-pre-wrap text-ink">{entry.text}</div>
  );
}
