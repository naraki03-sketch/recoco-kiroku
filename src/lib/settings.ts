export type Provider = 'google' | 'anthropic'

const KEY_GOOGLE = 'recoco.geminiApiKey'
const KEY_ANTHROPIC = 'recoco.claudeApiKey'
const KEY_MODEL = 'recoco.geminiModel'

export const DEFAULT_MODEL = 'gemini-2.5-flash'

export const MODEL_GROUPS = [
  {
    label: 'Gemini（推奨・構造化出力対応）',
    options: [
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash（標準・おすすめ）' },
      { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite（高速・軽量）' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro（高品質・低速）' }
    ]
  },
  {
    label: 'Gemma（軽量オープンモデル・実験的）',
    options: [
      { value: 'gemma-3-4b-it', label: 'Gemma 3 4B（軽量）' },
      { value: 'gemma-3-12b-it', label: 'Gemma 3 12B（中間）' },
      { value: 'gemma-3-27b-it', label: 'Gemma 3 27B（高品質）' }
    ]
  },
  {
    label: 'Claude（Anthropic・高品質/有料）',
    options: [
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（高速・低コスト）' },
      { value: 'claude-sonnet-5', label: 'Claude Sonnet 5（バランス・おすすめ）' },
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8（最高品質）' }
    ]
  }
]

/** モデルIDから提供元を判定する（キー・エンドポイント・整形経路の切り替えに使用）。 */
export function getProvider(model: string): Provider {
  return model.startsWith('claude') ? 'anthropic' : 'google'
}

/** モデルIDがGemma系かどうか（Gemmaは構造化出力に非対応のため経路を分ける）。 */
export function isGemmaModel(model: string): boolean {
  return model.startsWith('gemma')
}

export function getApiKey(provider: Provider): string {
  return localStorage.getItem(provider === 'anthropic' ? KEY_ANTHROPIC : KEY_GOOGLE) ?? ''
}

export function setApiKey(provider: Provider, key: string) {
  localStorage.setItem(provider === 'anthropic' ? KEY_ANTHROPIC : KEY_GOOGLE, key.trim())
}

/** 現在選択中のモデルの提供元に対応するAPIキー。 */
export function getActiveApiKey(): string {
  return getApiKey(getProvider(getModel()))
}

export function getModel(): string {
  return localStorage.getItem(KEY_MODEL) ?? DEFAULT_MODEL
}

export function setModel(model: string) {
  localStorage.setItem(KEY_MODEL, model)
}
