import {
  getApiKey,
  getEffectiveModel,
  getProvider,
  isKnownModel,
  PROVIDERS,
  setApiKey,
  setCustomModelId,
  setModel,
  type Provider
} from './settings'
import { getAdminPinHash, setAdminPinHash } from './adminPin'

/** 管理者が職員へQRコードで渡す設定の中身。 */
export interface SetupPayload {
  provider: Provider
  model: string
  apiKey: string
  /** 管理者の暗証番号のハッシュ。職員の端末でも管理者用の欄を同じ番号でしか開けないようにする。 */
  pinHash: string
}

export class SetupCodeError extends Error {}

const PREFIX = 'recoco1:'
/** モデル名に使ってよい文字（英数字と . _ : - 、OpenRouter用の / 区切り）。送信先URLに組み込むため記号を制限する。 */
const MODEL_PATTERN = /^[A-Za-z0-9._:-]+(\/[A-Za-z0-9._:-]+)*$/

const INVALID = 'このコードは使えません。管理者からもらったQRコードをもう一度読んでください。'

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

/** 設定をQR用の文字列にする（キーは平文のまま見えないよう符号化する。暗号化ではない）。 */
export function encodeSetupCode(p: SetupPayload): string {
  return PREFIX + toBase64Url(JSON.stringify({ v: 1, p: p.provider, m: p.model, k: p.apiKey, h: p.pinHash }))
}

/** QRから読んだ文字列を設定に戻す。使えないコードなら SetupCodeError。 */
export function decodeSetupCode(text: string): SetupPayload {
  const t = text.trim()
  if (!t.startsWith(PREFIX)) throw new SetupCodeError(INVALID)
  let data: unknown
  try {
    data = JSON.parse(fromBase64Url(t.slice(PREFIX.length)))
  } catch {
    throw new SetupCodeError(INVALID)
  }
  if (!data || typeof data !== 'object') throw new SetupCodeError(INVALID)
  const { v, p, m, k, h } = data as Record<string, unknown>
  if (v !== 1) throw new SetupCodeError(INVALID)
  if (typeof p !== 'string' || !(p in PROVIDERS)) throw new SetupCodeError(INVALID)
  if (typeof m !== 'string' || !m.trim() || typeof k !== 'string' || !k.trim()) throw new SetupCodeError(INVALID)
  if (!MODEL_PATTERN.test(m) || m.split('/').includes('..')) throw new SetupCodeError(INVALID)
  if (getProvider(m) !== p) throw new SetupCodeError(INVALID)
  if (typeof h !== 'string' || !/^[0-9a-f]{64}$/.test(h)) throw new SetupCodeError(INVALID)
  return { provider: p as Provider, model: m, apiKey: k, pinHash: h }
}

/** この端末の今の設定。キーか暗証番号が無ければ null。 */
export function currentSetupPayload(): SetupPayload | null {
  const model = getEffectiveModel()
  const provider = getProvider(model)
  const apiKey = getApiKey(provider)
  const pinHash = getAdminPinHash()
  return apiKey && pinHash ? { provider, model, apiKey, pinHash } : null
}

/** 読み取った設定をこの端末に保存する。 */
export function applySetupCode(p: SetupPayload): void {
  setApiKey(p.provider, p.apiKey)
  setAdminPinHash(p.pinHash)
  if (isKnownModel(p.model)) {
    setModel(p.model)
    setCustomModelId('')
  } else {
    setCustomModelId(p.model)
  }
}
