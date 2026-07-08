import { useState } from 'react'
import { db } from '../lib/db'
import { generatePlan, generateReport, generateSoap } from '../lib/prompts'
import type { PlanResult, RecordDoc, ReportResult, SoapResult } from '../lib/types'
import { DOC_META } from '../lib/types'
import { copyText, formatDateJa, Header, useToast } from '../components/ui'

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

export default function Result({ record: initial, onBack, onSaved }: Props) {
  const [record, setRecord] = useState<RecordDoc>(initial)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [toast, showToast] = useToast()

  const type = record.type

  const fields =
    type === 'soap'
      ? SOAP_LABELS.map(({ key, label }) => ({ key: key as string, label, value: record.soap?.[key] ?? '' }))
      : type === 'plan'
        ? PLAN_LABELS.map(({ key, label }) => ({ key: key as string, label, value: record.plan?.[key] ?? '' }))
        : REPORT_LABELS.map(({ key, label }) => ({ key: key as string, label, value: record.report?.[key] ?? '' }))

  const updateField = (key: string, value: string) => {
    setRecord((r) => {
      if (r.type === 'soap') return { ...r, soap: { ...(r.soap as SoapResult), [key]: value } }
      if (r.type === 'plan') return { ...r, plan: { ...(r.plan as PlanResult), [key]: value } }
      return { ...r, report: { ...(r.report as ReportResult), [key]: value } }
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
    const text = fields.map((f) => `【${f.label}】\n${f.value}`).join('\n\n')
    if (await copyText(text)) {
      showToast('全文をコピーしました')
    } else {
      showToast('コピーできませんでした。文章を長押しして手動でコピーしてください。')
    }
  }

  const regenerate = async () => {
    setError('')
    setLoading(true)
    try {
      if (type === 'soap') {
        const soap = await generateSoap(record.memo, record.vitals)
        setRecord((r) => ({ ...r, soap }))
      } else if (type === 'plan') {
        const plan = await generatePlan(record.memo)
        setRecord((r) => ({ ...r, plan }))
      } else {
        const report = await generateReport(record.memo)
        setRecord((r) => ({ ...r, report }))
      }
      showToast('作り直しました')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'エラーが発生しました。')
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    const now = Date.now()
    const doc = { ...record, updatedAt: now }
    if (doc.id) {
      await db.records.put(doc)
    } else {
      doc.id = await db.records.add(doc)
    }
    setRecord(doc)
    showToast('保存しました')
    setTimeout(onSaved, 600)
  }

  return (
    <>
      <Header title={`${DOC_META[type].short}の下書き`} onBack={onBack} />
      <div className="page">
        <div className="meta-line">
          <span className={`badge ${DOC_META[type].badgeClass}`}>{DOC_META[type].short}</span>
          {formatDateJa(record.visitDate)}
          {record.patientName ? `・${record.patientName}` : ''}
        </div>

        {fields.map((f) => (
          <div className="card result-section" key={f.key}>
            <div className="sec-head">
              <span className="sec-title">{f.label}</span>
              <button
                className={`btn-small${copiedKey === f.key ? ' copied' : ''}`}
                onClick={() => copyField(f.key, f.label, f.value)}
              >
                {copiedKey === f.key ? '✓ コピー済' : 'コピー'}
              </button>
            </div>
            <textarea
              rows={Math.max(3, Math.min(10, f.value.split('\n').length + 2))}
              value={f.value}
              onChange={(e) => updateField(f.key, e.target.value)}
            />
          </div>
        ))}

        {record.memo && (
          <details className="memo-view">
            <summary>元のメモを見る</summary>
            <p>{record.memo}</p>
          </details>
        )}

        {error && <div className="error-box">{error}</div>}

        <button className="btn btn-primary" onClick={copyAll}>
          全文をコピー（カイポケ貼り付け用）
        </button>
        <button className="btn btn-secondary" onClick={save}>
          保存して履歴へ
        </button>
        <button className="btn btn-ghost" onClick={regenerate} disabled={loading || !record.memo}>
          {loading ? 'AIが作り直し中…' : 'AIで作り直す（再生成）'}
        </button>
      </div>
      {toast}
    </>
  )
}
