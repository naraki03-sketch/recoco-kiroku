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
    mocks.generateSoap.mockResolvedValue({ soap: { s: '発言', o: '所見', a: '評価', p: '計画' }, vitals: { temp: '', bpHigh: '', bpLow: '', pulse: '', spo2: '', resp: '' } })
  })
  afterEach(cleanup)

  it.each([
    ['soap', '本人・家族の訴えや発言', '本人より「昨夜は2時間ほどしか眠れなかった」との訴えあり。'],
    ['plan', '本人・家族の希望や生活上の目標', '本人は自宅での生活を継続したいと希望。'],
    ['report', '対象期間中の状態や症状の変化', '対象期間中、発熱なし。']
  ] as const)('%s画面では書き方の指針と例文を畳んだ中に置く', (type, guidance, example) => {
    render(
      <InputForm
        type={type as RecordType}
        onBack={vi.fn()}
        onGenerated={vi.fn()}
        goSettings={vi.fn()}
      />
    )

    const details = screen.getByText('書き方の例を見る').closest('details')!
    expect(details).not.toHaveAttribute('open')
    expect(details).toHaveTextContent(guidance)
    expect(details).toHaveTextContent(example)
    expect(details).toHaveTextContent('分かる範囲の事実だけを書いてください')
  })

  it('利用者を選ばずに押すと、名前を選ぶよう伝えて生成しない', async () => {
    render(<InputForm type="soap" onBack={vi.fn()} onGenerated={vi.fn()} goSettings={vi.fn()} />)
    await screen.findByRole('button', { name: 'QA利用者' })
    fireEvent.click(screen.getByRole('button', { name: '文章にする' }))
    expect(screen.getByRole('alert')).toHaveTextContent('名前を押して選んでください')
    expect(mocks.generateSoap).not.toHaveBeenCalled()
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

    fireEvent.click(await screen.findByRole('button', { name: 'QA利用者' }))
    expect(screen.getByRole('button', { name: 'QA利用者' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByPlaceholderText(/本人から夜眠れない/), {
      target: { value: '本人「よく眠れた」' }
    })
    fireEvent.click(screen.getByRole('button', { name: '文章にする' }))

    await waitFor(() => expect(onGenerated).toHaveBeenCalledTimes(1))
    expect(mocks.clearDraft).not.toHaveBeenCalled()
    expect(mocks.savePendingRecord).toHaveBeenCalledWith(onGenerated.mock.calls[0][0])
  })
  it('数値の手入力欄は畳んであり、声で入ることを案内する', async () => {
    render(<InputForm type="soap" onBack={vi.fn()} onGenerated={vi.fn()} goSettings={vi.fn()} />)
    expect(screen.getByText('数値を手で入れる（声で言えば不要）').closest('details')).not.toHaveAttribute('open')
    expect(screen.getByText(/体温や血圧も、そのまま話せば入ります/)).toBeInTheDocument()
  })
})
