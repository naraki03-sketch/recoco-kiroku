import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Home from './Home'

const key = vi.hoisted(() => ({ value: 'test-key' }))
vi.mock('../lib/settings', () => ({ getActiveApiKey: () => key.value }))

afterEach(() => {
  cleanup()
  key.value = 'test-key'
})

describe('Home', () => {
  it('「記録を書く」でSOAPの入力画面へ進む', () => {
    const go = vi.fn()
    render(<Home go={go} />)
    fireEvent.click(screen.getByRole('button', { name: /記録を書く/ }))
    expect(go).toHaveBeenCalledWith({ name: 'form', type: 'soap' })
  })

  it('計画書・報告書・これまでの記録・設定へ進める', () => {
    const go = vi.fn()
    render(<Home go={go} />)
    fireEvent.click(screen.getByRole('button', { name: '計画書' }))
    fireEvent.click(screen.getByRole('button', { name: '報告書' }))
    fireEvent.click(screen.getByRole('button', { name: 'これまでの記録' }))
    fireEvent.click(screen.getByRole('button', { name: '設定' }))
    expect(go.mock.calls.map((c) => c[0])).toEqual([
      { name: 'form', type: 'plan' },
      { name: 'form', type: 'report' },
      { name: 'history' },
      { name: 'settings' }
    ])
  })

  it('APIキーやモデル名を表示しない', () => {
    render(<Home go={vi.fn()} />)
    expect(document.body.textContent).not.toMatch(/API|Gemini|モデル/)
  })
  it('キー未設定なら「はじめの設定をする」で初期設定へ進む', () => {
    key.value = ''
    const go = vi.fn()
    render(<Home go={go} />)
    expect(screen.getByText('はじめに、管理者のQRコードを読み取ってください。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'はじめの設定をする' }))
    expect(go).toHaveBeenCalledWith({ name: 'setup' })
    expect(document.body.textContent).not.toMatch(/API|Gemini/)
  })

  it('キー設定済みなら初期設定の案内を出さない', () => {
    render(<Home go={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'はじめの設定をする' })).toBeNull()
  })
})
