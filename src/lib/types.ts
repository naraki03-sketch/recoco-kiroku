export interface Patient {
  id?: number
  /** 端末やバックアップをまたいで同一人物を識別する内部ID。氏名では照合しない。 */
  uuid?: string
  name: string
  createdAt: number
}

export interface Vitals {
  temp: string // 体温
  bpHigh: string // 収縮期血圧
  bpLow: string // 拡張期血圧
  pulse: string // 脈拍
  spo2: string // SpO2
  resp: string // 呼吸数
}

export const emptyVitals: Vitals = {
  temp: '',
  bpHigh: '',
  bpLow: '',
  pulse: '',
  spo2: '',
  resp: ''
}

export interface SoapResult {
  s: string
  o: string
  a: string
  p: string
  /** 音声入力の誤変換・意味不明語など、保存前に確認が必要な事項。問題がなければ「なし」。 */
  reviewWarning?: string
  /** 話されていない欄の案内。改行区切り。なければ「なし」。貼り付け文には入れない。 */
  missing?: string
}

/** 再生成時にも同じ前回記録を使うため、生成時の参照情報を保持する。 */
export interface PreviousSoapContext {
  visitDate: string
  o: string
  a: string
  vitalsText: string
}

export interface PlanResult {
  goal: string // 看護・リハビリテーションの目標
  issues: string // 療養上の課題・支援内容（問題点・解決策）
  evaluation: string // 評価
}

export interface ReportResult {
  progress: string // 病状の経過
  careContent: string // 看護・リハビリテーションの内容
  homeCare: string // 家庭での介護の状況
  notes: string // 特記すべき事項
  /** 足りない欄の案内。改行区切り。なければ「なし」。貼り付け文には入れない。 */
  missing?: string
}

/** 報告書を何から作ったか（結果画面の表示と作り直しのため）。 */
export interface ReportBasis {
  from: string // 期間の始め YYYY-MM-DD
  to: string // 期間の終わり YYYY-MM-DD
  soapDates: string[] // 選んだアプリ内SOAPの訪問日
  pasted: boolean // 貼り付けた記録があるか
  extra: boolean // 付け足しがあるか
  masked: boolean // 利用者名を「利用者」に置き換えたか
}

export type RecordType = 'soap' | 'plan' | 'report'

export interface RecordDoc {
  id?: number
  /** バックアップ再取込時の重複を防ぐ内部ID。 */
  uuid?: string
  type: RecordType
  patientId?: number
  patientName: string
  visitDate: string // YYYY-MM-DD
  memo: string
  vitals?: Vitals
  previousSoap?: PreviousSoapContext
  soap?: SoapResult
  plan?: PlanResult
  report?: ReportResult
  reportBasis?: ReportBasis
  createdAt: number
  updatedAt: number
}

/** 書類タイプごとの表示情報（各画面で共通利用） */
export const DOC_META: Record<RecordType, { short: string; badgeClass: string }> = {
  soap: { short: 'SOAP記録', badgeClass: '' },
  plan: { short: '計画書', badgeClass: 'plan' },
  report: { short: '報告書', badgeClass: 'report' }
}

export function vitalsToText(v: Vitals | undefined): string {
  if (!v) return ''
  const parts: string[] = []
  if (v.temp) parts.push(`体温${v.temp}℃`)
  if (v.bpHigh || v.bpLow) parts.push(`血圧${v.bpHigh}/${v.bpLow}mmHg`)
  if (v.pulse) parts.push(`脈拍${v.pulse}回/分`)
  if (v.spo2) parts.push(`SpO2 ${v.spo2}%`)
  if (v.resp) parts.push(`呼吸数${v.resp}回/分`)
  return parts.join('、')
}
