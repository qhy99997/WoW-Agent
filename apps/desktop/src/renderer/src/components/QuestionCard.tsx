import { useState } from 'react';

import type { QuestionAnswers, QuestionRequest } from '@shared/contract';

import { buildAnswers, isComplete } from '../questions';

interface QuestionCardProps {
  request: QuestionRequest;
  queued?: number;
  onRespond: (answers: QuestionAnswers) => void;
}

export function QuestionCard({
  request,
  queued = 0,
  onRespond,
}: QuestionCardProps): React.JSX.Element {
  const [selections, setSelections] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(request.questions.map((item) => [item.question, []])),
  );

  const toggle = (question: string, label: string, multiSelect: boolean): void => {
    setSelections((current) => {
      const picked = current[question] ?? [];
      if (!multiSelect) return { ...current, [question]: [label] };
      const next = picked.includes(label)
        ? picked.filter((value) => value !== label)
        : [...picked, label];
      return { ...current, [question]: next };
    });
  };

  const answers = buildAnswers(request.questions, selections);
  const complete = isComplete(request.questions, selections);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-3">
      <div className="rounded-card border border-accent/40 bg-accent-soft/30 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] font-medium text-ink">需要你确认</p>
          {queued > 0 && (
            <span className="shrink-0 text-[11px] text-ink-subtle">还有 {queued} 个待确认</span>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-4">
          {request.questions.map((item) => {
            const picked = selections[item.question] ?? [];
            return (
              <div key={item.question}>
                {item.header !== undefined && (
                  <p className="text-[11px] tracking-wide text-ink-subtle uppercase">{item.header}</p>
                )}
                <p className="mt-1 text-[13px] text-ink">{item.question}</p>
                <div className="mt-2 flex flex-col gap-1.5">
                  {item.options.map((option) => {
                    const active = picked.includes(option.label);
                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          toggle(item.question, option.label, item.multiSelect);
                        }}
                        className={`rounded-control border px-3 py-2 text-left text-[12px] transition-colors ${
                          active
                            ? 'border-accent/60 bg-accent/10 text-ink'
                            : 'border-hairline text-ink-muted hover:text-ink'
                        }`}
                      >
                        <span className="block font-medium">{option.label}</span>
                        {option.description !== undefined && (
                          <span className="mt-0.5 block text-[11px] text-ink-subtle">
                            {option.description}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={!complete}
            onClick={() => {
              onRespond(answers);
            }}
            className="rounded-control bg-accent px-3 py-1.5 text-[12px] text-canvas transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            提交
          </button>
          <button
            type="button"
            onClick={() => {
              onRespond({});
            }}
            className="rounded-control px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            跳过
          </button>
        </div>
      </div>
    </div>
  );
}
