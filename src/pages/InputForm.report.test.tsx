import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecordDoc } from '../lib/types'
import InputForm from './InputForm'

const mocks = vi.hoisted(() => ({
  generateReport: vi.fn(),
  savePendingRecord: vi.fn(),
  records: [] as unknown[]
}))

vi.mock('../lib/db', () => ({
  db: {
    patients: {
      orderBy: () => ({ toArray: async () => [{ id: 1, name: '山田 太郎', createdAt: 1 }] }),
      add: vi.fn()
    },
    records: {
      where: () => ({ equals: () => ({ toArray: async () => mocks.records }) })
    }
  }
}))

vi.mock('../lib/draft', () => ({
  clearDraft: vi.fn(),
  latestDraft: () => null,
  listDrafts: () => ({}),
  loadDraft: () => null,
  patientKeyOf: (id: number | '') => (id === '' ? 'none' : String(id)),
  saveDraft: vi.fn()
}))

vi.mock('../lib/prompts', () => ({
  generateSoap: vi.fn(),
  generatePlan: vi.fn(),
  generateReport: mocks.generateReport
}))

vi.mock('../lib/settings', () => ({ getActiveApiKey: () => 'test-key' }))
vi.mock('../lib/pending', () => ({ savePendingRecord: mocks.savePendingRecord }))

function soap(id: number, visitDate: string, o: string): RecordDoc {
  return {
    id, type: 'soap', patientId: 1, patientName: '山田 太郎', visitDate, memo: '',
    soap: { s: '', o, a: '', p: '' }, createdAt: 1, updatedAt: 1
  }
}

async function openForm() {
  const onGenerated = vi.fn()
  render(<InputForm type="report" onBack={vi.fn()} onGenerated={onGenerated} goSettings={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: '山田 太郎' }))
  fireEvent.change(screen.getByLabelText('期間のはじめ'), { target: { value: '2026-11-01' } })
  fireEvent.change(screen.getByLabelText('期間のおわり'), { target: { value: '2026-11-30' } })
  return onGenerated
}

describe('InputForm 報告書のまとめ', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.records = [
      soap(1, '2026-11-05', '下肢浮腫あり'),
      soap(2, '2026-11-12', '浮腫やや軽減'),
      soap(3, '2026-10-29', '期間外'),
      soap(4, '2026-11-26', '浮腫軽減')
    ]
    mocks.generateReport.mockResolvedValue({ progress: '経過', careContent: '内容', homeCare: '', notes: '', missing: 'なし' })
  })
  afterEach(cleanup)

  it('期間内のSOAPを日付順に並べ、最初は全部選んでおく', async () => {
    await openForm()
    const boxes = await screen.findAllByRole('checkbox', { name: /2026年11月/ })
    expect(boxes.map((box) => box.getAttribute('aria-label'))).toEqual([
      '2026年11月5日の記録を使う',
      '2026年11月12日の記録を使う',
      '2026年11月26日の記録を使う'
    ])
    expect(boxes.every((box) => (box as HTMLInputElement).checked)).toBe(true)
  })

  it('外した日は送らず、貼り付けた記録の名前は「利用者」にして送る', async () => {
    const onGenerated = await openForm()
    fireEvent.click(await screen.findByRole('checkbox', { name: '2026年11月12日の記録を使う' }))
    fireEvent.change(screen.getByLabelText('カイポケの記録'), { target: { value: '11/20 山田太郎様 発熱なし' } })
    fireEvent.click(screen.getByRole('button', { name: 'まとめて報告書をつくる' }))

    await waitFor(() => expect(mocks.generateReport).toHaveBeenCalled())
    const sent = mocks.generateReport.mock.calls[0][0] as string
    expect(sent).toContain('■2026年11月5日\nO：下肢浮腫あり')
    expect(sent).toContain('■2026年11月26日\nO：浮腫軽減')
    expect(sent).not.toContain('浮腫やや軽減')
    expect(sent).toContain('【貼り付けた記録】\n11/20 利用者様 発熱なし')
    expect(sent).not.toContain('山田')

    const record = onGenerated.mock.calls[0][0] as RecordDoc
    expect(record.type).toBe('report')
    expect(record.visitDate).toBe('2026-11-30')
    expect(record.memo).toBe(sent)
    expect(record.reportBasis).toEqual({
      from: '2026-11-01', to: '2026-11-30', soapDates: ['2026-11-05', '2026-11-26'], pasted: true, extra: false, masked: true
    })
  })

  it('記録も貼り付けも付け足しもないときは作らずに知らせる', async () => {
    mocks.records = []
    await openForm()
    expect(await screen.findByText('この期間に、アプリで保存したSOAPはありません。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'まとめて報告書をつくる' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('記録を選ぶか、貼り付けるか、話してください。')
    expect(mocks.generateReport).not.toHaveBeenCalled()
  })

  it('期間のはじめがおわりより後なら知らせる', async () => {
    await openForm()
    fireEvent.change(screen.getByLabelText('期間のはじめ'), { target: { value: '2026-12-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'まとめて報告書をつくる' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('期間のはじめと終わりを確かめてください。')
    expect(mocks.generateReport).not.toHaveBeenCalled()
  })
})
