import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { db } from '../lib/db'
import { generatePlan, generateReport, generateSoap } from '../lib/prompts'
import type { PlanResult, RecordDoc, ReportResult, SoapResult } from '../lib/types'
import { DOC_META } from '../lib/types'
import { copyText, formatDateJa, Header, useToast } from '../components/ui'
import { clearPendingRecord, savePendingRecord } from '../lib/pending'
import { clearDraft, patientKeyOf } from '../lib/draft'

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
  const [reviewed, setReviewed] = useState(false)
  const [error, setError] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [dirty, setDirty] = useState(!initial.id)
  const abortRef = useRef<AbortController | null>(null)
  const [toast, showToast] = useToast()
  const type = record.type
  const reviewWarning = type === 'soap' ? record.soap?.reviewWarning?.trim() ?? '' : ''
  const hasReviewWarning = Boolean(reviewWarning && !/^なし[。.\s]*$/.test(reviewWarning))

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
    setReviewed(false)
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
    const text = fields.map((field) => `【${field.label}】\n${field.value}`).join('\n\n')
    showToast(await copyText(text)
      ? '全文をコピーしました'
      : 'コピーできませんでした。文章を長押しして手動でコピーしてください。')
  }

  const regenerate = async () => {
    if (!confirm('今の文章を破棄してAIで作り直しますか？（編集内容は消えます）')) return
    setError('')
    setLoading(true)
    setReviewed(false)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      if (type === 'soap') {
        const soap = await generateSoap(record.memo, record.vitals, record.previousSoap, { signal: controller.signal })
        setRecord((current) => ({ ...current, soap }))
      } else if (type === 'plan') {
        const plan = await generatePlan(record.memo, { signal: controller.signal })
        setRecord((current) => ({ ...current, plan }))
      } else {
        const report = await generateReport(record.memo, { signal: controller.signal })
        setRecord((current) => ({ ...current, report }))
      }
      setDirty(true)
      showToast('作り直しました。元メモと再度照合してください。')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'エラーが発生しました。')
    } finally {
      abortRef.current = null
      setLoading(false)
    }
  }

  const save = async () => {
    if (!reviewed) {
      setError('元の入力メモと生成結果を照合し、確認欄にチェックしてから保存してください。')
      return
    }
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
          {formatDateJa(record.visitDate)}・{record.patientName}
        </div>

        <p className="review-guidance">
          AIの文章は下書きです。各欄を元メモと照合し、必要に応じて編集してください。
        </p>

        {hasReviewWarning && (
          <div className="notice generation-warning" role="alert" aria-live="assertive">
            <strong>元メモに意味の確認が必要な語句があります</strong>
            <div>{reviewWarning}</div>
            <div>推測で訂正せず、正しい内容を確認してから各欄を修正してください。</div>
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
          <p className="memo-edit-hint">メモを直した場合は「AIで作り直す」を押してください。</p>
          <AutoGrowTextarea
            id="source-memo"
            label="元の入力メモ"
            value={record.memo}
            onChange={(event) => {
              setDirty(true)
              setReviewed(false)
              setRecord((current) => ({ ...current, memo: event.target.value }))
            }}
          />
        </section>

        <label className="review-check">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(event) => setReviewed(event.target.checked)}
          />
          <span>
            {hasReviewWarning
              ? '警告箇所を元メモで確認・修正し、入力にない事実が含まれていないことを確認した'
              : '元のメモと生成結果を照合し、入力にない事実が含まれていないことを確認した'}
          </span>
        </label>

        {error && <div className="error-box" role="alert" aria-live="assertive">{error}</div>}

        <button className="btn btn-primary" type="button" onClick={copyAll}>
          全文をコピー（カイポケ貼り付け用）
        </button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={save}
          disabled={saving || loading || !reviewed}
        >
          {saving ? '保存中…' : '保存して履歴へ'}
        </button>
        {loading ? (
          <button className="btn btn-ghost" type="button" onClick={() => abortRef.current?.abort()}>
            AI作成を中止
          </button>
        ) : (
          <button className="btn btn-ghost" type="button" onClick={regenerate} disabled={!record.memo}>
            AIで作り直す（再生成）
          </button>
        )}
      </main>
      {toast}
    </>
  )
}
