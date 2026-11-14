import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'
import { setAdminPin } from '../lib/adminPin'
import { decodeSetupCode } from '../lib/setupCode'

const qr = vi.hoisted(() => ({ toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,xx') }))
vi.mock('qrcode', () => ({ default: qr, toDataURL: qr.toDataURL }))
vi.mock('../components/PatientManager', () => ({ default: () => <div>利用者の管理</div> }))
vi.mock('../lib/backup', () => ({ exportBackup: vi.fn(), importBackup: vi.fn() }))
vi.mock('../lib/ai', () => ({ testConnection: vi.fn() }))

afterEach(cleanup)

async function unlock(pin = '2580') {
  fireEvent.change(screen.getByLabelText('暗証番号'), { target: { value: pin } })
  fireEvent.click(screen.getByRole('button', { name: '開く' }))
}

describe('Settings', () => {
  beforeEach(() => {
    localStorage.clear()
    qr.toDataURL.mockClear()
  })

  it('AIの設定は管理者用の中に畳んであり、暗証番号を入れるまで出ない', async () => {
    await setAdminPin('2580')
    render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
    const admin = screen.getByText('管理者用（AIの設定）').closest('details')!
    expect(admin).not.toHaveAttribute('open')
    expect(screen.queryByText('AIモデル')).toBeNull()
    await unlock('0000')
    expect(await screen.findByRole('alert')).toHaveTextContent('暗証番号が違います')
    expect(screen.queryByText('AIモデル')).toBeNull()
    await unlock('2580')
    expect(await screen.findByText('AIモデル')).toBeInTheDocument()
  })

  it('暗証番号が未設定なら、最初に決めてから開く', async () => {
    render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('新しい暗証番号（4〜6桁の数字）'), { target: { value: '1234' } })
    fireEvent.change(screen.getByLabelText('もう一度'), { target: { value: '1235' } })
    fireEvent.click(screen.getByRole('button', { name: '暗証番号を決める' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('同じ番号を2回入れてください')
    fireEvent.change(screen.getByLabelText('もう一度'), { target: { value: '1234' } })
    fireEvent.click(screen.getByRole('button', { name: '暗証番号を決める' }))
    expect(await screen.findByText('AIモデル')).toBeInTheDocument()
  })

  it('保存済みのキーは画面に出さない', async () => {
    await setAdminPin('2580')
    localStorage.setItem('recoco.apiKey.google', 'test-key')
    render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
    await unlock()
    await screen.findByText('AIモデル')
    expect(document.body.innerHTML).not.toContain('test-key')
    expect(screen.queryByRole('button', { name: '表示' })).toBeNull()
    expect(screen.getByText(/設定済み/)).toBeInTheDocument()
  })

  it('キー欄を空のまま保存しても、保存済みのキーは消えない', async () => {
    await setAdminPin('2580')
    localStorage.setItem('recoco.apiKey.google', 'test-key')
    render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
    await unlock()
    fireEvent.click(await screen.findByRole('button', { name: '保存' }))
    expect(localStorage.getItem('recoco.apiKey.google')).toBe('test-key')
  })

  it('「QRコードを読み直す」で初期設定へ進む', () => {
    const goSetup = vi.fn()
    render(<Settings onBack={vi.fn()} goSetup={goSetup} />)
    fireEvent.click(screen.getByRole('button', { name: 'QRコードを読み直す' }))
    expect(goSetup).toHaveBeenCalled()
  })

  it('個人情報の注意に提供元名を出さない', () => {
    render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
    expect(screen.getByText(/話した内容はAIに送られます/)).toBeInTheDocument()
    expect(screen.getByText(/無料のAIでは、送った内容がAIの改善に使われる場合があります/)).toBeInTheDocument()
  })

  it('キーが無いとQRを作らず、先に入れるよう伝える', async () => {
    await setAdminPin('2580')
    render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
    await unlock()
    fireEvent.click(await screen.findByRole('button', { name: '職員用QRを作る' }))
    expect(await screen.findByText('先にAPIキーを入れて保存してください。')).toBeInTheDocument()
    expect(screen.queryByAltText('職員用の設定QRコード')).toBeNull()
  })

  it('キーがあれば、暗証番号入りの職員用QRと注意書きを出す', async () => {
    await setAdminPin('2580')
    localStorage.setItem('recoco.apiKey.google', 'test-key')
    render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
    await unlock()
    fireEvent.click(await screen.findByRole('button', { name: '職員用QRを作る' }))
    expect(await screen.findByAltText('職員用の設定QRコード')).toHaveAttribute('src', 'data:image/png;base64,xx')
    expect(screen.getByText(/印刷や写真での共有はせず/)).toBeInTheDocument()
    const code = qr.toDataURL.mock.calls[0][0] as string
    expect(decodeSetupCode(code).pinHash).toMatch(/^[0-9a-f]{64}$/)
  })
})
