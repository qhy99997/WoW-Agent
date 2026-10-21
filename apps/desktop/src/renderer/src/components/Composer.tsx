import { useState, type KeyboardEvent } from 'react';

import type { ModelOption } from '@shared/contract.js';

interface ComposerProps {
  disabled: boolean;
  workspaceName: string;
  models: ModelOption[];
  activeModel: string | null;
  onModelChange(alias: string): void;
  onSubmit(text: string): void;
  onCancel(): void;
}

export function Composer({
  disabled,
  workspaceName,
  models,
  activeModel,
  onModelChange,
  onSubmit,
  onCancel,
}: ComposerProps): React.JSX.Element {
  const [value, setValue] = useState('');

  const submit = (): void => {
    const text = value.trim();
    if (text === '' || disabled) return;
    setValue('');
    onSubmit(text);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === 'Escape' && disabled) {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-6">
      <div className="wow-no-drag rounded-card border border-hairline bg-surface-raised p-3 transition-colors focus-within:border-ink-subtle">
        <textarea
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
          }}
          onKeyDown={onKeyDown}
          rows={3}
          placeholder={workspaceName === '' ? '描述你想做的事…' : `在 ${workspaceName} 中描述你想做的事…`}
          className="w-full resize-none bg-transparent text-[14px] leading-[1.6] text-ink outline-none placeholder:text-ink-subtle"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {models.length > 0 && (
              <select
                value={activeModel ?? ''}
                onChange={(event) => {
                  onModelChange(event.target.value);
                }}
                className="max-w-[220px] truncate rounded-control border border-hairline bg-transparent px-2 py-1 text-[11px] text-ink-muted outline-none transition-colors hover:text-ink focus:border-ink-subtle"
                title="切换模型"
              >
                {models.map((model) => (
                  <option key={model.alias} value={model.alias}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            )}
            <span className="hidden text-[11px] text-ink-subtle sm:inline">
              Enter 发送 · Shift+Enter 换行 · Esc 停止
            </span>
          </div>
          {disabled ? (
            <button
              type="button"
              onClick={onCancel}
              className="shrink-0 rounded-control px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={value.trim() === ''}
              className="shrink-0 rounded-control bg-accent px-3 py-1.5 text-[12px] font-medium text-canvas transition-opacity disabled:opacity-40"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
