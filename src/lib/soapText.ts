import type { SoapResult } from './types'

export type SoapLabel = 'S' | 'O' | 'A' | 'P'

const SOAP_KEYS: { key: 's' | 'o' | 'a' | 'p'; label: SoapLabel }[] = [
  { key: 's', label: 'S' },
  { key: 'o', label: 'O' },
  { key: 'a', label: 'A' },
  { key: 'p', label: 'P' }
]

/** カルテに貼ってはいけない断り書き。 */
const PLACEHOLDER = /未確認（|要確認（|評価困難/

/** カイポケの経過記録欄へ1回で貼るための文。確認用の項目は入れない。 */
export function formatSoapForCopy(soap: SoapResult): string {
  return SOAP_KEYS.map(({ key, label }) => `${label}：${(soap[key] ?? '').trim()}`).join('\n')
}

/** 「未確認」などの断り書きが残っている欄。 */
export function findPlaceholders(soap: SoapResult): SoapLabel[] {
  return SOAP_KEYS.filter(({ key }) => PLACEHOLDER.test(soap[key] ?? '')).map(({ label }) => label)
}

/** S・O・A・Pがすべて空かどうか。 */
export function isSoapEmpty(soap: SoapResult): boolean {
  return SOAP_KEYS.every(({ key }) => !(soap[key] ?? '').trim())
}

/** AIが書いた「足りないところ」を1行ずつに分ける。空行と「なし」は除く。 */
export function parseMissing(missing: string | undefined): string[] {
  return (missing ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('なし'))
}
