import { useEffect, useMemo, useState } from 'react'
import { db } from '../lib/db'
import type { RecordDoc, RecordType } from '../lib/types'
import { DOC_META } from '../lib/types'
import { formatDateJa, Header } from '../components/ui'

interface Props {
  onBack: () => void
  onOpen: (record: RecordDoc) => void
}

const TYPE_FILTERS: { value: 'all' | RecordType; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'soap', label: 'SOAP記録' },
  { value: 'plan', label: '計画書' },
  { value: 'report', label: '報告書' }
]

export default function History({ onBack, onOpen }: Props) {
  const [records, setRecords] = useState<RecordDoc[]>([])
  const [typeFilter, setTypeFilter] = useState<'all' | RecordType>('all')
  const [patientFilter, setPatientFilter] = useState('')

  const load = async () => {
    const all = await db.records.orderBy('updatedAt').reverse().toArray()
    setRecords(all)
  }

  useEffect(() => {
    load()
  }, [])

  // 履歴に登場する利用者名の一覧（絞り込み用）
  const patientNames = useMemo(() => {
    const set = new Set<string>()
    for (const r of records) if (r.patientName) set.add(r.patientName)
    return Array.from(set).sort()
  }, [records])

  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (typeFilter === 'all' || r.type === typeFilter) &&
          (patientFilter === '' || r.patientName === patientFilter)
      ),
    [records, typeFilter, patientFilter]
  )

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
            <div className="history-filters">
              <div className="type-tabs">
                {TYPE_FILTERS.map((t) => (
                  <button
                    key={t.value}
                    className={`type-tab${typeFilter === t.value ? ' active' : ''}`}
                    onClick={() => setTypeFilter(t.value)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              {patientNames.length > 0 && (
                <select value={patientFilter} onChange={(e) => setPatientFilter(e.target.value)}>
                  <option value="">すべての利用者</option>
                  {patientNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {filtered.length === 0 ? (
              <p className="empty-note">条件に合う記録がありません</p>
            ) : (
              filtered.map((r) => (
              <div
                className="history-item"
                key={r.id}
                role="button"
                tabIndex={0}
                aria-label={`${DOC_META[r.type].short} ${formatDateJa(r.visitDate)} ${r.patientName || '利用者名なし'}を開く`}
                onClick={() => onOpen(r)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onOpen(r)
                  }
                }}
              >
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
                <button
                  className="del"
                  type="button"
                  onClick={(event) => remove(event, r.id)}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label={`${r.patientName || '利用者名なし'}の${DOC_META[r.type].short}を削除`}
                >
                  🗑
                </button>
              </div>
              ))
            )}
            <button className="btn btn-danger-ghost" onClick={removeAll}>
              履歴をすべて削除
            </button>
          </>
        )}
      </div>
    </>
  )
}
