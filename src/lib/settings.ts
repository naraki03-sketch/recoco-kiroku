export type Provider = 'google' | 'anthropic' | 'openai' | 'openrouter'

/** 提供元ごとの呼び出し経路。openai-compatible は baseUrl だけ差し替えて共通実装で呼ぶ。 */
export type ProviderKind = 'google' | 'anthropic' | 'openai-compatible'

export interface ProviderMeta {
  id: Provider
  label: string
  storageKey: string // APIキーの保存先（localStorage）
  keyPlaceholder: string
  consoleUrl: string
  consoleName: string
  privacyNote: string // 設定画面に出す学習利用などの注意書き
  kind: ProviderKind
  baseUrl?: string // openai-compatible のみ
}

export const PROVIDERS: Record<Provider, ProviderMeta> = {
  google: {
    id: 'google',
    label: 'Google（Gemini / Gemma）',
    storageKey: 'recoco.apiKey.google',
    keyPlaceholder: 'AIza...',
    consoleUrl: 'https://aistudio.google.com/apikey',
    consoleName: 'Google AI Studio',
    privacyNote: 'Gemini / Gemma APIの無料枠では、送信内容がGoogleのサービス改善に利用される場合があります。',
    kind: 'google'
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic（Claude）',
    storageKey: 'recoco.apiKey.anthropic',
    keyPlaceholder: 'sk-ant-...',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    consoleName: 'Anthropic Console',
    privacyNote: 'Anthropic APIは、既定では送信内容をモデルの学習に利用しません。無料枠はなく利用に応じた料金がかかります。',
    kind: 'anthropic'
  },
  openai: {
    id: 'openai',
    label: 'OpenAI（ChatGPTのAPI）',
    storageKey: 'recoco.apiKey.openai',
    keyPlaceholder: 'sk-...',
    consoleUrl: 'https://platform.openai.com/api-keys',
    consoleName: 'OpenAI Platform',
    privacyNote: 'OpenAI APIは、既定では送信内容をモデルの学習に利用しません。無料枠はなく利用に応じた料金がかかります。',
    kind: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1'
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter（1つのキーで多数のモデル）',
    storageKey: 'recoco.apiKey.openrouter',
    keyPlaceholder: 'sk-or-...',
    consoleUrl: 'https://openrouter.ai/keys',
    consoleName: 'OpenRouter',
    privacyNote:
      'OpenRouterは各社モデルへ中継するサービスです。モデルごとに提供元のポリシーが適用され、無料モデル（末尾が :free）は学習に利用される場合があります。',
    kind: 'openai-compatible',
    baseUrl: 'https://openrouter.ai/api/v1'
  }
}

export interface ModelOption {
  value: string
  label: string
  provider: Provider
}

export interface ModelGroup {
  label: string
  options: ModelOption[]
}

export const DEFAULT_MODEL = 'gemini-3.6-flash'

export const MODEL_GROUPS: ModelGroup[] = [
  {
    label: 'Gemini（推奨・構造化出力対応）',
    options: [
      { value: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash（最新・おすすめ）', provider: 'google' },
      { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash（旧・標準）', provider: 'google' },
      { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite（高速・軽量）', provider: 'google' },
      { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash（旧・標準）', provider: 'google' },
      { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro（旧・高品質）', provider: 'google' }
    ]
  },
  {
    label: 'Gemma（軽量オープンモデル・実験的）',
    options: [
      { value: 'gemma-3-4b-it', label: 'Gemma 3 4B（軽量）', provider: 'google' },
      { value: 'gemma-3-12b-it', label: 'Gemma 3 12B（中間）', provider: 'google' },
      { value: 'gemma-3-27b-it', label: 'Gemma 3 27B（高品質）', provider: 'google' }
    ]
  },
  {
    label: 'Claude（Anthropic・高品質/有料）',
    options: [
      { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5（高速・低コスト）', provider: 'anthropic' },
      { value: 'claude-sonnet-5', label: 'Claude Sonnet 5（バランス・おすすめ）', provider: 'anthropic' },
      { value: 'claude-opus-4-8', label: 'Claude Opus 4.8（最高品質）', provider: 'anthropic' }
    ]
  },
  {
    label: 'OpenAI（ChatGPT・有料）',
    options: [
      { value: 'gpt-5.5', label: 'GPT-5.5（標準・おすすめ）', provider: 'openai' },
      { value: 'gpt-5.4-mini', label: 'GPT-5.4 mini（高速・低コスト）', provider: 'openai' },
      { value: 'gpt-5.4-nano', label: 'GPT-5.4 nano（最軽量）', provider: 'openai' }
    ]
  },
  {
    label: 'OpenRouter（1つのキーで各社モデル）',
    options: [
      { value: 'openai/gpt-5.5', label: 'GPT-5.5（OpenAI）', provider: 'openrouter' },
      { value: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5（Anthropic）', provider: 'openrouter' },
      { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro（Google）', provider: 'openrouter' },
      { value: 'deepseek/deepseek-chat', label: 'DeepSeek V3（低コスト）', provider: 'openrouter' },
      { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B（オープン）', provider: 'openrouter' }
    ]
  }
]

/** 全モデル定義を平坦化して value→ModelOption で引けるようにしたもの。 */
const MODEL_INDEX: Record<string, ModelOption> = Object.fromEntries(
  MODEL_GROUPS.flatMap((g) => g.options).map((o) => [o.value, o])
)

const KEY_MODEL = 'recoco.model'
const KEY_CUSTOM_MODEL = 'recoco.customModelId'

// 旧バージョンのキー（提供元別レジストリ化する前）。初回に新形式へ移行する。
const LEGACY_KEYS: { legacy: string; provider: Provider }[] = [
  { legacy: 'recoco.geminiApiKey', provider: 'google' },
  { legacy: 'recoco.claudeApiKey', provider: 'anthropic' }
]
const LEGACY_MODEL_KEY = 'recoco.geminiModel'

/** 旧形式のlocalStorageキーを新形式へ移す（既存ユーザーのキー・モデル設定を失わないため）。 */
export function migrateLegacyStorage(): void {
  try {
    for (const { legacy, provider } of LEGACY_KEYS) {
      const old = localStorage.getItem(legacy)
      const meta = PROVIDERS[provider]
      if (old && !localStorage.getItem(meta.storageKey)) {
        localStorage.setItem(meta.storageKey, old)
      }
    }
    const oldModel = localStorage.getItem(LEGACY_MODEL_KEY)
    if (oldModel && !localStorage.getItem(KEY_MODEL)) {
      localStorage.setItem(KEY_MODEL, oldModel)
    }
  } catch {
    // localStorage不可の環境では黙って無視
  }
}

/** 選択肢の一覧に載っているモデルIDかどうか。 */
export function isKnownModel(model: string): boolean {
  return model in MODEL_INDEX
}

/**
 * モデルIDから提供元を判定する。
 * まず登録済みモデル定義から引き、無ければIDの形からフォールバック推定する
 * （カスタムモデルID入力時のため）。
 */
export function getProvider(model: string): Provider {
  const known = MODEL_INDEX[model]
  if (known) return known.provider
  // カスタムID用フォールバック
  if (model.includes('/')) return 'openrouter' // 例: anthropic/claude-...
  if (model.startsWith('claude')) return 'anthropic'
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3') || model.startsWith('o4'))
    return 'openai'
  return 'google'
}

/** モデルIDがGemma系かどうか（Gemmaは構造化出力に非対応のため経路を分ける）。 */
export function isGemmaModel(model: string): boolean {
  return model.startsWith('gemma')
}

export function getProviderMeta(model: string): ProviderMeta {
  return PROVIDERS[getProvider(model)]
}

export function getApiKey(provider: Provider): string {
  return localStorage.getItem(PROVIDERS[provider].storageKey) ?? ''
}

export function setApiKey(provider: Provider, key: string) {
  localStorage.setItem(PROVIDERS[provider].storageKey, key.trim())
}

/** 実際に利用するモデルの提供元情報。カスタムモデルIDを含めて判定する。 */
export function getActiveProviderMeta(): ProviderMeta {
  return getProviderMeta(getEffectiveModel())
}

/** 現在実際に利用するモデルの提供元に対応するAPIキー。 */
export function getActiveApiKey(): string {
  return getApiKey(getActiveProviderMeta().id)
}

export function getModel(): string {
  return localStorage.getItem(KEY_MODEL) ?? DEFAULT_MODEL
}

export function setModel(model: string) {
  localStorage.setItem(KEY_MODEL, model)
}

/** 詳細設定のカスタムモデルID（空なら未使用）。指定時はこれが getModel より優先される。 */
export function getCustomModelId(): string {
  return localStorage.getItem(KEY_CUSTOM_MODEL) ?? ''
}

export function setCustomModelId(id: string) {
  const v = id.trim()
  if (v) localStorage.setItem(KEY_CUSTOM_MODEL, v)
  else localStorage.removeItem(KEY_CUSTOM_MODEL)
}

/** 実際にAPIへ送るモデルID。カスタムIDがあればそれを、なければ選択中モデルを使う。 */
export function getEffectiveModel(): string {
  return getCustomModelId() || getModel()
}
