import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Setup from './Setup'
import { encodeSetupCode } from '../lib/setupCode'

const payload = { provider: 'google' as const, model: 'gemini-3.6-flash', apiKey: 'test-key', pinHash: 'a'.repeat(64) }
const validCode = encodeSetupCode(payload)

const mocks = vi.hoisted(() => ({
  testConnection: vi.fn(),
  applySetupCode: vi.fn(),
  scanText: { value: '' }
}))

vi.mock('../lib/ai', () => ({ testConnection: mocks.testConnection }))
vi.mock('../lib/setupCode', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/setupCode')>()
  return { ...actual, applySetupCode: mocks.applySetupCode }
})
vi.mock('../components/QrScanner', () => ({
  default: ({ onRead, onError }: { onRead: (t: string) => void; onError: (r: 'denied' | 'unsupported') => void }) => (
    <div>
      <button onClick={() => onRead(mocks.scanText.value)}>読めた</button>
      <button onClick={() => onError('denied')}>カメラ不可</button>
    </div>
  )
}))

afterEach(cleanup)

describe('Setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.scanText.value = validCode
    mocks.testConnection.mockResolvedValue(true)
  })

  it('QRを読むと設定を入れ、準備ができたことを伝える', async () => {
    const onDone = vi.fn()
    render(<Setup onBack={vi.fn()} onDone={onDone} />)
    fireEvent.click(screen.getByRole('button', { name: 'カメラを開く' }))
    fireEvent.click(screen.getByRole('button', { name: '読めた' }))
    expect(await screen.findByText('準備ができました')).toBeInTheDocument()
    expect(mocks.applySetupCode).toHaveBeenCalledWith(payload)
    expect(document.body.textContent).not.toMatch(/test-key|Gemini|gemini/)
    fireEvent.click(screen.getByRole('button', { name: '記録を書く' }))
    expect(onDone).toHaveBeenCalled()
  })

  it('別のQRを読んだら断り、設定を変えない', async () => {
    mocks.scanText.value = 'https://example.com/'
    render(<Setup onBack={vi.fn()} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'カメラを開く' }))
    fireEvent.click(screen.getByRole('button', { name: '読めた' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('このコードは使えません')
    expect(mocks.applySetupCode).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'カメラを開く' })).toBeInTheDocument()
  })

  it('カメラが使えないときは貼り付けでの設定を開く', () => {
    render(<Setup onBack={vi.fn()} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'カメラを開く' }))
    fireEvent.click(screen.getByRole('button', { name: 'カメラ不可' }))
    expect(screen.getByText(/カメラが使えません/)).toBeInTheDocument()
    expect(screen.getByText('コードを貼って設定する').closest('details')).toHaveAttribute('open')
  })

  it('コードを貼って設定できる', async () => {
    render(<Setup onBack={vi.fn()} onDone={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('設定コード'), { target: { value: validCode } })
    fireEvent.click(screen.getByRole('button', { name: '設定する' }))
    expect(await screen.findByText('準備ができました')).toBeInTheDocument()
    expect(mocks.applySetupCode).toHaveBeenCalledWith(payload)
  })

  it('AIにつながらなければ管理者に知らせるよう伝える', async () => {
    mocks.testConnection.mockRejectedValue(new Error('x'))
    render(<Setup onBack={vi.fn()} onDone={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'カメラを開く' }))
    fireEvent.click(screen.getByRole('button', { name: '読めた' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('AIにつながりませんでした')
    expect(mocks.applySetupCode).toHaveBeenCalled()
  })
})
