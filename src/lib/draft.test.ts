import { beforeEach, describe, expect, it } from 'vitest'
import { loadDraft, saveDraft } from './draft'
import { emptyVitals } from './types'

describe('draft', () => {
  beforeEach(() => localStorage.clear())

  it('報告書で貼り付けだけ書いた下書きも残す', () => {
    saveDraft('report', '1', { patientId: 1, visitDate: '2026-11-30', vitals: emptyVitals, memo: '', pasted: '11/20 発熱なし' })
    expect(loadDraft('report', '1')?.pasted).toBe('11/20 発熱なし')
  })

  it('メモも貼り付けも空なら下書きを残さない', () => {
    saveDraft('report', '1', { patientId: 1, visitDate: '2026-11-30', vitals: emptyVitals, memo: ' ', pasted: '' })
    expect(loadDraft('report', '1')).toBeNull()
  })
})
