import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings'

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,xx') }, toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,xx') }))
vi.mock('../components/PatientManager', () => ({ default: () => <div>利用者の管理</div> }))
vi.mock('../lib/backup', () => ({ exportBackup: vi.fn(), importBackup: vi.fn() }))
vi.mock('../lib/ai', () => ({ testConnection: vi.fn() }))

afterEach(cleanup)

describe('Settings', () => {
  beforeEach(() => localStorage.clear())

  it('AIの設定は管理者用の中に畳んであり、開くまで見えない', () => {
    render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
    const admin = screen.getByText('管理者用（AIの設定）').closest('details')!
    expect(admin).not.toHaveAttribute('open')
    expect(admin).toContainElement(screen.getByText('AIモデル'))
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
    render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '職員用QRを作る' }))
    expect(await screen.findByText('先にAPIキーを入れて保存してください。')).toBeInTheDocument()
    expect(screen.queryByAltText('職員用の設定QRコード')).toBeNull()
  })

  it('キーがあれば職員用QRと注意書きを出す', async () => {
    localStorage.setItem('recoco.apiKey.google', 'test-key')
    render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '職員用QRを作る' }))
    expect(await screen.findByAltText('職員用の設定QRコード')).toHaveAttribute('src', 'data:image/png;base64,xx')
    expect(screen.getByText(/印刷や写真での共有はせず/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '設定コードをコピー' })).toBeInTheDocument()
  })
})
