import type { RecordType, Vitals } from './types'

/** InputForm の入力を端末内に一時保存するための下書き。書類タイプごとに保持する。 */
export interface FormDraft {
  patientId: number | ''
  visitDate: string
  vitals: Vitals
  memo: string
  savedAt: number
}

const PREFIX = 'recoco.draft.'

function keyFor(type: RecordType): string {
  return PREFIX + type
}

export function loadDraft(type: RecordType): FormDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(type))
    if (!raw) return null
    const d = JSON.parse(raw) as FormDraft
    // メモが空の下書きは復元対象にしない
    if (!d || typeof d.memo !== 'string' || !d.memo.trim()) return null
    return d
  } catch {
    return null
  }
}

export function saveDraft(type: RecordType, draft: Omit<FormDraft, 'savedAt'>): void {
  try {
    // 中身が空なら保存しない（空の下書きで復元を促さないため）
    if (!draft.memo.trim()) {
      clearDraft(type)
      return
    }
    localStorage.setItem(keyFor(type), JSON.stringify({ ...draft, savedAt: Date.now() }))
  } catch {
    // ストレージ不可時は黙って無視（下書きは補助機能のため）
  }
}

export function clearDraft(type: RecordType): void {
  try {
    localStorage.removeItem(keyFor(type))
  } catch {
    // 無視
  }
}
