import { beforeEach, describe, expect, it } from 'vitest'
import { applySetupCode, currentSetupPayload, decodeSetupCode, encodeSetupCode } from './setupCode'
import { getActiveApiKey, getEffectiveModel } from './settings'
import { getAdminPinHash } from './adminPin'

const pinHash = 'a'.repeat(64)
const payload = { provider: 'google' as const, model: 'gemini-3.6-flash', apiKey: 'test-key', pinHash }

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
  it.each([['gemini-3.6-flash?alt=x'], ['../files'], ['gemini 3'], ['gemini#x']])(
    '記号の入ったモデル名 %s のコードを断る',
    (model) => {
      expect(() => decodeSetupCode(encodeSetupCode({ ...payload, model }))).toThrow('このコードは使えません')
    }
  )

  it('OpenRouter形式のモデル名は通す', () => {
    const p = { provider: 'openrouter' as const, model: 'anthropic/claude-sonnet-5', apiKey: 'test-key', pinHash }
    expect(decodeSetupCode(encodeSetupCode(p))).toEqual(p)
  })
  it('暗証番号のハッシュが無い・形が違うコードを断る', () => {
    expect(() => decodeSetupCode(encodeSetupCode({ ...payload, pinHash: '' }))).toThrow('このコードは使えません')
    expect(() => decodeSetupCode(encodeSetupCode({ ...payload, pinHash: '1234' }))).toThrow('このコードは使えません')
  })

  it('applySetupCodeは管理者の暗証番号（ハッシュ）も入れる', () => {
    applySetupCode(payload)
    expect(getAdminPinHash()).toBe(pinHash)
  })

  it('暗証番号が決まっていなければcurrentSetupPayloadはnull', () => {
    localStorage.setItem('recoco.apiKey.google', 'test-key')
    expect(currentSetupPayload()).toBeNull()
  })
})
