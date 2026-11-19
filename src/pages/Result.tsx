import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { db } from '../lib/db'
import { generatePlan, generateReport, generateSoap } from '../lib/prompts'
import type { PlanResult, RecordDoc, ReportResult, SoapResult } from '../lib/types'
import { DOC_META, vitalsToText } from '../lib/types'
import { copyText, formatDateJa, Header, useToast } from '../components/ui'
import { clearPendingRecord, savePendingRecord } from '../lib/pending'
import { clearDraft, patientKeyOf } from '../lib/draft'
import { findPlaceholders, formatSoapForCopy, isSoapEmpty, parseMissing } from '../lib/soapText'
import { validateVitals } from '../lib/clinicalValidation'
import { maskNames } from '../lib/anonymize'
import { describeBasis } from '../lib/reportSource'

const SOAP_COPY_LABEL = '全部コピー（カイポケに貼る）'

interface Props {
  record: RecordDoc
  onBack: () => void
  onSaved: () => void
}

const SOAP_LABELS: { key: keyof SoapResult; label: string }[] = [
  { key: 's', label: 'S（主観的情報）' },
  { key: 'o', label: 'O（客観的情報）' },
  { key: 'a', label: 'A（アセスメント）' },
  { key: 'p', label: 'P（プラン）' }
]

const PLAN_LABELS: { key: keyof PlanResult; label: string }[] = [
  { key: 'goal', label: '看護・リハビリテーションの目標' },
  { key: 'issues', label: '療養上の課題・支援内容' },
  { key: 'evaluation', label: '評価' }
]

const REPORT_LABELS: { key: keyof ReportResult; label: string }[] = [
  { key: 'progress', label: '病状の経過' },
  { key: 'careContent', label: '看護・リハビリテーションの内容' },
  { key: 'homeCare', label: '家庭での介護の状況' },
  { key: 'notes', label: '特記すべき事項' }
]

function AutoGrowTextarea({
  id,
  label,
  value,
  onChange
}: {
  id: string
  label: string
  value: string
  onChange: (event: ChangeEvent<HTMLTextAreaElement>) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])
  return (
    <textarea
      id={id}
      ref={ref}
      aria-label={label}
      rows={3}
      value={value}
      onChange={onChange}
      className="auto-grow-textarea"
    />
  )
}

export default function Result({ record: initial, onBack, onSaved }: Props) {
  const [record, setRecord] = useState<RecordDoc>(initial)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [dirty, setDirty] = useState(!initial.id)
  /** 直前の生成のあとに、S〜P（各欄）を手で直したか。作り直しの確認に使う。 */
  const [edited, setEdited] = useState(false)
  const [addition, setAddition] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const [toast, showToast] = useToast()
  const type = record.type
  const reviewWarning = type === 'soap' ? record.soap?.reviewWarning?.trim() ?? '' : ''
  const hasReviewWarning = Boolean(reviewWarning && !/^なし[。.\s]*$/.test(reviewWarning))
  const isSoap = type === 'soap' && !!record.soap
  const placeholders = isSoap ? findPlaceholders(record.soap!) : []
  const isReport = type === 'report' && !!record.report
  const missing = isSoap
    ? parseMissing(record.soap!.missing)
    : isReport
      ? parseMissing(record.report!.missing)
      : []
  const reportEmpty =
    isReport && [record.report!.progress, record.report!.careContent, record.report!.homeCare, record.report!.notes]
      .every((value) => !(value ?? '').trim())
  const soapEmpty = (isSoap && isSoapEmpty(record.soap!)) || reportEmpty

  const vitalsText = type === 'soap' ? vitalsToText(record.vitals) : ''
  const vitalsErrors = vitalsText && record.vitals ? validateVitals(record.vitals) : []

  useEffect(() => {
    if (dirty) savePendingRecord(record)
  }, [dirty, record])

  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const guardedBack = () => {
    if (dirty && !confirm('保存していません。破棄してこの画面を閉じますか？')) return
    abortRef.current?.abort()
    if (dirty) clearPendingRecord()
    onBack()
  }

  const fields =
    type === 'soap'
      ? SOAP_LABELS.map(({ key, label }) => ({ key: key as string, label, value: record.soap?.[key] ?? '' }))
      : type === 'plan'
        ? PLAN_LABELS.map(({ key, label }) => ({ key: key as string, label, value: record.plan?.[key] ?? '' }))
        : REPORT_LABELS.map(({ key, label }) => ({ key: key as string, label, value: record.report?.[key] ?? '' }))

  const updateField = (key: string, value: string) => {
    setDirty(true)
    setEdited(true)
    setRecord((current) => {
      if (current.type === 'soap') return { ...current, soap: { ...(current.soap as SoapResult), [key]: value } }
      if (current.type === 'plan') return { ...current, plan: { ...(current.plan as PlanResult), [key]: value } }
      return { ...current, report: { ...(current.report as ReportResult), [key]: value } }
    })
  }

  const copyField = async (key: string, label: string, value: string) => {
    if (await copyText(value)) {
      setCopiedKey(key)
      showToast(`${label} をコピーしました`)
      setTimeout(() => setCopiedKey(''), 2000)
    } else {
      showToast('コピーできませんでした。文章を長押しして手動でコピーしてください。')
    }
  }

  const copyAll = async () => {
    const isSoapRecord = type === 'soap' && record.soap
    const text = isSoapRecord
      ? formatSoapForCopy(record.soap!)
      : fields.map((field) => `【${field.label}】\n${field.value}`).join('\n\n')
    const success = isSoapRecord
      ? '全部コピーしました。カイポケの経過記録に貼ってください'
      : '全文をコピーしました'
    showToast(await copyText(text)
      ? success
      : 'コピーできませんでした。文章を長押しして手動でコピーしてください。')
  }

  const copyAllLabel = type === 'soap' ? SOAP_COPY_LABEL : '全文をコピー（カイポケ貼り付け用）'
  const copyAllButton = (
    <button className="btn btn-primary" type="button" onClick={copyAll} disabled={soapEmpty}>
      {copyAllLabel}
    </button>
  )

  /** memo を元にAIで作り直す。成功したら true。 */
  const runGenerate = async (memo: string): Promise<boolean> => {
    setError('')
    setLoading(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      if (type === 'soap') {
        const { soap, vitals: merged } = await generateSoap(memo, record.vitals, record.previousSoap, { signal: controller.signal })
        setRecord((current) => ({ ...current, memo, soap, vitals: merged }))
      } else if (type === 'plan') {
        const plan = await generatePlan(memo, { signal: controller.signal })
        setRecord((current) => ({ ...current, memo, plan }))
      } else {
        // 作り直しでも、送る前に登録名を「利用者」に置き換える
        const names = (await db.patients.toArray()).map((p) => p.name)
        const { text, masked } = maskNames(memo, names)
        const report = await generateReport(text, { signal: controller.signal })
        setRecord((current) => ({
          ...current,
          memo: text,
          report,
          reportBasis: current.reportBasis && masked ? { ...current.reportBasis, masked: true } : current.reportBasis
        }))
      }
      setDirty(true)
      setEdited(false)
      showToast('作り直しました。元メモと再度照合してください。')
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'エラーが発生しました。')
      return false
    } finally {
      abortRef.current = null
      setLoading(false)
    }
  }

  const regenerate = async () => {
    if (edited && !confirm('手で直した文章は消えます。作り直しますか？')) return
    await runGenerate(record.memo)
  }

  const addAndRegenerate = async () => {
    const extra = addition.trim()
    if (!extra) return
    if (edited && !confirm('手で直した文章は消えます。作り直しますか？')) return
    const memo = type === 'report'
      ? `${record.memo.trimEnd()}\n\n【付け足したこと】\n${extra}`
      : `${record.memo.trimEnd()}\n${extra}`
    if (await runGenerate(memo)) {
      setAddition('')
      if (type === 'report') {
        setRecord((current) => (current.reportBasis ? { ...current, reportBasis: { ...current.reportBasis, extra: true } } : current))
      }
    }
  }

  const save = async () => {
    const question =
      (missing.length > 0 ? '足りないところが残っています。このまま保存しますか？\n' : '') +
      (hasReviewWarning ? '確認が必要な言葉があります。直しましたか？\n' : '') +
      '元のメモと見比べましたか？\n話していない内容が入っていなければ「OK」を押してください。'
    if (!confirm(question)) return
    setError('')
    setSaving(true)
    const wasNew = !record.id
    try {
      const doc = { ...record, updatedAt: Date.now() }
      if (doc.id) await db.records.put(doc)
      else doc.id = await db.records.add(doc)
      setRecord(doc)
      setDirty(false)
      clearPendingRecord()
      if (wasNew) clearDraft(doc.type, patientKeyOf(doc.patientId ?? ''))
      showToast('保存しました')
      setTimeout(onSaved, 600)
    } catch {
      setError('保存できませんでした。未保存の内容は端末に残しています。空き容量を確認して再度お試しください。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Header title={`${DOC_META[type].short}の確認・編集`} onBack={guardedBack} />
      <main className="page" aria-busy={loading || saving}>
        <div className="meta-line">
          <span className={`badge ${DOC_META[type].badgeClass}`}>{DOC_META[type].short}</span>
          {record.reportBasis
            ? `${formatDateJa(record.reportBasis.from)}〜${formatDateJa(record.reportBasis.to)}`
            : formatDateJa(record.visitDate)}・{record.patientName}
        </div>

        {record.reportBasis && describeBasis(record.reportBasis) && (
          <p className="basis-line">まとめた記録：{describeBasis(record.reportBasis)}</p>
        )}
        {record.reportBasis?.masked && (
          <div className="notice" role="status">
            文中の利用者名を「利用者」に置き換えて送りました。家族の名前や住所が残っていないかも確かめてください。
          </div>
        )}

        <p className="review-guidance">
          AIが作った下書きです。元のメモと見比べて、違うところは直してください。
        </p>

        {hasReviewWarning && (
          <div className="notice generation-warning" role="alert" aria-live="assertive">
            <strong>元メモに意味の確認が必要な語句があります</strong>
            <div>{reviewWarning}</div>
            <div>推測で訂正せず、正しい内容を確認してから各欄を修正してください。</div>
          </div>
        )}

        {placeholders.length > 0 && (
          <div className="notice" role="status">
            「未確認」などの文が {placeholders.join('・')} に残っています。貼る前に消すか書き直してください。
          </div>
        )}

        {missing.length > 0 && (
          <section className="missing-box" aria-label="足りないところ">
            <h2 className="sec-title">足りないところ</h2>
            <ul>
              {missing.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <textarea
              aria-label="話し足す内容"
              rows={3}
              placeholder="ここをタップして、マイク🎤で足りない分を話してください"
              value={addition}
              onChange={(event) => setAddition(event.target.value)}
            />
            <button className="btn btn-secondary" type="button" onClick={addAndRegenerate} disabled={loading}>
              {loading ? '作り直しています…' : '話し足して作り直す'}
            </button>
          </section>
        )}

        {type === 'soap' && copyAllButton}

        {vitalsText && <p className="vitals-line">数値：{vitalsText}</p>}
        {vitalsErrors.length > 0 && (
          <div className="notice" role="status">
            数値を確かめてください：{vitalsErrors.join(' ')}
          </div>
        )}

        {fields.map((field) => (
          <section className="card result-section" key={field.key}>
            <div className="sec-head">
              <label className="sec-title" htmlFor={`result-${field.key}`}>{field.label}</label>
              <button
                className={`btn-small${copiedKey === field.key ? ' copied' : ''}`}
                type="button"
                aria-label={`${field.label}をコピー`}
                onClick={() => copyField(field.key, field.label, field.value)}
              >
                {copiedKey === field.key ? '✓ コピー済' : 'コピー'}
              </button>
            </div>
            <AutoGrowTextarea
              id={`result-${field.key}`}
              label={`${field.label}の生成結果`}
              value={field.value}
              onChange={(event) => updateField(field.key, event.target.value)}
            />
          </section>
        ))}

        <section className="card memo-view" aria-labelledby="source-memo-title">
          <h2 id="source-memo-title" className="sec-title">元の入力メモ（照合用）</h2>
          <p className="memo-edit-hint">メモを直した場合は「作り直す」を押してください。</p>
          <AutoGrowTextarea
            id="source-memo"
            label="元の入力メモ"
            value={record.memo}
            onChange={(event) => {
              setDirty(true)
              setRecord((current) => ({ ...current, memo: event.target.value }))
            }}
          />
        </section>

        {error && <div className="error-box" role="alert" aria-live="assertive">{error}</div>}

        {copyAllButton}
        <button
          className="btn btn-secondary"
          type="button"
          onClick={save}
          disabled={saving || loading}
        >
          {saving ? '保存中…' : '確認して保存'}
        </button>
        {loading ? (
          <button className="btn btn-ghost" type="button" onClick={() => abortRef.current?.abort()}>
            作成をやめる
          </button>
        ) : (
          <button className="btn btn-ghost" type="button" onClick={regenerate} disabled={!record.memo}>
            作り直す
          </button>
        )}
      </main>
      {toast}
    </>
  )
}
