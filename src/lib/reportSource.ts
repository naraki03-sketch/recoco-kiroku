import { formatDateJa } from '../components/ui'
import type { RecordDoc, ReportBasis } from './types'
import { vitalsToText } from './types'

export interface Period {
  from: string
  to: string
}

function iso(year: number, monthIndex: number, day: number): string {
  const d = new Date(year, monthIndex, day)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 報告書の期間の初期値。10日までは前月分を書くことが多いので前月、11日以降は今月。 */
export function defaultPeriod(now: Date = new Date()): Period {
  const offset = now.getDate() <= 10 ? -1 : 0
  const year = now.getFullYear()
  const month = now.getMonth() + offset
  return { from: iso(year, month, 1), to: iso(year, month + 1, 0) }
}

/** 期間内のSOAP記録を日付の古い順に返す。 */
export function soapsInPeriod(records: RecordDoc[], period: Period): RecordDoc[] {
  return records
    .filter((r) => r.type === 'soap' && r.soap && r.visitDate >= period.from && r.visitDate <= period.to)
    .sort((a, b) => (a.visitDate < b.visitDate ? -1 : a.visitDate > b.visitDate ? 1 : (a.id ?? 0) - (b.id ?? 0)))
}

function soapBlock(record: RecordDoc): string {
  const lines = [`■${formatDateJa(record.visitDate)}`]
  const soap = record.soap!
  for (const [label, value] of [['S', soap.s], ['O', soap.o], ['A', soap.a], ['P', soap.p]] as const) {
    if (value?.trim()) lines.push(`${label}：${value.trim()}`)
  }
  const vitals = vitalsToText(record.vitals)
  if (vitals) lines.push(`数値：${vitals}`)
  return lines.join('\n')
}

/** AIに渡す「対象期間の記録」の文。名前の置き換えはこのあとで行う。 */
export function buildReportSource({ soaps, pasted, extra }: { soaps: RecordDoc[]; pasted: string; extra: string }): string {
  const sections: string[] = []
  if (soaps.length) sections.push(`【アプリの記録】\n${soaps.map(soapBlock).join('\n\n')}`)
  if (pasted.trim()) sections.push(`【貼り付けた記録】\n${pasted.trim()}`)
  if (extra.trim()) sections.push(`【付け足したこと】\n${extra.trim()}`)
  return sections.join('\n\n')
}

function monthDay(isoDate: string): string {
  const [, m, d] = isoDate.split('-')
  return `${Number(m)}月${Number(d)}日`
}

/** 結果画面に出す「何から作ったか」の一行。 */
export function describeBasis(basis: ReportBasis): string {
  const parts: string[] = []
  if (basis.soapDates.length) {
    parts.push(`${basis.soapDates.map(monthDay).join('・')}（アプリ${basis.soapDates.length}件）`)
  }
  if (basis.pasted) parts.push('貼り付け')
  if (basis.extra) parts.push('付け足し')
  return parts.join('＋')
}
