import {
  getApiKey,
  getEffectiveModel,
  getProviderMeta,
  isGemmaModel,
  type ProviderMeta
} from './settings'
import { validateGeneratedJson, type JsonSchema } from './aiValidation'
import {
  fetchWithTimeout,
  RequestCancelledError,
  RequestTimeoutError,
  type RequestControl
} from './request'

/** AI呼び出しで発生したユーザー向けエラー（メッセージは日本語で表示する）。 */
export class AiError extends Error {}

/** 旧名の互換エイリアス（既存importが壊れないように残す）。 */
export const GeminiError = AiError

/** スキーマのキー一覧からJSON出力を指示する文（構造化出力に非対応の提供元用）。 */
function jsonInstruction(schema: JsonSchema): string {
  const lines = Object.entries(schema.properties ?? {}).map(
    ([key, v]) => `- "${key}": ${v.description ?? ''}`
  )
  return `\n\n【出力形式】次のキーだけを持つJSONオブジェクトを1つだけ出力してください。前後に説明文やコードブロック(\`\`\`)を付けないこと。すべての値は日本語の文字列にすること。\n${lines.join('\n')}`
}

/** コードブロックや前後の余計な文字が混ざっていてもJSONを取り出してパースする。 */
function parseJsonLoose(text: string): unknown {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  try {
    return JSON.parse(t) as unknown
  } catch {
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(t.slice(start, end + 1)) as unknown
    }
    throw new AiError('AIの回答の読み取りに失敗しました。もう一度お試しください。')
  }
}

/** HTTPステータスから共通の日本語エラーへ変換する（職員が読んで分かる言葉にする）。 */
function errorForStatus(status: number, providerLabel: string): AiError {
  if (status === 400) {
    return new AiError(`設定に問題があります。管理者に知らせてください。（${providerLabel}のモデルまたはキー）`)
  }
  if (status === 401 || status === 403) {
    return new AiError(`設定に問題があります。管理者に知らせてください。（${providerLabel}のキー）`)
  }
  if (status === 404) {
    return new AiError('設定に問題があります。管理者に知らせてください。（AIモデルが見つかりません）')
  }
  if (status === 429) {
    return new AiError('今AIが混み合っています。1分ほど待ってから、もう一度押してください。話した内容は消えていません。')
  }
  return new AiError(`AIの呼び出しに失敗しました（エラー ${status}）。時間をおいて再度お試しください。`)
}

function requireKey(meta: ProviderMeta): string {
  const key = getApiKey(meta.id)
  if (!key) {
    throw new AiError('まだ使う準備ができていません。管理者に設定してもらってください。')
  }
  return key
}

function rethrowRequestError(error: unknown): never {
  if (error instanceof RequestTimeoutError || error instanceof RequestCancelledError) throw error
  throw new AiError('通信に失敗しました。電波状況を確認してもう一度お試しください。')
}

/**
 * 選択中のモデルの提供元に応じてAIを呼び出し、JSONで結果を受け取る。
 * APIキーは設定画面で保存されたものを使用（端末内のみ保持）。
 * - Google(Gemini): 構造化出力(responseSchema)を使用
 * - Google(Gemma) / Anthropic / OpenAI互換: プロンプトでJSON出力を指示し頑健にパースする
 */
export async function generateJson<T>(
  prompt: string,
  schema: JsonSchema,
  control: RequestControl = {},
  allowEmpty: string[] = []
): Promise<T> {
  const model = getEffectiveModel()
  const meta = getProviderMeta(model)
  switch (meta.kind) {
    case 'anthropic':
      return callAnthropic<T>(meta, model, prompt, schema, control, allowEmpty)
    case 'openai-compatible':
      return callOpenAICompatible<T>(meta, model, prompt, schema, control, allowEmpty)
    default:
      return callGoogle<T>(meta, model, prompt, schema, control, allowEmpty)
  }
}

async function callGoogle<T>(
  meta: ProviderMeta,
  model: string,
  prompt: string,
  schema: JsonSchema,
  control: RequestControl,
  allowEmpty: string[]
): Promise<T> {
  const apiKey = requireKey(meta)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const gemma = isGemmaModel(model)

  const generationConfig = gemma
    ? { temperature: 0.3 }
    : { temperature: 0.3, responseMimeType: 'application/json', responseSchema: schema }
  const finalPrompt = gemma ? prompt + jsonInstruction(schema) : prompt

  let res: Response
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }],
        generationConfig
      })
    }, control)
  } catch (error) {
    rethrowRequestError(error)
  }

  if (!res.ok) throw errorForStatus(res.status, meta.label)

  const data = await res.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new AiError('AIから有効な回答が得られませんでした。もう一度お試しください。')
  }
  return validateGeneratedJson<T>(parseJsonLoose(text), schema, allowEmpty)
}

async function callAnthropic<T>(
  meta: ProviderMeta,
  model: string,
  prompt: string,
  schema: JsonSchema,
  control: RequestControl,
  allowEmpty: string[]
): Promise<T> {
  const apiKey = requireKey(meta)

  let res: Response
  try {
    res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        // ブラウザから直接呼び出すために必要（このアプリはバックエンドを持たない）
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        // temperatureは送らない（Sonnet 5 / Opus 4.8 では非対応で400になる）
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt + jsonInstruction(schema) }]
      })
    }, control)
  } catch (error) {
    rethrowRequestError(error)
  }

  if (!res.ok) throw errorForStatus(res.status, meta.label)

  const data = await res.json()
  const text: string | undefined =
    data?.content?.find((b: { type?: string; text?: string }) => b.type === 'text')?.text ??
    data?.content?.[0]?.text
  if (!text) {
    throw new AiError('AIから有効な回答が得られませんでした。もう一度お試しください。')
  }
  return validateGeneratedJson<T>(parseJsonLoose(text), schema, allowEmpty)
}

/**
 * OpenAI互換（OpenAI / OpenRouter など）の Chat Completions を呼ぶ。
 * baseUrl だけ差し替えれば同じ実装で複数提供元に対応できる。
 * 構造化出力はモデル依存のため使わず、プロンプト指示＋頑健パースで統一する。
 */
async function callOpenAICompatible<T>(
  meta: ProviderMeta,
  model: string,
  prompt: string,
  schema: JsonSchema,
  control: RequestControl,
  allowEmpty: string[]
): Promise<T> {
  const apiKey = requireKey(meta)
  const baseUrl = meta.baseUrl ?? 'https://api.openai.com/v1'

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`
  }
  // OpenRouter は任意でアプリ識別ヘッダを受け付ける（ランキング表示用・必須ではない）
  if (meta.id === 'openrouter') {
    headers['HTTP-Referer'] = 'https://recoco-kiroku.app'
    headers['X-Title'] = 'recoco 記録アシスタント'
  }

  let res: Response
  try {
    res = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        // temperatureは送らない（モデルによって既定値以外を拒否するため。整形タスクは既定値で十分）
        messages: [
          {
            role: 'system',
            content: '日本語で、指示されたJSON形式だけを厳密に出力するアシスタントとして応答してください。'
          },
          { role: 'user', content: prompt + jsonInstruction(schema) }
        ]
      })
    }, control)
  } catch (error) {
    rethrowRequestError(error)
  }

  if (!res.ok) throw errorForStatus(res.status, meta.label)

  const data = await res.json()
  const text: string | undefined = data?.choices?.[0]?.message?.content
  if (!text) {
    throw new AiError('AIから有効な回答が得られませんでした。もう一度お試しください。')
  }
  return validateGeneratedJson<T>(parseJsonLoose(text), schema, allowEmpty)
}

/** 設定画面の「接続テスト」用。成功すればtrue、失敗なら日本語メッセージ付きで例外。 */
export async function testConnection(): Promise<boolean> {
  await generateJson<{ ok: string }>(
    '接続テストです。{"ok": "yes"} というJSONだけを返してください。',
    { type: 'OBJECT', properties: { ok: { type: 'STRING' } }, required: ['ok'] }
  )
  return true
}
