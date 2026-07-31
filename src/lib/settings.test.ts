import { beforeEach, describe, expect, it } from 'vitest'
import { getActiveApiKey, getActiveProviderMeta } from './settings'

describe('active model settings', () => {
  beforeEach(() => localStorage.clear())

  it('カスタムモデルIDの提供元に対応するAPIキーを使う', () => {
    localStorage.setItem('recoco.model', 'gemini-2.5-flash')
    localStorage.setItem('recoco.customModelId', 'gpt-5.5')
    localStorage.setItem('recoco.apiKey.openai', 'openai-test-key')

    expect(getActiveProviderMeta().id).toBe('openai')
    expect(getActiveApiKey()).toBe('openai-test-key')
  })
})
