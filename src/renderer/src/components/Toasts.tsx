import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { useAppStore } from '../store/app'

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  error: XCircle
}

export function Toasts() {
  const toasts = useAppStore((state) => state.toasts)
  const dismiss = useAppStore((state) => state.dismissToast)

  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.level]
        return (
          <div key={toast.id} className={`toast ${toast.level} animate-rise`}>
            <span className="toast-icon">
              <Icon size={15} />
            </span>
            <div className="toast-copy">
              <strong>{toast.title}</strong>
              {toast.detail ? <span>{toast.detail}</span> : null}
            </div>
            <button className="toast-close" onClick={() => dismiss(toast.id)} title="关闭">
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
