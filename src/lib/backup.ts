import { db } from './db'
import type { Patient, RecordDoc } from './types'

/** バックアップファイルの形式（端末間のデータ移行・復旧に使用）。 */
export interface BackupData {
  app: 'recoco-kiroku'
  version: 1
  exportedAt: number
  patients: Patient[]
  records: RecordDoc[]
}

/** 全データ（利用者・記録）をJSON文字列にまとめる。 */
export async function buildBackup(): Promise<BackupData> {
  const [patients, records] = await Promise.all([
    db.patients.toArray(),
    db.records.toArray()
  ])
  return {
    app: 'recoco-kiroku',
    version: 1,
    exportedAt: Date.now(),
    patients,
    records
  }
}

/** バックアップをファイルとしてダウンロードさせる。 */
export async function exportBackup(): Promise<void> {
  const data = await buildBackup()
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const d = new Date()
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const a = document.createElement('a')
  a.href = url
  a.download = `recoco-backup-${ymd}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // すぐに revoke するとダウンロードが中断される端末があるため遅延させる
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function isBackup(x: unknown): x is BackupData {
  if (!x || typeof x !== 'object') return false
  const d = x as Record<string, unknown>
  return d.app === 'recoco-kiroku' && Array.isArray(d.patients) && Array.isArray(d.records)
}

export interface ImportResult {
  patients: number
  records: number
}

/**
 * バックアップJSON文字列を取り込む。既存データは消さず追加する（id は振り直す）。
 * 利用者は名前が一致する既存レコードがあれば再利用し、記録の patientId を繋ぎ直す。
 */
export async function importBackup(json: string): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('ファイルの形式が正しくありません（JSONとして読み取れませんでした）。')
  }
  if (!isBackup(parsed)) {
    throw new Error('recocoのバックアップファイルではないようです。書き出したJSONを選んでください。')
  }

  // 既存の利用者名 → id の対応
  const existing = await db.patients.toArray()
  const nameToId = new Map<string, number>()
  for (const p of existing) if (p.id != null) nameToId.set(p.name, p.id)

  // 取り込むバックアップ内の旧id → 新id の対応
  const oldToNewPatientId = new Map<number, number>()
  let addedPatients = 0
  for (const p of parsed.patients) {
    const oldId = p.id
    let newId = p.name ? nameToId.get(p.name) : undefined
    if (newId == null) {
      newId = await db.patients.add({ name: p.name, createdAt: p.createdAt ?? Date.now() })
      nameToId.set(p.name, newId)
      addedPatients++
    }
    if (oldId != null) oldToNewPatientId.set(oldId, newId)
  }

  let addedRecords = 0
  for (const r of parsed.records) {
    const { id: _omit, ...rest } = r
    const patientId = rest.patientId != null ? oldToNewPatientId.get(rest.patientId) : undefined
    await db.records.add({ ...rest, patientId })
    addedRecords++
  }

  return { patients: addedPatients, records: addedRecords }
}
