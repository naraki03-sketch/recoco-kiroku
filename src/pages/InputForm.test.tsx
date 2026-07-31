import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RecordType } from '../lib/types'
import InputForm from './InputForm'

const mocks = vi.hoisted(() => ({
  clearDraft: vi.fn(),
  saveDraft: vi.fn(),
  savePendingRecord: vi.fn(),
  generateSoap: vi.fn()
}))

vi.mock('../lib/db', () => ({
  db: {
    patients: {
      orderBy: () => ({ toArray: async () => [{ id: 1, name: 'QA利用者', createdAt: 1 }] }),
      add: vi.fn()
    },
    records: {
      where: () => ({ equals: () => ({ toArray: async () => [] }) })
    }
  }
}))

vi.mock('../lib/draft', () => ({
  clearDraft: mocks.clearDraft,
  latestDraft: () => null,
  listDrafts: () => ({}),
  loadDraft: () => null,
  patientKeyOf: (id: number | '') => (id === '' ? 'none' : String(id)),
  saveDraft: mocks.saveDraft
}))

vi.mock('../lib/prompts', () => ({
  generateSoap: mocks.generateSoap,
  generatePlan: vi.fn(),
  generateReport: vi.fn()
}))

vi.mock('../lib/settings', () => ({ getActiveApiKey: () => 'test-key' }))
vi.mock('../lib/pending', () => ({ savePendingRecord: mocks.savePendingRecord }))

describe('InputForm generation safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateSoap.mockResolvedValue({ s: '発言', o: '所見', a: '評価', p: '計画' })
  })
  afterEach(cleanup)

  it.each([
    ['soap', '本人・家族の訴えや発言', '本人より「昨夜は2時間ほどしか眠れなかった」との訴えあり。'],
    ['plan', '本人・家族の希望や生活上の目標', '本人は自宅での生活を継続したいと希望。'],
    ['report', '対象期間中の状態や症状の変化', '対象期間中、発熱なし。']
  ] as const)('%s画面に入力する内容と具体例を常時表示する', (type, guidance, example) => {
    render(
      <InputForm
        type={type as RecordType}
        onBack={vi.fn()}
        onGenerated={vi.fn()}
        goSettings={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: '入力する内容' })).toBeInTheDocument()
    expect(screen.getByText(guidance)).toBeInTheDocument()
    expect(screen.getByText(example, { exact: false })).toBeInTheDocument()
    expect(screen.getByText(/分かる範囲の事実だけを書いてください/)).toBeInTheDocument()
  })

  it('生成後も入力下書きを残し、未保存結果を退避する', async () => {
    const onGenerated = vi.fn()
    render(
      <InputForm
        type="soap"
        onBack={vi.fn()}
        onGenerated={onGenerated}
        goSettings={vi.fn()}
      />
    )

    await screen.findByRole('option', { name: 'QA利用者' })
    fireEvent.change(screen.getByLabelText('利用者（必須）'), { target: { value: '1' } })
    fireEvent.change(screen.getByPlaceholderText(/本人から夜眠れない/), {
      target: { value: '本人「よく眠れた」' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'AIで文章にする' }))

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1))
    expect(mocks.clearDraft).not.toHaveBeenCalled()
    expect(mocks.savePendingRecord).toHaveBeenCalledWith(onGenerated.mock.calls[0][0])
  })
})
