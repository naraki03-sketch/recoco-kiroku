import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generateJson } from './ai'
import type { JsonSchema } from './aiValidation'

const schema: JsonSchema = {
  type: 'OBJECT',
  properties: {
    s: { type: 'STRING' },
    o: { type: 'STRING' },
    a: { type: 'STRING' },
    p: { type: 'STRING' }
  },
  required: ['s', 'o', 'a', 'p']
}

function googleResponse(value: unknown): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}

describe('generateJson', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('recoco.model', 'gemini-2.5-flash')
    localStorage.setItem('recoco.apiKey.google', 'test-key')
  })

  it('必須項目が欠けた応答を画面へ渡さない', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(googleResponse({ s: '発言のみ' })))

    await expect(generateJson('test', schema)).rejects.toThrow('AIの回答に必要な項目がありません')
  })

  it('通信にタイムアウト・キャンセル用のAbortSignalを渡す', async () => {
    const value = { s: '発言', o: '所見', a: '評価', p: '計画' }
    const fetchMock = vi.fn().mockResolvedValue(googleResponse(value))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()

    await generateJson<typeof value>('test', schema, { timeoutMs: 1000, signal: controller.signal })

    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal)
  })

  it('正しい応答は返す', async () => {
    const value = { s: '発言', o: '所見', a: '評価', p: '計画' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(googleResponse(value)))

    await expect(generateJson<typeof value>('test', schema)).resolves.toEqual(value)
  })
  it('429のときは混み合っていると伝える', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 429 })))

    await expect(generateJson('test', schema)).rejects.toThrow('混み合っています')
  })

  it('401のときは管理者に知らせるよう伝える', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })))

    await expect(generateJson('test', schema)).rejects.toThrow('管理者に知らせてください')
  })

  it('allowEmptyを渡すと空欄を含む応答が通る', async () => {
    const value = { s: '', o: '所見', a: '', p: '' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(googleResponse(value)))

    await expect(generateJson<typeof value>('test', schema, {}, ['s', 'a', 'p'])).resolves.toEqual(value)
  })
})
