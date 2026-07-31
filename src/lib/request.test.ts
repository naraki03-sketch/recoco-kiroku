import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RequestCancelledError,
  RequestTimeoutError,
  fetchWithTimeout
} from './request'

function abortablePendingFetch(): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted', 'AbortError'))
      )
    })
  ) as typeof fetch
}

describe('fetchWithTimeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('指定時間を超えた通信を中断する', async () => {
    vi.stubGlobal('fetch', abortablePendingFetch())
    const promise = fetchWithTimeout('/test', {}, { timeoutMs: 1000 })
    const assertion = expect(promise).rejects.toBeInstanceOf(RequestTimeoutError)

    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it('呼び出し元からキャンセルできる', async () => {
    vi.stubGlobal('fetch', abortablePendingFetch())
    const controller = new AbortController()
    const promise = fetchWithTimeout('/test', {}, { timeoutMs: 10_000, signal: controller.signal })
    const assertion = expect(promise).rejects.toBeInstanceOf(RequestCancelledError)

    controller.abort()
    await assertion
  })

  it('成功時はレスポンスを返す', async () => {
    const response = new Response('{}', { status: 200 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(fetchWithTimeout('/test', {}, { timeoutMs: 1000 })).resolves.toBe(response)
  })
})
