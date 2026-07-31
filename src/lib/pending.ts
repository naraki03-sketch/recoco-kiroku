import type { RecordDoc, RecordType } from './types'

const KEY = 'recoco.pendingRecord'
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

interface StoredPending {
  savedAt: number
  record: RecordDoc
}

function hasStringFields(value: unknown, fields: string[]): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return fields.every((field) => typeof record[field] === 'string')
}

function isRecordDoc(value: unknown): value is RecordDoc {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  const type = record.type as RecordType
  if (!['soap', 'plan', 'report'].includes(type)) return false
  if (
    typeof record.patientName !== 'string' ||
    typeof record.visitDate !== 'string' ||
    typeof record.memo !== 'string' ||
    typeof record.createdAt !== 'number' ||
    typeof record.updatedAt !== 'number'
  ) return false

  if (type === 'soap') return hasStringFields(record.soap, ['s', 'o', 'a', 'p'])
  if (type === 'plan') return hasStringFields(record.plan, ['goal', 'issues', 'evaluation'])
  return hasStringFields(record.report, ['progress', 'careContent', 'homeCare', 'notes'])
}

export function savePendingRecord(record: RecordDoc): void {
  try {
    const stored: StoredPending = { savedAt: Date.now(), record }
    localStorage.setItem(KEY, JSON.stringify(stored))
  } catch {
    // 保存できない環境でも記録作成そのものは継続する。
  }
}

export function loadPendingRecord(): RecordDoc | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredPending>
    if (
      typeof parsed.savedAt !== 'number' ||
      Date.now() - parsed.savedAt > MAX_AGE_MS ||
      !isRecordDoc(parsed.record)
    ) {
      localStorage.removeItem(KEY)
      return null
    }
    return parsed.record
  } catch {
    localStorage.removeItem(KEY)
    return null
  }
}

export function clearPendingRecord(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // localStorageが使えない環境では何もしない。
  }
}
