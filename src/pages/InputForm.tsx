import { useEffect, useState } from 'react'
import { db } from '../lib/db'
import { generatePlan, generateReport, generateSoap } from '../lib/prompts'
import { getActiveApiKey } from '../lib/settings'
import type { Patient, RecordDoc, RecordType, Vitals } from '../lib/types'
import { emptyVitals } from '../lib/types'
import { Header, today } from '../components/ui'

const TITLES: Record<RecordType, string> = {
  soap: '訪問看護記録（SOAP）',
  plan: '訪問看護計画書',
  report: '訪問看護報告書'
}

const MEMO_LABELS: Record<RecordType, string> = {
  soap: '訪問メモ（音声入力OK）',
  plan: '計画のメモ（音声入力OK）',
  report: '報告のメモ（音声入力OK）'
}

const MEMO_PLACEHOLDERS: Record<RecordType, string> = {
  soap: '例：本人から夜眠れないと訴えあり 食欲はまあまあ 下肢の浮腫やや軽減 服薬確認した 入浴介助実施 皮膚トラブルなし 次回も浮腫の観察継続…',
  plan: '例：本人は自宅での生活を続けたい希望 転倒リスクが高い 内服管理が不十分 家族の介護負担が大きい 週2回の訪問で状態観察と服薬支援…',
  report: '例：今月は血圧安定 浮腫軽減し経過良好 服薬管理と入浴介助を継続 発熱なし 家族の介護負担やや大きい ケアマネと情報共有 来月も現状維持で訪問継続…'
}

interface Props {
  type: RecordType
  onBack: () => void
  onGenerated: (record: RecordDoc) => void
  goSettings: () => void
}

export default function InputForm({ type, onBack, onGenerated, goSettings }: Props) {
  const isSoap = type === 'soap'
  const [patients, setPatients] = useState<Patient[]>([])
  const [patientId, setPatientId] = useState<number | ''>('')
  const [addingPatient, setAddingPatient] = useState(false)
  const [newPatientName, setNewPatientName] = useState('')
  const [visitDate, setVisitDate] = useState(today())
  const [vitals, setVitals] = useState<Vitals>(emptyVitals)
  const [memo, setMemo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    db.patients.orderBy('name').toArray().then(setPatients)
  }, [])

  const addPatient = async () => {
    const name = newPatientName.trim()
    if (!name) return
    const id = await db.patients.add({ name, createdAt: Date.now() })
    setPatients(await db.patients.orderBy('name').toArray())
    setPatientId(id)
    setNewPatientName('')
    setAddingPatient(false)
  }

  const setV = (key: keyof Vitals, value: string) => {
    setVitals((v) => ({ ...v, [key]: value }))
  }

  const generate = async () => {
    setError('')
    if (!memo.trim()) {
      setError('メモを入力してください。キーボードのマイクボタンから音声入力ができます。')
      return
    }
    if (!getActiveApiKey()) {
      setError('APIキーが設定されていません。設定画面からAPIキーを入力してください。')
      return
    }
    setLoading(true)
    try {
      const patient = patients.find((p) => p.id === patientId)
      const now = Date.now()
      const base: RecordDoc = {
        type,
        patientId: patient?.id,
        patientName: patient?.name ?? '',
        visitDate,
        memo,
        createdAt: now,
        updatedAt: now
      }
      if (type === 'soap') {
        const soap = await generateSoap(memo, vitals)
        onGenerated({ ...base, vitals, soap })
      } else if (type === 'plan') {
        const plan = await generatePlan(memo)
        onGenerated({ ...base, plan })
      } else {
        const report = await generateReport(memo)
        onGenerated({ ...base, report })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Header title={TITLES[type]} onBack={onBack} />
      <div className="page">
        <div className="card">
          <label className="label">利用者</label>
          {addingPatient ? (
            <div className="patient-row">
              <input
                type="text"
                placeholder="利用者名（例：A様）"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                autoFocus
              />
              <button className="btn-small" onClick={addPatient}>
                追加
              </button>
              <button className="btn-small" onClick={() => setAddingPatient(false)}>
                取消
              </button>
            </div>
          ) : (
            <div className="patient-row">
              <select
                value={patientId}
                onChange={(e) => setPatientId(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">選択なし</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button className="btn-small" onClick={() => setAddingPatient(true)}>
                ＋新規
              </button>
            </div>
          )}
          <p className="hint">利用者名は端末内にのみ保存され、AIには送信されません。</p>

          <label className="label" style={{ marginTop: 12 }}>
            訪問日
          </label>
          <input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
        </div>

        {isSoap && (
          <div className="card">
            <label className="label">バイタルサイン（わかる項目だけでOK）</label>
            <div className="vitals-grid">
              <div className="field">
                <label>体温（℃）</label>
                <input type="text" inputMode="decimal" value={vitals.temp} onChange={(e) => setV('temp', e.target.value)} />
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <label>血圧（mmHg）</label>
                <div className="bp-pair">
                  <input type="text" inputMode="numeric" placeholder="上" value={vitals.bpHigh} onChange={(e) => setV('bpHigh', e.target.value)} />
                  <span>/</span>
                  <input type="text" inputMode="numeric" placeholder="下" value={vitals.bpLow} onChange={(e) => setV('bpLow', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>脈拍（回/分）</label>
                <input type="text" inputMode="numeric" value={vitals.pulse} onChange={(e) => setV('pulse', e.target.value)} />
              </div>
              <div className="field">
                <label>SpO2（%）</label>
                <input type="text" inputMode="numeric" value={vitals.spo2} onChange={(e) => setV('spo2', e.target.value)} />
              </div>
              <div className="field">
                <label>呼吸数（回/分）</label>
                <input type="text" inputMode="numeric" value={vitals.resp} onChange={(e) => setV('resp', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <label className="label">{MEMO_LABELS[type]}</label>
          <textarea
            rows={9}
            placeholder={MEMO_PLACEHOLDERS[type]}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <p className="hint">
            キーボードのマイクボタン🎤で話した内容がそのまま入ります。単語の羅列でOK。
            氏名・住所などの個人情報はメモに入れないでください。
          </p>
        </div>

        {error && (
          <div className="error-box">
            {error}
            {error.includes('APIキー') && (
              <div style={{ marginTop: 8 }}>
                <button className="btn-small" onClick={goSettings}>
                  設定画面を開く
                </button>
              </div>
            )}
          </div>
        )}

        <button className="btn btn-primary" onClick={generate} disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" />
              AIが文章を作成中…
            </>
          ) : (
            'AIで文章にする'
          )}
        </button>
      </div>
    </>
  )
}
