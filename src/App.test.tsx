import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { RecordDoc } from './lib/types'

const pending: RecordDoc = {
  type: 'soap',
  patientId: 1,
  patientName: 'QA利用者',
  visitDate: '2026-07-29',
  memo: '復元対象メモ',
  soap: { s: '発言', o: '所見', a: '評価', p: '計画' },
  createdAt: 100,
  updatedAt: 100
}

vi.mock('./lib/pending', () => ({ loadPendingRecord: () => pending }))
vi.mock('./pages/Home', () => ({ default: () => <div>ホーム画面</div> }))
vi.mock('./pages/InputForm', () => ({ default: () => <div>入力画面</div> }))
vi.mock('./pages/Result', () => ({
  default: ({ record }: { record: RecordDoc }) => <div>未保存結果:{record.memo}</div>
}))
vi.mock('./pages/History', () => ({ default: () => <div>履歴画面</div> }))
vi.mock('./pages/Settings', () => ({ default: () => <div>設定画面</div> }))

import App from './App'

describe('App pending recovery', () => {
  it('再読み込み時に未保存の生成結果を復元する', () => {
    render(<App />)
    expect(screen.getByText('未保存結果:復元対象メモ')).toBeInTheDocument()
  })
})
