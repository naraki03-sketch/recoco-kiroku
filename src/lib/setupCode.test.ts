import { beforeEach, describe, expect, it } from 'vitest'
import { applySetupCode, currentSetupPayload, decodeSetupCode, encodeSetupCode } from './setupCode'
import { getActiveApiKey, getEffectiveModel } from './settings'

const payload = { provider: 'google' as const, model: 'gemini-3.6-flash', apiKey: 'test-key' }

describe('setupCode', () => {
  beforeEach(() => localStorage.clear())

  it('作ったコードを読み戻せる', () => {
    const code = encodeSetupCode(payload)
    expect(code.startsWith('recoco1:')).toBe(true)
    expect(code).not.toContain('test-key') // キーを平文で見せない
    expect(decodeSetupCode(`  ${code}\n`)).toEqual(payload)
  })

  it.each([['https://example.com/'], ['recoco1:%%%'], ['recoco1:' + btoa('{"v":2}')], ['']])(
    '別のQRや壊れたコード %s は分かる言葉で断る',
    (text) => {
      expect(() => decodeSetupCode(text)).toThrow('このコードは使えません')
    }
  )

  it('提供元とモデルが合わないコードを断る', () => {
    const bad = encodeSetupCode({ ...payload, model: 'claude-sonnet-5' })
    expect(() => decodeSetupCode(bad)).toThrow('このコードは使えません')
  })

  it('applySetupCodeはキーとモデルを保存し、カスタムIDを消す', () => {
    localStorage.setItem('recoco.customModelId', 'old-model')
    applySetupCode(payload)
    expect(getActiveApiKey()).toBe('test-key')
    expect(getEffectiveModel()).toBe('gemini-3.6-flash')
  })

  it('一覧に無いモデルはカスタムIDとして保存する', () => {
    applySetupCode({ ...payload, model: 'gemini-9-flash' })
    expect(getEffectiveModel()).toBe('gemini-9-flash')
  })

  it('キーが無ければcurrentSetupPayloadはnull', () => {
    expect(currentSetupPayload()).toBeNull()
  })

  it('キーがあれば今の設定を返す', () => {
    applySetupCode(payload)
    expect(currentSetupPayload()).toEqual(payload)
  })
})
