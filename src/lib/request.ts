export class RequestTimeoutError extends Error {
  constructor() {
    super('AIの応答に時間がかかりすぎています。入力内容は保存されています。通信状況を確認して再度お試しください。')
    this.name = 'RequestTimeoutError'
  }
}

export class RequestCancelledError extends Error {
  constructor() {
    super('AIによる文章作成をキャンセルしました。入力内容は保存されています。')
    this.name = 'RequestCancelledError'
  }
}

export interface RequestControl {
  timeoutMs?: number
  signal?: AbortSignal
}

export const DEFAULT_AI_TIMEOUT_MS = 60_000

/** タイムアウトと利用者キャンセルに対応したfetch。 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  control: RequestControl = {}
): Promise<Response> {
  const controller = new AbortController()
  const timeoutMs = control.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS
  let timedOut = false
  let cancelled = false

  const abortFromCaller = () => {
    cancelled = true
    controller.abort()
  }
  if (control.signal?.aborted) abortFromCaller()
  else control.signal?.addEventListener('abort', abortFromCaller, { once: true })

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError()
    if (cancelled || control.signal?.aborted) throw new RequestCancelledError()
    throw error
  } finally {
    clearTimeout(timer)
    control.signal?.removeEventListener('abort', abortFromCaller)
  }
}
