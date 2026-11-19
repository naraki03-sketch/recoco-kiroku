import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyVitals, type RecordDoc } from '../lib/types'
import Result from './Result'

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  put: vi.fn(),
  clearPendingRecord: vi.fn(),
  clearDraft: vi.fn(),
  generateSoap: vi.fn(),
  generateReport: vi.fn()
}))

vi.mock('../lib/db', () => ({
  db: {
    records: { add: mocks.add, put: mocks.put },
    patients: { toArray: async () => [{ id: 1, name: '山田 太郎', createdAt: 1 }] }
  }
}))
vi.mock('../lib/pending', () => ({
  clearPendingRecord: mocks.clearPendingRecord,
  savePendingRecord: vi.fn()
}))
vi.mock('../lib/draft', () => ({ clearDraft: mocks.clearDraft, patientKeyOf: (id: number | '') => String(id || 'none') }))
vi.mock('../lib/prompts', () => ({
  generateSoap: mocks.generateSoap, generatePlan: vi.fn(), generateReport: mocks.generateReport
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

  it('警告があるときは保存の確認文に「確認が必要な言葉」を含める', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <Result
        record={{ ...record, soap: { ...record.soap!, reviewWarning: '要確認：入力語句「下痢の不足」の意味を確認してください。' } }}
        onBack={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByRole('alert')).toHaveTextContent('下痢の不足')
    fireEvent.click(screen.getByRole('button', { name: '確認して保存' }))
    expect(confirm.mock.calls[0][0]).toContain('確認が必要な言葉があります')
    expect(mocks.add).not.toHaveBeenCalled()
  })

  it('確認でOKを押したときだけ保存し、未保存結果と元下書きを削除する', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<Result record={record} onBack={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.queryByRole('checkbox')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '確認して保存' }))
    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1))
    expect(mocks.clearPendingRecord).toHaveBeenCalledTimes(1)
    expect(mocks.clearDraft).toHaveBeenCalledWith('soap', '1')
  })

  it('全部コピーはS：O：A：P：の1つの文をクリップボードへ入れる', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<Result record={record} onBack={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(screen.getAllByRole('button', { name: '全部コピー（カイポケに貼る）' })[0])
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('S：発言\nO：所見\nA：評価\nP：計画'))
  })

  it('「未確認」が残る欄があれば貼る前の注意を出す', () => {
    render(
      <Result
        record={{ ...record, soap: { ...record.soap!, p: '要確認（計画の入力なし）' } }}
        onBack={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByRole('status')).toHaveTextContent('P に残っています')
  })

  it('計画書では従来の「全文をコピー」を使う', () => {
    render(
      <Result
        record={{ ...record, type: 'plan', soap: undefined, plan: { goal: 'G', issues: 'I', evaluation: 'E' } }}
        onBack={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: '全文をコピー（カイポケ貼り付け用）' })).toBeInTheDocument()
  })
  const withMissing = { ...record, soap: { ...record.soap!, p: '', missing: 'Pが話されていません。次回みること・続けることを一言足してください。' } }

  it('足りないところを文章の外に出し、コピー文には入れない', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<Result record={withMissing} onBack={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByRole('region', { name: '足りないところ' })).toHaveTextContent('Pが話されていません')
    fireEvent.click(screen.getAllByRole('button', { name: '全部コピー（カイポケに貼る）' })[0])
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('S：発言\nO：所見\nA：評価\nP：'))
  })

  it('話し足すとメモに追記して作り直し、確認は出さない', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    mocks.generateSoap.mockResolvedValue({ soap: { s: '発言', o: '所見', a: '評価', p: '浮腫の観察を継続', missing: 'なし' }, vitals: emptyVitals })
    render(<Result record={withMissing} onBack={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('話し足す内容'), { target: { value: '次回も浮腫を観察' } })
    fireEvent.click(screen.getByRole('button', { name: '話し足して作り直す' }))
    await waitFor(() => expect(mocks.generateSoap).toHaveBeenCalledTimes(1))
    expect(mocks.generateSoap.mock.calls[0][0]).toBe('本人「よく眠れた」\n次回も浮腫を観察')
    expect(confirm).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('region', { name: '足りないところ' })).toBeNull())
  })

  it('手で直したあとに話し足すと、消えることを確認する', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Result record={withMissing} onBack={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('S（主観的情報）の生成結果'), { target: { value: '直した' } })
    fireEvent.change(screen.getByLabelText('話し足す内容'), { target: { value: '次回も浮腫を観察' } })
    fireEvent.click(screen.getByRole('button', { name: '話し足して作り直す' }))
    expect(confirm).toHaveBeenCalledWith('手で直した文章は消えます。作り直しますか？')
    expect(mocks.generateSoap).not.toHaveBeenCalled()
  })

  it('4欄とも空なら全部コピーを押せない', () => {
    render(<Result record={{ ...record, soap: { s: '', o: '', a: '', p: '', missing: '内容が聞き取れませんでした。' } }} onBack={vi.fn()} onSaved={vi.fn()} />)
    screen.getAllByRole('button', { name: '全部コピー（カイポケに貼る）' }).forEach((b) => expect(b).toBeDisabled())
  })

  it('拾った数値を表示し、あり得ない値は確かめるよう伝える', () => {
    render(<Result record={{ ...record, vitals: { temp: '36.5', bpHigh: '128', bpLow: '', pulse: '', spo2: '', resp: '' } }} onBack={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByText(/数値：体温36.5℃/)).toBeInTheDocument()
    expect(screen.getByText(/数値を確かめてください/)).toHaveTextContent('血圧は収縮期と拡張期を両方')
  })

  it('足りないところが残っていれば、保存の確認文で知らせる', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<Result record={withMissing} onBack={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '確認して保存' }))
    expect(confirm.mock.calls[0][0]).toMatch(/^足りないところが残っています。このまま保存しますか？/)
  })

  it('手で直していなければ、作り直すときに確認を出さない', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    mocks.generateSoap.mockResolvedValue({ soap: { s: '発言', o: '所見', a: '評価', p: '計画', missing: 'なし' }, vitals: emptyVitals })
    render(<Result record={record} onBack={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '作り直す' }))
    await waitFor(() => expect(mocks.generateSoap).toHaveBeenCalledTimes(1))
    expect(confirm).not.toHaveBeenCalled()
  })
})

const reportRecord: RecordDoc = {
  type: 'report', patientId: 1, patientName: '山田 太郎', visitDate: '2026-11-30',
  memo: '【アプリの記録】\n■2026年11月5日\nO：下肢浮腫あり',
  report: { progress: '経過', careContent: '内容', homeCare: '', notes: '', missing: '家庭での介護の状況が記録にありません。' },
  reportBasis: { from: '2026-11-01', to: '2026-11-30', soapDates: ['2026-11-05', '2026-11-26'], pasted: true, extra: false, masked: true },
  createdAt: 100, updatedAt: 100
}

describe('Result 報告書', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.generateReport.mockResolvedValue({ progress: '経過2', careContent: '内容2', homeCare: '家族の負担あり', notes: '', missing: 'なし' })
  })

  it('期間・元にした記録・名前の置き換え・足りないところを出す', () => {
    render(<Result record={reportRecord} onBack={vi.fn()} onSaved={vi.fn()} />)
    expect(screen.getByText(/2026年11月1日〜2026年11月30日/)).toBeInTheDocument()
    expect(screen.getByText('まとめた記録：11月5日・11月26日（アプリ2件）＋貼り付け')).toBeInTheDocument()
    expect(screen.getByText('文中の利用者名を「利用者」に置き換えて送りました。家族の名前や住所が残っていないかも確かめてください。')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '足りないところ' })).toHaveTextContent('家庭での介護の状況が記録にありません。')
  })

  it('話し足した分は名前を置き換え、見出しを付けて作り直す', async () => {
    render(<Result record={reportRecord} onBack={vi.fn()} onSaved={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('話し足す内容'), { target: { value: '山田さんの妻が介護に疲れている' } })
    fireEvent.click(screen.getByRole('button', { name: '話し足して作り直す' }))
    await waitFor(() => expect(mocks.generateReport).toHaveBeenCalled())
    const sent = mocks.generateReport.mock.calls[0][0] as string
    expect(sent).toBe('【アプリの記録】\n■2026年11月5日\nO：下肢浮腫あり\n\n【付け足したこと】\n利用者さんの妻が介護に疲れている')
    expect(await screen.findByDisplayValue('家族の負担あり')).toBeInTheDocument()
  })

  it('報告書の欄がすべて空ならまとめてコピーできない', () => {
    render(
      <Result
        record={{ ...reportRecord, report: { progress: '', careContent: '', homeCare: '', notes: '', missing: '記録が足りません。' } }}
        onBack={vi.fn()}
        onSaved={vi.fn()}
      />
    )
    screen.getAllByRole('button', { name: '全文をコピー（カイポケ貼り付け用）' }).forEach((button) => expect(button).toBeDisabled())
  })
})
