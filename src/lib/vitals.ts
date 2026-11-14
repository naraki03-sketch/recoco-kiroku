import { validateVitals } from './clinicalValidation'
import { emptyVitals, type Vitals } from './types'

const KEYS: (keyof Vitals)[] = ['temp', 'bpHigh', 'bpLow', 'pulse', 'spo2', 'resp']

/** 声で言った値（AIが拾った文字列）を半角の数値文字列にする。数値にできなければ空。 */
function toNumberText(raw: string | undefined): string {
  let t = (raw ?? '').trim()
  if (!t) return ''
  // 全角数字・全角ピリオドを半角へ
  t = t.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
  // 「36度5分」→「36.5」
  const doBu = t.match(/^(\d+)\s*度\s*(\d)\s*分$/)
  if (doBu) return `${doBu[1]}.${doBu[2]}`
  t = t.replace(/\s+/g, '').replace(/(℃|度|mmHg|回\/分|\/分|回|%|％)$/i, '')
  return /^\d+(\.\d+)?$/.test(t) ? t : ''
}

/** 範囲外の項目を空にする（血圧は上下1組で判定）。 */
function dropOutOfRange(v: Vitals): Vitals {
  const out = { ...v }
  for (const key of ['temp', 'pulse', 'spo2', 'resp'] as const) {
    if (out[key] && validateVitals({ ...emptyVitals, [key]: out[key] }).length) out[key] = ''
  }
  const bpOk =
    out.bpHigh &&
    out.bpLow &&
    validateVitals({ ...emptyVitals, bpHigh: out.bpHigh, bpLow: out.bpLow }).length === 0
  if (!bpOk) {
    out.bpHigh = ''
    out.bpLow = ''
  }
  return out
}

/** AIが拾った声のバイタルを、記録に入れられる形へ整える。 */
export function normalizeSpokenVitals(raw: Partial<Record<keyof Vitals, string>>): Vitals {
  const v = { ...emptyVitals }
  for (const key of KEYS) v[key] = toNumberText(raw[key])
  return dropOutOfRange(v)
}

/** 手入力を優先し、空の項目だけ声の値で埋める。血圧は上下を1組として扱う。 */
export function mergeVitals(typed: Vitals | undefined, spoken: Vitals): Vitals {
  const t = typed ?? emptyVitals
  const out = { ...emptyVitals }
  for (const key of ['temp', 'pulse', 'spo2', 'resp'] as const) {
    out[key] = t[key].trim() ? t[key] : spoken[key]
  }
  const typedBp = t.bpHigh.trim() || t.bpLow.trim()
  out.bpHigh = typedBp ? t.bpHigh : spoken.bpHigh
  out.bpLow = typedBp ? t.bpLow : spoken.bpLow
  return out
}
