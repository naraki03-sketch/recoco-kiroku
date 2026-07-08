import { getApiKey, getModel, getProvider, isGemmaModel } from './settings'

/** AI呼び出しで発生したユーザー向けエラー（メッセージは日本語で表示する）。 */
export class GeminiError extends Error {}

interface JsonSchema {
  type: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  description?: string
  propertyOrdering?: string[]
}

/** スキーマのキー一覧からJSON出力を指示する文（構造化出力に非対応のGemma/Claude用）。 */
function jsonInstruction(schema: JsonSchema): string {
  const lines = Object.entries(schema.properties ?? {}).map(
    ([key, v]) => `- "${key}": ${v.description ?? ''}`
  )
  return `\n\n【出力形式】次のキーだけを持つJSONオブジェクトを1つだけ出力してください。前後に説明文やコードブロック(\`\`\`)を付けないこと。すべての値は日本語の文字列にすること。\n${lines.join('\n')}`
}

/** コードブロックや前後の余計な文字が混ざっていてもJSONを取り出してパースする。 */
function parseJsonLoose<T>(text: string): T {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) t = fence[1].trim()
  try {
    return JSON.parse(t) as T
  } catch {
    const start = t.indexOf('{')
    const end = t.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(t.slice(start, end + 1)) as T
    }
    throw new GeminiError('AIの回答の読み取りに失敗しました。もう一度お試しください。')
  }
}

/**
 * 選択中のモデルの提供元に応じてAIを呼び出し、JSONで結果を受け取る。
 * APIキーは設定画面で保存されたものを使用（端末内のみ保持）。
 * - Gemini: 構造化出力(responseSchema)を使用
 * - Gemma / Claude: 非対応のためプロンプトでJSON出力を指示し、頑健にパースする
 */
export async function generateJson<T>(prompt: string, schema: JsonSchema): Promise<T> {
  const model = getModel()
  if (getProvider(model) === 'anthropic') {
    return callAnthropic<T>(model, prompt, schema)
  }
  return callGoogle<T>(model, prompt, schema)
}

async function callGoogle<T>(model: string, prompt: string, schema: JsonSchema): Promise<T> {
  const apiKey = getApiKey('google')
  if (!apiKey) {
    throw new GeminiError('APIキーが設定されていません。設定画面からAPIキーを入力してください。')
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const gemma = isGemmaModel(model)

  const generationConfig = gemma
    ? { temperature: 0.3 }
    : { temperature: 0.3, responseMimeType: 'application/json', responseSchema: schema }
  const finalPrompt = gemma ? prompt + jsonInstruction(schema) : prompt

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }],
        generationConfig
      })
    })
  } catch {
    throw new GeminiError('通信に失敗しました。電波状況を確認してもう一度お試しください。')
  }

  if (!res.ok) {
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new GeminiError('APIキーが正しくない可能性があります。設定画面でAPIキーを確認してください。')
    }
    if (res.status === 429) {
      throw new GeminiError('利用回数の上限に達しました。しばらく待ってからもう一度お試しください。')
    }
    if (res.status === 404) {
      throw new GeminiError('選択中のAIモデルが見つかりません。設定画面で別のモデルを選んでください。')
    }
    throw new GeminiError(`AIの呼び出しに失敗しました（エラー ${res.status}）。時間をおいて再度お試しください。`)
  }

  const data = await res.json()
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) {
    throw new GeminiError('AIから有効な回答が得られませんでした。もう一度お試しください。')
  }
  return parseJsonLoose<T>(text)
}

async function callAnthropic<T>(model: string, prompt: string, schema: JsonSchema): Promise<T> {
  const apiKey = getApiKey('anthropic')
  if (!apiKey) {
    throw new GeminiError('Claude（Anthropic）のAPIキーが設定されていません。設定画面からAPIキーを入力してください。')
  }

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
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
    })
  } catch {
    throw new GeminiError('通信に失敗しました。電波状況を確認してもう一度お試しください。')
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new GeminiError('Claude APIキーが正しくない可能性があります。設定画面でAPIキーを確認してください。')
    }
    if (res.status === 429) {
      throw new GeminiError('利用回数の上限に達しました。しばらく待ってからもう一度お試しください。')
    }
    if (res.status === 404) {
      throw new GeminiError('選択中のAIモデルが見つかりません。設定画面で別のモデルを選んでください。')
    }
    if (res.status === 400) {
      throw new GeminiError('リクエストに問題があります。設定画面でモデルとAPIキーを確認してください。')
    }
    throw new GeminiError(`AIの呼び出しに失敗しました（エラー ${res.status}）。時間をおいて再度お試しください。`)
  }

  const data = await res.json()
  const text: string | undefined =
    data?.content?.find((b: { type?: string; text?: string }) => b.type === 'text')?.text ??
    data?.content?.[0]?.text
  if (!text) {
    throw new GeminiError('AIから有効な回答が得られませんでした。もう一度お試しください。')
  }
  return parseJsonLoose<T>(text)
}

/** 設定画面の「接続テスト」用。成功すればtrue、失敗なら日本語メッセージ付きで例外。 */
export async function testConnection(): Promise<boolean> {
  await generateJson<{ ok: string }>(
    '接続テストです。{"ok": "yes"} というJSONだけを返してください。',
    { type: 'OBJECT', properties: { ok: { type: 'STRING' } }, required: ['ok'] }
  )
  return true
}
