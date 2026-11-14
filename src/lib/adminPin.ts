/**
 * 管理者用（AIの設定）を開くための暗証番号。
 * 職員がうっかり・興味本位でキーを見られないようにするための鍵で、
 * 端末を詳しく調べる人を防ぐものではない（キーが漏れたおそれがあればキーを作り直す）。
 */
const KEY = 'recoco.adminPinHash'

export function isValidPin(pin: string): boolean {
  return /^\d{4,6}$/.test(pin)
}

/** 暗証番号をそのまま保存しないよう、SHA-256 の16進文字列にする。 */
export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`recoco-pin:${pin}`)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function getAdminPinHash(): string {
  return localStorage.getItem(KEY) ?? ''
}

export function setAdminPinHash(hash: string): void {
  localStorage.setItem(KEY, hash)
}

export async function setAdminPin(pin: string): Promise<void> {
  setAdminPinHash(await hashPin(pin))
}

export async function checkAdminPin(pin: string): Promise<boolean> {
  const saved = getAdminPinHash()
  return !!saved && (await hashPin(pin)) === saved
}
