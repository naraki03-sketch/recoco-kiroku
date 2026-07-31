import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function Broken(): never {
  throw new Error('render failure')
}

describe('ErrorBoundary', () => {
  it('白画面にせず復旧操作を表示する', () => {
    const onReset = vi.fn()
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <ErrorBoundary onReset={onReset}>
        <Broken />
      </ErrorBoundary>
    )

    expect(screen.getByRole('alert')).toHaveTextContent('画面の表示中にエラーが発生しました')
    fireEvent.click(screen.getByRole('button', { name: '入力内容を残してホームへ戻る' }))
    expect(onReset).toHaveBeenCalledTimes(1)
    consoleSpy.mockRestore()
  })
})
