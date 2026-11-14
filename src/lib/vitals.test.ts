import { describe, expect, it } from 'vitest'
import { mergeVitals, normalizeSpokenVitals } from './vitals'

const empty = { temp: '', bpHigh: '', bpLow: '', pulse: '', spo2: '', resp: '' }

describe('normalizeSpokenVitals', () => {
  it('単位や全角数字を除いて半角数値にする', () => {
    expect(
      normalizeSpokenVitals({ temp: '36度5分', bpHigh: '１２８', bpLow: '76mmHg', pulse: '72回', spo2: '98％', resp: '' })
    ).toEqual({ temp: '36.5', bpHigh: '128', bpLow: '76', pulse: '72', spo2: '98', resp: '' })
  })

  it('数値にできない値と範囲外の値は空にする', () => {
    expect(normalizeSpokenVitals({ temp: '平熱', pulse: '900', spo2: '98' })).toEqual({ ...empty, spo2: '98' })
  })

  it('血圧の片方が使えなければ両方空にする', () => {
    expect(normalizeSpokenVitals({ bpHigh: '128', bpLow: '不明' })).toEqual(empty)
  })
})

describe('mergeVitals', () => {
  it('手入力を優先し、空の項目だけ声の値で埋める', () => {
    expect(mergeVitals({ ...empty, temp: '37.0' }, { ...empty, temp: '36.5', pulse: '72' })).toEqual({
      ...empty,
      temp: '37.0',
      pulse: '72'
    })
  })

  it('血圧は手入力があれば上下とも手入力を使う', () => {
    expect(mergeVitals({ ...empty, bpHigh: '130', bpLow: '80' }, { ...empty, bpHigh: '128', bpLow: '76' })).toMatchObject({
      bpHigh: '130',
      bpLow: '80'
    })
  })

  it('手入力がundefinedなら声の値をそのまま使う', () => {
    expect(mergeVitals(undefined, { ...empty, spo2: '97' })).toEqual({ ...empty, spo2: '97' })
  })
})
