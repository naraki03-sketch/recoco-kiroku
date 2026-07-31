import type { Vitals } from './types'

interface Rule {
  key: keyof Vitals
  label: string
  min: number
  max: number
  integer: boolean
  unit: string
}

const RULES: Rule[] = [
  { key: 'temp', label: '体温', min: 25, max: 45, integer: false, unit: '℃' },
  { key: 'bpHigh', label: '収縮期血圧', min: 40, max: 300, integer: true, unit: 'mmHg' },
  { key: 'bpLow', label: '拡張期血圧', min: 20, max: 200, integer: true, unit: 'mmHg' },
  { key: 'pulse', label: '脈拍', min: 20, max: 250, integer: true, unit: '回/分' },
  { key: 'spo2', label: 'SpO₂', min: 30, max: 100, integer: true, unit: '%' },
  { key: 'resp', label: '呼吸数', min: 1, max: 80, integer: true, unit: '回/分' }
]

/** 明らかな誤入力だけを止めるための広い安全範囲。異常値そのものは記録できる。 */
export function validateVitals(vitals: Vitals): string[] {
  const errors: string[] = []
  const hasHigh = vitals.bpHigh.trim() !== ''
  const hasLow = vitals.bpLow.trim() !== ''
  if (hasHigh !== hasLow) {
    errors.push('血圧は収縮期と拡張期を両方入力してください。')
  }

  for (const rule of RULES) {
    const raw = vitals[rule.key].trim()
    if (!raw) continue
    const value = Number(raw)
    if (!Number.isFinite(value) || (rule.integer && !Number.isInteger(value))) {
      errors.push(`${rule.label}は${rule.integer ? '整数' : '数値'}で入力してください。`)
      continue
    }
    if (value < rule.min || value > rule.max) {
      errors.push(`${rule.label}は${rule.min}〜${rule.max}${rule.unit}の範囲で入力してください。`)
    }
  }

  const high = Number(vitals.bpHigh)
  const low = Number(vitals.bpLow)
  if (hasHigh && hasLow && Number.isFinite(high) && Number.isFinite(low) && high <= low) {
    errors.push('収縮期は拡張期より大きい値を入力してください。')
  }
  return errors
}
