import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/db'
import {
  clearDraft,
  latestDraft,
  listDrafts,
  loadDraft,
  patientKeyOf,
  saveDraft,
  type FormDraft
} from '../lib/draft'
import { generatePlan, generateReport, generateSoap } from '../lib/prompts'
import { getActiveApiKey } from '../lib/settings'
import type { Patient, RecordDoc, RecordType, Vitals } from '../lib/types'
import { emptyVitals, vitalsToText } from '../lib/types'
import { formatDateJa, Header, today } from '../components/ui'

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
  const [restoredAt, setRestoredAt] = useState<number | null>(null)
  const [prevRecord, setPrevRecord] = useState<RecordDoc | null>(null)
  const [usePrev, setUsePrev] = useState(true)
  // 下書きを持っている利用者キーの集合（選択肢の「（下書きあり）」表示用）
  const [draftKeys, setDraftKeys] = useState<Set<string>>(new Set())
  const refreshDraftKeys = () => setDraftKeys(new Set(Object.keys(listDrafts(type))))
  // 初回マウント時の下書き復元が終わるまで自動保存を止めるためのフラグ
  const restoredRef = useRef(false)

  useEffect(() => {
    db.patients.orderBy('name').toArray().then(setPatients)
    refreshDraftKeys()
    // typeは画面遷移で固定のため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 保存済みの下書きのうち最後に書いていた1件を初回に復元する（書類タイプごと）
  useEffect(() => {
    const draft = latestDraft(type)
    if (draft) applyDraft(draft, draft.patientId)
    restoredRef.current = true
    // typeは画面遷移で固定のため依存に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 入力内容を下書きとして自動保存（debounce）
  useEffect(() => {
    if (!restoredRef.current) return
    const t = window.setTimeout(() => {
      saveDraft(type, patientKeyOf(patientId), { patientId, visitDate, vitals, memo })
    }, 400)
    return () => window.clearTimeout(t)
  }, [type, patientId, visitDate, vitals, memo])

  // SOAPのとき、選択中の利用者の「今回より前の最新SOAP記録」を経過評価用に取得する
  useEffect(() => {
    if (type !== 'soap' || patientId === '') {
      setPrevRecord(null)
      return
    }
    let cancelled = false
    db.records
      .where('patientId')
      .equals(patientId)
      .toArray()
      .then((rows) => {
        if (cancelled) return
        const prev = rows
          .filter((r) => r.type === 'soap' && r.soap && r.visitDate < visitDate)
          .sort((a, b) => (a.visitDate < b.visitDate ? 1 : -1))[0]
        setPrevRecord(prev ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [type, patientId, visitDate])

  // 下書きの内容をフォームへ流し込む（利用者も合わせる）
  function applyDraft(d: FormDraft, id: number | '') {
    setPatientId(id)
    setVisitDate(d.visitDate || today())
    setVitals(d.vitals ?? emptyVitals)
    setMemo(d.memo)
    setRestoredAt(d.savedAt)
  }

  // 空のフォームにする（利用者は引数で指定。visitDateは今日に戻す）
  function blankForm(id: number | '') {
    setPatientId(id)
    setVisitDate(today())
    setVitals(emptyVitals)
    setMemo('')
    setRestoredAt(null)
  }

  // 表示中の利用者の下書きスロットだけを消して入力をクリアする
  const clearForm = () => {
    clearDraft(type, patientKeyOf(patientId))
    blankForm(patientId)
    refreshDraftKeys()
  }

  /**
   * 利用者を切り替える。現在の内容を切替前の利用者スロットへ即時保存してから、
   * 切替後の利用者の下書きを読み込む（無ければ空フォーム）。
   * debounce保存が切替後スロットを汚染しないよう、保存は同期的に行う。
   */
  const changePatient = (newId: number | '') => {
    const oldKey = patientKeyOf(patientId)
    const newKey = patientKeyOf(newId)
    if (oldKey === newKey) return

    // 「選択なし（入力あり）→ 利用者」は、書いていた内容をその利用者のものとして引き継ぐ
    if (patientId === '' && newId !== '' && memo.trim()) {
      const existing = loadDraft(type, newKey)
      if (
        existing &&
        !confirm(
          `${nameOf(newId)}の書きかけが残っています。読み込みますか？\n（キャンセルすると今の入力を続けます）`
        )
      ) {
        // 今の入力を引き継ぐ：noneスロットを消し、その利用者スロットへ移す
        clearDraft(type, patientKeyOf(''))
        setPatientId(newId)
        saveDraft(type, newKey, { patientId: newId, visitDate, vitals, memo })
        refreshDraftKeys()
        return
      }
      // 既存の下書きを読み込む（または引き継ぎ先に下書きが無い）
      clearDraft(type, patientKeyOf(''))
      if (existing) {
        applyDraft(existing, newId)
      } else {
        setPatientId(newId)
        saveDraft(type, newKey, { patientId: newId, visitDate, vitals, memo })
      }
      refreshDraftKeys()
      return
    }

    // 通常の切替：今の内容を旧スロットへ即時保存
    saveDraft(type, oldKey, { patientId, visitDate, vitals, memo })
    const existing = loadDraft(type, newKey)
    if (existing) applyDraft(existing, newId)
    else blankForm(newId)
    refreshDraftKeys()
  }

  const nameOf = (id: number | '') =>
    patients.find((p) => p.id === id)?.name ?? '選択なし'

  const addPatient = async () => {
    const name = newPatientName.trim()
    if (!name) return
    const id = await db.patients.add({ name, createdAt: Date.now() })
    setPatients(await db.patients.orderBy('name').toArray())
    setNewPatientName('')
    setAddingPatient(false)
    // 新規追加した利用者へ切替（選択なしで書いていた内容は引き継がれる）
    changePatient(id)
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
        const previous =
          usePrev && prevRecord?.soap
            ? {
                visitDate: prevRecord.visitDate,
                o: prevRecord.soap.o,
                a: prevRecord.soap.a,
                vitalsText: vitalsToText(prevRecord.vitals)
              }
            : undefined
        const soap = await generateSoap(memo, vitals, previous)
        clearDraft(type, patientKeyOf(patientId))
        onGenerated({ ...base, vitals, soap })
      } else if (type === 'plan') {
        const plan = await generatePlan(memo)
        clearDraft(type, patientKeyOf(patientId))
        onGenerated({ ...base, plan })
      } else {
        const report = await generateReport(memo)
        clearDraft(type, patientKeyOf(patientId))
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
        {restoredAt && (
          <div className="restore-note">
            <span>
              {patientId !== '' ? `${nameOf(patientId)}の書きかけを復元しました` : '前回入力していた内容を復元しました'}（
              {formatDateJa(new Date(restoredAt).toISOString().slice(0, 10))}保存）
            </span>
            <button className="btn-small" onClick={clearForm}>
              入力をクリア
            </button>
          </div>
        )}

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
                onChange={(e) => changePatient(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">選択なし</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id != null && draftKeys.has(String(p.id)) ? '（下書きあり）' : ''}
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

        {isSoap && prevRecord && (
          <label className="prev-toggle">
            <input type="checkbox" checked={usePrev} onChange={(e) => setUsePrev(e.target.checked)} />
            <span>
              前回の記録（{formatDateJa(prevRecord.visitDate)}）を参考にして、経過（改善・悪化）をふまえた文章にする
            </span>
          </label>
        )}

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
