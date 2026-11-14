import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { clearDraftsForPatient } from '../lib/draft'
import type { Patient } from '../lib/types'

/** 利用者の一覧・名前変更・削除を行う設定内セクション。 */
export default function PatientManager({ showToast }: { showToast: (m: string) => void }) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')

  const load = () => db.patients.orderBy('name').toArray().then(setPatients)

  useEffect(() => {
    load()
  }, [])

  const startEdit = (p: Patient) => {
    setEditingId(p.id ?? null)
    setEditName(p.name)
  }

  const saveEdit = async (p: Patient) => {
    const name = editName.trim()
    if (!name || p.id == null) {
      setEditingId(null)
      return
    }
    await db.patients.update(p.id, { name })
    // 過去記録に埋め込まれた利用者名も同じ人の分だけまとめて更新する
    await db.records.where('patientId').equals(p.id).modify({ patientName: name })
    setEditingId(null)
    await load()
    showToast('利用者名を変更しました')
  }

  const remove = async (p: Patient) => {
    if (p.id == null) return
    if (
      !confirm(
        `「${p.name}」を利用者一覧から削除しますか？\n（書きかけの下書きも削除されます。保存済みの記録は残ります）`
      )
    )
      return
    await db.patients.delete(p.id)
    clearDraftsForPatient(p.id)
    await load()
    showToast('利用者を削除しました')
  }

  return (
    <div className="card">
      <label className="label">利用者の管理</label>
      {patients.length === 0 ? (
        <p className="hint" style={{ marginTop: 0 }}>
          まだ利用者が登録されていません。記録を書く画面の「＋ 新しい利用者」から追加できます。
        </p>
      ) : (
        <div className="patient-manage-list">
          {patients.map((p) => (
            <div className="patient-manage-row" key={p.id}>
              {editingId === p.id ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoFocus
                  />
                  <button className="btn-small" onClick={() => saveEdit(p)}>
                    保存
                  </button>
                  <button className="btn-small" onClick={() => setEditingId(null)}>
                    取消
                  </button>
                </>
              ) : (
                <>
                  <span className="pm-name">{p.name}</span>
                  <button className="btn-small" onClick={() => startEdit(p)}>
                    変更
                  </button>
                  <button className="btn-small danger" onClick={() => remove(p)}>
                    削除
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="hint">
        利用者を削除しても、その人の保存済みの記録は履歴に残ります（記録の利用者名はそのまま表示されます）。
      </p>
    </div>
  )
}
