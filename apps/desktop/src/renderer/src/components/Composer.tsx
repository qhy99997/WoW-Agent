import { useState, type KeyboardEvent } from 'react';

interface ComposerProps {
  disabled: boolean;
  workspaceName: string;
  onSubmit(text: string): void;
  onCancel(): void;
}

export function Composer({ disabled, workspaceName, onSubmit, onCancel }: ComposerProps): React.JSX.Element {
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
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-ink-subtle">
            Enter 发送 · Shift+Enter 换行 · Esc 停止
          </span>
          {disabled ? (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-control px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
            >
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={value.trim() === ''}
              className="rounded-control bg-accent px-3 py-1.5 text-[12px] font-medium text-canvas transition-opacity disabled:opacity-40"
            >
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
