import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import type { RecordDoc } from '../lib/types'
import { DOC_META } from '../lib/types'
import { formatDateJa, Header } from '../components/ui'

interface Props {
  onBack: () => void
  onOpen: (record: RecordDoc) => void
}

export default function History({ onBack, onOpen }: Props) {
  const [records, setRecords] = useState<RecordDoc[]>([])

  const load = async () => {
    const all = await db.records.orderBy('updatedAt').reverse().toArray()
    setRecords(all)
  }

  useEffect(() => {
    load()
  }, [])

  const remove = async (e: React.MouseEvent, id?: number) => {
    e.stopPropagation()
    if (id == null) return
    if (!confirm('この記録を削除しますか？')) return
    await db.records.delete(id)
    load()
  }

  const removeAll = async () => {
    if (!confirm('履歴をすべて削除しますか？この操作は取り消せません。')) return
    await db.records.clear()
    load()
  }

  return (
    <>
      <Header title="履歴" onBack={onBack} />
      <div className="page">
        {records.length === 0 ? (
          <p className="empty-note">保存された記録はまだありません</p>
        ) : (
          <>
            {records.map((r) => (
              <div className="history-item" key={r.id} onClick={() => onOpen(r)}>
                <div className="info">
                  <div className="line1">
                    <span className={`badge ${DOC_META[r.type].badgeClass}`}>
                      {DOC_META[r.type].short}
                    </span>
                    {r.patientName || '（利用者未選択）'}
                  </div>
                  <div className="line2">
                    {formatDateJa(r.visitDate)}　{r.memo}
                  </div>
                </div>
                <button className="del" onClick={(e) => remove(e, r.id)} aria-label="削除">
                  🗑
                </button>
              </div>
            ))}
            <button className="btn btn-danger-ghost" onClick={removeAll}>
              履歴をすべて削除
            </button>
          </>
        )}
      </div>
    </>
  )
}
