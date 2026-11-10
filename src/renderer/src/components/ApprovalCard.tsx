import { useState } from 'react'
import {
  Check,
  CircleSlash,
  Clock,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  FileCode,
  X
} from 'lucide-react'
import type { ApprovalCardItem } from '@shared/types'
import { useAppStore } from '../store/app'

const RISK_LABEL: Record<ApprovalCardItem['risk'], string> = {
  read: '读取',
  write: '写入',
  execute: '执行',
  network: '网络',
  agent: '委派'
}

export function ApprovalCard({ item }: { item: ApprovalCardItem }) {
  const respond = useAppStore((state) => state.respondApproval)
  const [busy, setBusy] = useState<string | null>(null)
  const pending = item.status === 'pending'
  const input = item.input as Record<string, unknown>
  const isCommand = typeof input.command === 'string'
  const isPath = typeof input.path === 'string'

  const decide = async (decision: 'allow' | 'allow_always' | 'deny'): Promise<void> => {
    setBusy(decision)
    await respond(item.approvalId, decision)
    setBusy(null)
  }

  return (
    <div className={`approval-card ${pending ? 'pending' : item.status}`}>
      <div className="approval-head">
        <span className="approval-icon">
          <ShieldAlert size={15} />
        </span>
        <div className="approval-head-copy">
          <div className="approval-title">
            需要授权
            <span className={`risk-badge risk-${item.risk}`}>{RISK_LABEL[item.risk]}</span>
          </div>
          <div className="approval-sub">
            <span className="mono">{item.toolName}</span>
            {item.agentName ? (
              <>
                <span className="tool-dot">·</span>
                <span>子代理 {item.agentName}</span>
              </>
            ) : null}
          </div>
        </div>
        {!pending ? (
          <span className={`decision-badge ${item.status}`}>
            {item.status === 'allowed' ? (
              <Check size={12} />
            ) : item.status === 'expired' ? (
              <Clock size={12} />
            ) : (
              <X size={12} />
            )}
            {item.status === 'allowed'
              ? '已允许'
              : item.status === 'expired'
                ? '已过期'
                : '已拒绝'}
          </span>
        ) : null}
      </div>

      <p className="approval-reason">{item.reason}</p>

      <div className="approval-preview">
        {isCommand ? (
          <div className="approval-command">
            <Terminal size={13} />
            <code className="mono">{String(input.command).slice(0, 600)}</code>
          </div>
        ) : isPath ? (
          <div className="approval-path">
            <FileCode size={13} />
            <code className="mono">{String(input.path)}</code>
            {typeof input.content === 'string' ? (
              <span className="faint">{String(input.content).split('\n').length} 行</span>
            ) : null}
          </div>
        ) : (
          <pre className="approval-json">{JSON.stringify(input, null, 2).slice(0, 1200)}</pre>
        )}
      </div>

      {pending ? (
        <div className="approval-actions">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void decide('deny')}
            disabled={busy !== null}
          >
            <CircleSlash size={13} /> 拒绝
          </button>
          <div className="spacer" />
          <button
            className="btn btn-sm"
            onClick={() => void decide('allow_always')}
            disabled={busy !== null}
            title={`在本任务剩余时间内始终允许 ${item.toolName}`}
          >
            <ShieldCheck size={13} /> 始终允许
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => void decide('allow')}
            disabled={busy !== null}
          >
            <Check size={13} /> 允许一次
          </button>
        </div>
      ) : null}
    </div>
  )
}
