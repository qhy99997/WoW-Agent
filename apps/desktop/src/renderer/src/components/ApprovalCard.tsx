import type { ApprovalRequest } from '@shared/contract.js';

interface ApprovalCardProps {
  request: ApprovalRequest;
  onRespond(optionId: string): void;
}

export function ApprovalCard({ request, onRespond }: ApprovalCardProps): React.JSX.Element {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-3">
      <div className="rounded-card border border-accent/40 bg-accent-soft/30 p-4">
        <p className="text-[13px] font-medium text-ink">{request.title}</p>
        {request.detail !== undefined && (
          <pre className="wow-scroll mt-2 max-h-40 overflow-auto rounded-control bg-canvas/60 p-2 font-mono text-[12px] whitespace-pre-wrap text-ink-muted">
            {request.detail}
          </pre>
        )}
        {request.diff !== undefined && (
          <pre className="wow-scroll mt-2 max-h-48 overflow-auto rounded-control bg-canvas/60 p-2 font-mono text-[12px] whitespace-pre-wrap text-ink-muted">
            {request.diff}
          </pre>
        )}
        <div className="mt-3 flex gap-2">
          {request.options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                onRespond(option.id);
              }}
              className={`rounded-control px-3 py-1.5 text-[12px] transition-colors ${
                option.id === 'reject'
                  ? 'text-ink-muted hover:bg-surface hover:text-ink'
                  : 'bg-accent text-canvas hover:brightness-110'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
