import type { DoctorReport } from '@shared/contract.js';

interface OnboardingProps {
  report: DoctorReport;
  onRetry(): void;
}

const STATUS_LABEL = { ok: '正常', warn: '注意', fail: '需修复' } as const;

export function Onboarding({ report, onRetry }: OnboardingProps): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-lg">
        <h1 className="text-[22px] font-medium tracking-tight">环境检查未通过</h1>
        <p className="mt-2 text-[13px] text-ink-muted">
          WoW 需要修复下面标注为“需修复”的项目才能开始工作。
        </p>
        <ul className="mt-6 flex flex-col gap-2">
          {report.checks.map((check) => (
            <li
              key={check.id}
              className="rounded-card border border-hairline bg-surface px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-ink">{check.label}</span>
                <span
                  className={`text-[11px] tracking-wide uppercase ${
                    check.status === 'fail'
                      ? 'text-danger'
                      : check.status === 'warn'
                        ? 'text-accent'
                        : 'text-success'
                  }`}
                >
                  {STATUS_LABEL[check.status]}
                </span>
              </div>
              <p className="mt-1 font-mono text-[12px] break-all text-ink-muted">{check.detail}</p>
              {check.hint !== undefined && (
                <p className="mt-1 text-[12px] text-ink-subtle">{check.hint}</p>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 rounded-control bg-accent px-4 py-2 text-[13px] font-medium text-canvas transition-opacity hover:opacity-90"
        >
          重新检查
        </button>
      </div>
    </div>
  );
}
