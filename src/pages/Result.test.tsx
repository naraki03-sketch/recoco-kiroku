import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecordDoc } from '../lib/types'
import Result from './Result'

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  put: vi.fn(),
  clearPendingRecord: vi.fn(),
  clearDraft: vi.fn()
}))

vi.mock('../lib/db', () => ({ db: { records: { add: mocks.add, put: mocks.put } } }))
vi.mock('../lib/pending', () => ({
  clearPendingRecord: mocks.clearPendingRecord,
  savePendingRecord: vi.fn()
}))
vi.mock('../lib/draft', () => ({ clearDraft: mocks.clearDraft, patientKeyOf: (id: number | '') => String(id || 'none') }))
vi.mock('../lib/prompts', () => ({
  generateSoap: vi.fn(), generatePlan: vi.fn(), generateReport: vi.fn()
}))

const record: RecordDoc = {
  type: 'soap', patientId: 1, patientName: 'QA利用者', visitDate: '2026-07-29',
  memo: '本人「よく眠れた」',
  soap: { s: '発言', o: '所見', a: '評価', p: '計画' },
  createdAt: 100, updatedAt: 100
}

afterEach(cleanup)

describe('Result save safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.add.mockResolvedValue(10)
  })

  it('音声入力の誤変換警告を目立つ形で表示し、確認欄にも反映する', () => {
    render(
      <Result
        record={{
          ...record,
          soap: { ...record.soap!, reviewWarning: '要確認：入力語句「下痢の不足」の意味を確認してください。' }
        }}
        onBack={vi.fn()}
        onSaved={vi.fn()}
      />
    )

    expect(screen.getByRole('alert')).toHaveTextContent('下痢の不足')
    expect(screen.getByRole('checkbox', { name: /警告箇所を元メモで確認/ })).toBeInTheDocument()
  })

  it('照合確認後にだけ保存し、成功後に未保存結果と元下書きを削除する', async () => {
    render(<Result record={record} onBack={vi.fn()} onSaved={vi.fn()} />)
    const saveButton = screen.getByRole('button', { name: '保存して履歴へ' })
    expect(saveButton).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /入力にない事実が含まれていない/ }))
    expect(saveButton).toBeEnabled()
    fireEvent.click(saveButton)

    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1))
    expect(mocks.clearPendingRecord).toHaveBeenCalledTimes(1)
    expect(mocks.clearDraft).toHaveBeenCalledWith('soap', '1')
  })
})
