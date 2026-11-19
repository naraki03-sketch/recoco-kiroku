import { describe, expect, it } from 'vitest'
import { buildReportSource, defaultPeriod, describeBasis, soapsInPeriod } from './reportSource'
import type { RecordDoc } from './types'

function soap(id: number, visitDate: string, extra: Partial<RecordDoc> = {}): RecordDoc {
  return {
    id,
    type: 'soap',
    patientId: 1,
    patientName: 'QA利用者',
    visitDate,
    memo: '',
    soap: { s: `S${id}`, o: `O${id}`, a: `A${id}`, p: `P${id}` },
    createdAt: 1,
    updatedAt: 1,
    ...extra
  }
}

describe('defaultPeriod', () => {
  it('10日までは前月の1日〜末日', () => {
    expect(defaultPeriod(new Date(2026, 11, 10))).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(defaultPeriod(new Date(2026, 0, 3))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('11日以降は今月の1日〜末日', () => {
    expect(defaultPeriod(new Date(2026, 10, 19))).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(defaultPeriod(new Date(2028, 1, 20))).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })
})

describe('soapsInPeriod', () => {
  it('期間内のSOAPだけを日付の古い順に返す', () => {
    const rows = [
      soap(3, '2026-11-26'),
      soap(1, '2026-11-05'),
      soap(9, '2026-10-31'),
      soap(2, '2026-11-30'),
      { ...soap(4, '2026-11-12'), type: 'report' as const, soap: undefined },
      soap(5, '2026-12-01')
    ]
    expect(soapsInPeriod(rows, { from: '2026-11-01', to: '2026-11-30' }).map((r) => r.id)).toEqual([1, 3, 2])
  })
})

describe('buildReportSource', () => {
  it('アプリの記録は日付付きで、空の欄は省いて並べる', () => {
    const text = buildReportSource({
      soaps: [
        soap(1, '2026-11-05', { vitals: { temp: '36.5', bpHigh: '', bpLow: '', pulse: '', spo2: '', resp: '' } }),
        soap(2, '2026-11-12', { soap: { s: '', o: '浮腫軽減', a: '', p: '' } })
      ],
      pasted: '',
      extra: ''
    })
    expect(text).toBe(
      '【アプリの記録】\n' +
        '■2026年11月5日\nS：S1\nO：O1\nA：A1\nP：P1\n数値：体温36.5℃\n\n' +
        '■2026年11月12日\nO：浮腫軽減'
    )
  })

  it('貼り付けと付け足しは見出しを付けて後ろに足す', () => {
    const text = buildReportSource({ soaps: [], pasted: '  11/20 発熱なし  ', extra: '家族の介護負担あり' })
    expect(text).toBe('【貼り付けた記録】\n11/20 発熱なし\n\n【付け足したこと】\n家族の介護負担あり')
  })
})

describe('describeBasis', () => {
  it('元にした記録を一行で表す', () => {
    expect(
      describeBasis({ from: '2026-11-01', to: '2026-11-30', soapDates: ['2026-11-05', '2026-11-12'], pasted: true, extra: false, masked: false })
    ).toBe('11月5日・11月12日（アプリ2件）＋貼り付け')
    expect(
      describeBasis({ from: '2026-11-01', to: '2026-11-30', soapDates: [], pasted: false, extra: true, masked: false })
    ).toBe('付け足し')
  })
})
