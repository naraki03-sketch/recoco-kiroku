export interface JsonSchema {
  type: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  description?: string
  propertyOrdering?: string[]
}

const FORMAT_ERROR = 'AIの回答の形式が正しくありません。入力内容は保存されています。もう一度お試しください。'
const MISSING_ERROR = 'AIの回答に必要な項目がありません。入力内容は保存されています。もう一度お試しください。'
const EMPTY_ERROR = 'AIの回答に空の項目があります。入力内容は保存されています。もう一度お試しください。'

/** AIが返したJSONを、画面へ渡す前に実行時検証する。 */
export function validateGeneratedJson<T>(value: unknown, schema: JsonSchema): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(FORMAT_ERROR)
  }

  const record = value as Record<string, unknown>
  for (const key of schema.required ?? []) {
    if (!(key in record)) throw new Error(MISSING_ERROR)
    if (typeof record[key] !== 'string') throw new Error(FORMAT_ERROR)
    if (!record[key].trim()) throw new Error(EMPTY_ERROR)
  }

  for (const key of Object.keys(schema.properties ?? {})) {
    if (key in record && typeof record[key] !== 'string') throw new Error(FORMAT_ERROR)
  }

  return value as T
}
