import { describe, expect, it } from 'vitest'
import { validateVitals } from './clinicalValidation'
import type { Vitals } from './types'

const valid: Vitals = {
  temp: '36.5', bpHigh: '120', bpLow: '70', pulse: '70', spo2: '98', resp: '16'
}

describe('validateVitals', () => {
  it('妥当な値と全項目未入力を許可する', () => {
    expect(validateVitals(valid)).toEqual([])
    expect(validateVitals({ temp: '', bpHigh: '', bpLow: '', pulse: '', spo2: '', resp: '' })).toEqual([])
  })

  it('数値でない値・物理的に不正な値を拒否する', () => {
    expect(validateVitals({ ...valid, temp: 'abc', spo2: '150', resp: '-5' })).toEqual(
      expect.arrayContaining([
        expect.stringContaining('体温'),
        expect.stringContaining('SpO₂'),
        expect.stringContaining('呼吸数')
      ])
    )
  })

  it('血圧の片側だけの入力と上下逆転を拒否する', () => {
    expect(validateVitals({ ...valid, bpLow: '' })[0]).toContain('収縮期と拡張期')
    expect(validateVitals({ ...valid, bpHigh: '60', bpLow: '100' })[0]).toContain('収縮期は拡張期より')
  })
})
