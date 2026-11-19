/** 名前の後ろに付く敬称。外した形も置き換えの対象にする。 */
const HONORIFIC = /(様|さま|さん|氏)$/

/** 1文字の語は「小林市」の「林」のように地名や普通の言葉まで壊すので対象にしない。 */
const MIN_LENGTH = 2

/**
 * 登録してある利用者名から、文中で探す語を作る。長い順（同じ長さは作った順）。
 * 例: 「山田 太郎」→ 山田 太郎／山田　太郎／山田太郎／山田／太郎
 */
export function nameTokens(names: string[]): string[] {
  const tokens: string[] = []
  const add = (token: string) => {
    const t = token.trim()
    if (t.length >= MIN_LENGTH && !tokens.includes(t)) tokens.push(t)
  }
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    const variants = [name, name.replace(HONORIFIC, '')]
    for (const variant of variants) {
      add(variant)
      if (/\s/.test(variant)) {
        add(variant.replace(/\s+/g, '　'))
        add(variant.replace(/\s+/g, ' '))
        add(variant.replace(/\s+/g, ''))
        variant.split(/\s+/).forEach(add)
      }
    }
  }
  return tokens
    .map((token, index) => ({ token, index }))
    .sort((a, b) => b.token.length - a.token.length || a.index - b.index)
    .map(({ token }) => token)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 文中の利用者名を「利用者」に置き換える。AIに送る前に端末の中で行う。
 * 家族の名前や住所までは見つけられないため、最後は職員の目で確かめてもらう。
 */
export function maskNames(text: string, names: string[]): { text: string; masked: boolean } {
  const tokens = nameTokens(names)
  if (!tokens.length || !text) return { text, masked: false }
  const pattern = new RegExp(tokens.map(escapeRegExp).join('|'), 'g')
  let masked = false
  const result = text.replace(pattern, () => {
    masked = true
    return '利用者'
  })
  return { text: result, masked }
}
