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
import { savePendingRecord } from '../lib/pending'
import { getActiveApiKey } from '../lib/settings'
import type { Patient, RecordDoc, RecordType, Vitals } from '../lib/types'
import { emptyVitals, vitalsToText } from '../lib/types'
import { formatDateJa, Header, today } from '../components/ui'
import { validateVitals } from '../lib/clinicalValidation'
import { createStableId } from '../lib/id'

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

interface InputGuide {
  items: string[]
  example: string
}

const INPUT_GUIDES: Record<RecordType, InputGuide> = {
  soap: {
    items: [
      '本人・家族の訴えや発言',
      '観察した状態と前回からの変化',
      '実施したケア・処置とその反応',
      '次回も確認・継続すること'
    ],
    example:
      '本人より「昨夜は2時間ほどしか眠れなかった」との訴えあり。朝食は半量摂取。下肢浮腫は前回よりやや軽減。服薬を確認。入浴介助を実施し、皮膚トラブルなし。次回も睡眠状況と浮腫を観察する。'
  },
  plan: {
    items: [
      '本人・家族の希望や生活上の目標',
      '現在困っていることと、その根拠となる事実',
      '達成したい具体的な目標',
      '実施する支援内容・訪問頻度・連携方針'
    ],
    example:
      '本人は自宅での生活を継続したいと希望。室内歩行時にふらつきあり。服薬忘れが週2回程度ある。安全に室内移動できること、服薬忘れを減らすことを目標とする。週2回訪問し、状態観察、服薬確認、転倒予防の環境調整を行う。'
  },
  report: {
    items: [
      '対象期間中の状態や症状の変化',
      '実施した看護・リハビリとその反応',
      '家族の介護状況や本人・家族の訴え',
      '主治医・ケアマネジャー等との連携事項と今後の方針'
    ],
    example:
      '対象期間中、発熱なし。下肢浮腫は月初より軽減。服薬確認と入浴介助を継続し、皮膚トラブルなし。家族より介助負担の訴えあり。ケアマネジャーへ情報共有した。次月も状態観察と服薬支援を継続予定。'
  }
}

interface Props {
  type: RecordType
  onBack: () => void
  onGenerated: (record: RecordDoc) => void
  goSettings: () => void
}

export default function InputForm({ type, onBack, onGenerated, goSettings }: Props) {
  const isSoap = type === 'soap'
  const guide = INPUT_GUIDES[type]
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
  const patientSelectRef = useRef<HTMLSelectElement>(null)
  const memoRef = useRef<HTMLTextAreaElement>(null)
  const vitalsRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

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
    if (patients.some((patient) => patient.name.trim() === name)) {
      setError('同じ表示名の利用者がすでに登録されています。取り違え防止のため、既存の利用者を選ぶか識別できる表示名にしてください。')
      return
    }
    const id = await db.patients.add({ uuid: createStableId(), name, createdAt: Date.now() })
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
    if (patientId === '') {
      setError('利用者を選択してください。記録の取り違えを防ぐため、利用者未選択では生成できません。')
      requestAnimationFrame(() => patientSelectRef.current?.focus())
      return
    }
    if (!visitDate) {
      setError('訪問日を入力してください。')
      return
    }
    if (!memo.trim()) {
      setError('メモを入力してください。キーボードのマイクボタンから音声入力ができます。')
      requestAnimationFrame(() => memoRef.current?.focus())
      return
    }
    if (isSoap) {
      const vitalErrors = validateVitals(vitals)
      if (vitalErrors.length) {
        setError(vitalErrors.join('\n'))
        requestAnimationFrame(() => vitalsRef.current?.querySelector('input')?.focus())
        return
      }
    }
    const patient = patients.find((p) => p.id === patientId)
    if (!patient) {
      setError('選択した利用者を確認できませんでした。利用者を選び直してください。')
      requestAnimationFrame(() => patientSelectRef.current?.focus())
      return
    }
    if (!getActiveApiKey()) {
      setError('APIキーが設定されていません。設定画面からAPIキーを入力してください。')
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const now = Date.now()
      const base: RecordDoc = {
        uuid: createStableId(),
        type,
        patientId: patient.id,
        patientName: patient.name,
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
        const soap = await generateSoap(memo, vitals, previous, { signal: controller.signal })
        const generated = { ...base, vitals, previousSoap: previous, soap }
        savePendingRecord(generated)
        onGenerated(generated)
      } else if (type === 'plan') {
        const plan = await generatePlan(memo, { signal: controller.signal })
        const generated = { ...base, plan }
        savePendingRecord(generated)
        onGenerated(generated)
      } else {
        const report = await generateReport(memo, { signal: controller.signal })
        const generated = { ...base, report }
        savePendingRecord(generated)
        onGenerated(generated)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました。もう一度お試しください。')
    } finally {
      abortRef.current = null
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
          <label className="label" htmlFor="patient-select">利用者（必須）</label>
          {addingPatient ? (
            <div className="patient-row">
              <input
                type="text"
                aria-label="新しい利用者の表示名"
                placeholder="利用者名（例：A様）"
                value={newPatientName}
                onChange={(e) => setNewPatientName(e.target.value)}
                autoFocus
              />
              <button className="btn-small" type="button" onClick={addPatient}>
                追加
              </button>
              <button className="btn-small" type="button" onClick={() => setAddingPatient(false)}>
                取消
              </button>
            </div>
          ) : (
            <div className="patient-row">
              <select
                id="patient-select"
                ref={patientSelectRef}
                value={patientId}
                onChange={(e) => changePatient(e.target.value ? Number(e.target.value) : '')}
                required
              >
                <option value="">利用者を選択</option>
                {patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.id != null && draftKeys.has(String(p.id)) ? '（下書きあり）' : ''}
                  </option>
                ))}
              </select>
              <button className="btn-small" type="button" onClick={() => setAddingPatient(true)}>
                ＋新規
              </button>
            </div>
          )}
          <p className="hint">利用者名は端末内にのみ保存され、AIには送信されません。</p>

          <label className="label" htmlFor="visit-date" style={{ marginTop: 12 }}>
            訪問日
          </label>
          <input id="visit-date" type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} required />
        </div>

        {isSoap && (
          <div className="card" ref={vitalsRef}>
            <h2 className="label">バイタルサイン（わかる項目だけでOK）</h2>
            <div className="vitals-grid">
              <div className="field">
                <label htmlFor="vital-temp">体温（℃）</label>
                <input id="vital-temp" type="text" inputMode="decimal" value={vitals.temp} onChange={(e) => setV('temp', e.target.value)} />
              </div>
              <div className="field" style={{ gridColumn: 'span 2' }}>
                <span className="field-label">血圧（mmHg）</span>
                <div className="bp-pair">
                  <input aria-label="収縮期血圧" type="text" inputMode="numeric" placeholder="上" value={vitals.bpHigh} onChange={(e) => setV('bpHigh', e.target.value)} />
                  <span>/</span>
                  <input aria-label="拡張期血圧" type="text" inputMode="numeric" placeholder="下" value={vitals.bpLow} onChange={(e) => setV('bpLow', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="vital-pulse">脈拍（回/分）</label>
                <input id="vital-pulse" type="text" inputMode="numeric" value={vitals.pulse} onChange={(e) => setV('pulse', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="vital-spo2">SpO₂（%）</label>
                <input id="vital-spo2" type="text" inputMode="numeric" value={vitals.spo2} onChange={(e) => setV('spo2', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="vital-resp">呼吸数（回/分）</label>
                <input id="vital-resp" type="text" inputMode="numeric" value={vitals.resp} onChange={(e) => setV('resp', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <section className="input-guide" aria-labelledby="input-guide-title">
            <h2 id="input-guide-title" className="input-guide-title">入力する内容</h2>
            <ul>
              {guide.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <div className="input-example">
              <strong>架空の入力例</strong>
              <p>{guide.example}</p>
            </div>
            <p className="input-guide-note">
              全項目を埋める必要はありません。分かる範囲の事実だけを書いてください。
            </p>
          </section>

          <label className="label" htmlFor="record-memo">{MEMO_LABELS[type]}</label>
          <textarea
            id="record-memo"
            ref={memoRef}
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
          <div className="error-box" role="alert" aria-live="assertive">
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

        <button className="btn btn-primary" type="button" onClick={generate} disabled={loading}>
          {loading ? (
            <>
              <span className="spinner" />
              AIが文章を作成中…
            </>
          ) : (
            'AIで文章にする'
          )}
        </button>
        {loading && (
          <button className="btn btn-ghost" type="button" onClick={() => abortRef.current?.abort()}>
            AI作成を中止
          </button>
        )}
      </div>
    </>
  )
}
