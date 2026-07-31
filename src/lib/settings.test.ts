import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_MODEL, getActiveApiKey, getActiveProviderMeta, MODEL_GROUPS } from './settings'

describe('active model settings', () => {
  beforeEach(() => localStorage.clear())

  it('Gemini 3.6 FlashをGoogleの最新既定モデルとして選択肢に含める', () => {
    const geminiOptions = MODEL_GROUPS.find((group) => group.label.startsWith('Gemini'))?.options ?? []

    expect(DEFAULT_MODEL).toBe('gemini-3.6-flash')
    expect(geminiOptions).toContainEqual({
      value: 'gemini-3.6-flash',
      label: 'Gemini 3.6 Flash（最新・おすすめ）',
      provider: 'google'
    })
  })

  it('カスタムモデルIDの提供元に対応するAPIキーを使う', () => {
    localStorage.setItem('recoco.model', 'gemini-2.5-flash')
    localStorage.setItem('recoco.customModelId', 'gpt-5.5')
    localStorage.setItem('recoco.apiKey.openai', 'openai-test-key')

    expect(getActiveProviderMeta().id).toBe('openai')
    expect(getActiveApiKey()).toBe('openai-test-key')
  })
})
