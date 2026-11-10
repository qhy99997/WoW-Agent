import { ArrowRight, FileCode, RotateCcw } from 'lucide-react'
import type { ChangesCardItem } from '@shared/types'
import { useAppStore } from '../store/app'

const KIND_LABEL: Record<string, string> = {
  create: 'A',
  modify: 'M',
  delete: 'D'
}

export function ChangesCard({ item }: { item: ChangesCardItem }) {
  const openCanvas = useAppStore((state) => state.openCanvas)
  const revertTurn = useAppStore((state) => state.revertTurn)
  const running = useAppStore((state) => state.running)

  const additions = item.files.reduce((total, file) => total + file.additions, 0)
  const deletions = item.files.reduce((total, file) => total + file.deletions, 0)

  if (!item.files.length) return null

  return (
    <div className="changes-card">
      <div className="changes-head">
        <span className="changes-icon">
          <FileCode size={14} />
        </span>
        <div className="changes-head-copy">
          <span className="changes-title">
            已更改 {item.files.length} 个文件
          </span>
          <span className="changes-stats">
            <span className="add">+{additions}</span>
            <span className="del">−{deletions}</span>
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => openCanvas('changes')}>
          查看 <ArrowRight size={13} />
        </button>
      </div>
      <div className="changes-list">
        {item.files.map((file) => (
          <button
            key={file.id}
            className="changes-row"
            onClick={() => openCanvas('changes')}
            title={file.path}
          >
            <span className={`change-kind ${file.kind}`}>{KIND_LABEL[file.kind]}</span>
            <span className="change-path mono truncate">{file.path}</span>
            <span className="change-add">+{file.additions}</span>
            <span className="change-del">−{file.deletions}</span>
          </button>
        ))}
      </div>
      <div className="changes-footer">
        <button
          className="btn btn-ghost btn-sm"
          disabled={running}
          onClick={() => void revertTurn(item.turnId)}
        >
          <RotateCcw size={12} /> 撤销本轮
        </button>
      </div>
    </div>
  )
}
