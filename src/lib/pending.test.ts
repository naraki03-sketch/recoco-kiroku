import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecordDoc } from './types'
import { clearPendingRecord, loadPendingRecord, savePendingRecord } from './pending'

const record: RecordDoc = {
  type: 'soap',
  patientId: 1,
  patientName: 'QA利用者',
  visitDate: '2026-07-29',
  memo: '本人「よく眠れた」',
  vitals: { temp: '36.5', bpHigh: '120', bpLow: '70', pulse: '70', spo2: '98', resp: '16' },
  soap: { s: '「よく眠れた」', o: '著変なし', a: '入力事実の範囲で状態安定', p: '経過観察' },
  createdAt: 100,
  updatedAt: 100
}

describe('pending record', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('生成後の未保存記録を再読み込みできる', () => {
    savePendingRecord(record)
    expect(loadPendingRecord()).toEqual(record)
  })

  it('保存後に未保存記録を削除できる', () => {
    savePendingRecord(record)
    clearPendingRecord()
    expect(loadPendingRecord()).toBeNull()
  })

  it('壊れたデータは復元しない', () => {
    localStorage.setItem('recoco.pendingRecord', '{"type":"soap"}')
    expect(loadPendingRecord()).toBeNull()
  })
})
