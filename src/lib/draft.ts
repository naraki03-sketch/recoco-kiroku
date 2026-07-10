import type { RecordType, Vitals } from './types'

/** InputForm の入力を端末内に一時保存するための下書き。書類タイプ×利用者ごとに保持する。 */
export interface FormDraft {
  patientId: number | ''
  visitDate: string
  vitals: Vitals
  memo: string
  savedAt: number
}

/** 1タイプ内の下書きを「利用者キー→下書き」で保持したもの。 */
type DraftMap = Record<string, FormDraft>

/** 利用者「選択なし」のまま書いた下書きを入れるスロットのキー。 */
export const NONE_KEY = 'none'

/** 1タイプあたりに保持する下書きの上限（超えたら最古から削除）。 */
const MAX_DRAFTS_PER_TYPE = 8

/** これより古い下書きは読み込み時に破棄する（ミリ秒）。 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

const PREFIX = 'recoco.drafts.' // 複数形（旧形式 recoco.draft.<type> とは別キー）
const LEGACY_PREFIX = 'recoco.draft.'

function keyFor(type: RecordType): string {
  return PREFIX + type
}

/** patientId から localStorage 上のスロットキーへ。未選択は NONE_KEY。 */
export function patientKeyOf(patientId: number | ''): string {
  return patientId === '' ? NONE_KEY : String(patientId)
}

/** メモが実質空の下書きは「無い」ものとして扱う。 */
function isEmptyDraft(d: FormDraft | undefined | null): boolean {
  return !d || typeof d.memo !== 'string' || !d.memo.trim()
}

/**
 * 生のマップを読み、旧形式からの移行・期限切れ掃除・空スロット除去まで済ませて返す。
 * localStorage不可・JSON破損時は空マップ（防御的）。
 */
function readMap(type: RecordType): DraftMap {
  let map: DraftMap = {}
  try {
    const raw = localStorage.getItem(keyFor(type))
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') map = parsed as DraftMap
    }
  } catch {
    map = {}
  }

  // 旧形式キー（recoco.draft.<type>）があれば取り込んで削除する。
  try {
    const legacyRaw = localStorage.getItem(LEGACY_PREFIX + type)
    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as FormDraft
      if (!isEmptyDraft(legacy)) {
        const k = patientKeyOf(legacy.patientId)
        // 既存スロットが空、または旧下書きの方が新しければ移行する
        const existing = map[k]
        if (isEmptyDraft(existing) || (existing.savedAt ?? 0) < (legacy.savedAt ?? 0)) {
          map[k] = legacy
        }
      }
      localStorage.removeItem(LEGACY_PREFIX + type)
    }
  } catch {
    // 旧キーが壊れていても無視
  }

  // 期限切れ・空スロットを除去
  const now = Date.now()
  for (const k of Object.keys(map)) {
    const d = map[k]
    if (isEmptyDraft(d) || now - (d.savedAt ?? 0) > MAX_AGE_MS) {
      delete map[k]
    }
  }
  return map
}

/** マップを保存する。空になったらキーごと削除。 */
function writeMap(type: RecordType, map: DraftMap): void {
  try {
    if (Object.keys(map).length === 0) {
      localStorage.removeItem(keyFor(type))
    } else {
      localStorage.setItem(keyFor(type), JSON.stringify(map))
    }
  } catch {
    // ストレージ不可時は黙って無視（下書きは補助機能のため）
  }
}

/** 上限を超えたぶんを savedAt が古い順に削除する（LRU）。 */
function enforceLimit(map: DraftMap): void {
  const keys = Object.keys(map)
  if (keys.length <= MAX_DRAFTS_PER_TYPE) return
  keys
    .sort((a, b) => (map[a].savedAt ?? 0) - (map[b].savedAt ?? 0))
    .slice(0, keys.length - MAX_DRAFTS_PER_TYPE)
    .forEach((k) => delete map[k])
}

/** 指定タイプ・利用者の下書きを読む。メモが空なら null。 */
export function loadDraft(type: RecordType, patientKey: string): FormDraft | null {
  const map = readMap(type)
  writeMap(type, map) // 移行・掃除の結果を永続化
  const d = map[patientKey]
  return isEmptyDraft(d) ? null : d
}

/** 指定タイプ・利用者に下書きを保存する。メモが空ならそのスロットを削除。 */
export function saveDraft(
  type: RecordType,
  patientKey: string,
  draft: Omit<FormDraft, 'savedAt'>
): void {
  const map = readMap(type)
  if (!draft.memo.trim()) {
    delete map[patientKey]
  } else {
    map[patientKey] = { ...draft, savedAt: Date.now() }
    enforceLimit(map)
  }
  writeMap(type, map)
}

/** 指定タイプ・利用者の下書きを削除する。 */
export function clearDraft(type: RecordType, patientKey: string): void {
  const map = readMap(type)
  if (map[patientKey]) {
    delete map[patientKey]
    writeMap(type, map)
  }
}

/** 指定タイプの全下書き（利用者キー→下書き）。「下書きあり」表示用。 */
export function listDrafts(type: RecordType): DraftMap {
  const map = readMap(type)
  writeMap(type, map)
  return map
}

/** 指定タイプで savedAt が最新の下書き1件（フォーム初期復元用）。無ければ null。 */
export function latestDraft(type: RecordType): FormDraft | null {
  const map = readMap(type)
  writeMap(type, map)
  let best: FormDraft | null = null
  for (const k of Object.keys(map)) {
    const d = map[k]
    if (!best || (d.savedAt ?? 0) > (best.savedAt ?? 0)) best = d
  }
  return best
}

/** 全タイプから、指定利用者の下書きスロットを削除する（利用者削除時用）。 */
export function clearDraftsForPatient(patientId: number): void {
  const key = String(patientId)
  ;(['soap', 'plan', 'report'] as RecordType[]).forEach((type) => {
    const map = readMap(type)
    if (map[key]) {
      delete map[key]
      writeMap(type, map)
    }
  })
}
