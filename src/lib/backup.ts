import { db } from './db'
import { createStableId } from './id'
import type { Patient, RecordDoc, RecordType, Vitals } from './types'

/** バックアップファイルの形式（version 1も取込互換を維持）。 */
export interface BackupData {
  app: 'recoco-kiroku'
  version: 2
  exportedAt: number
  patients: Patient[]
  records: RecordDoc[]
}

async function ensureStableIds(): Promise<void> {
  await db.transaction('rw', db.patients, db.records, async () => {
    await db.patients.toCollection().modify((patient) => {
      if (!patient.uuid) patient.uuid = createStableId()
    })
    await db.records.toCollection().modify((record) => {
      if (!record.uuid) record.uuid = createStableId()
    })
  })
}

/** 全データ（利用者・記録）をJSON文字列にまとめる。 */
export async function buildBackup(): Promise<BackupData> {
  await ensureStableIds()
  const [patients, records] = await Promise.all([db.patients.toArray(), db.records.toArray()])
  return {
    app: 'recoco-kiroku',
    version: 2,
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
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

interface ImportBackupData {
  app: 'recoco-kiroku'
  version: 1 | 2
  exportedAt: number
  patients: Patient[]
  records: RecordDoc[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function optionalId(value: unknown): boolean {
  return value === undefined || (typeof value === 'number' && Number.isInteger(value) && value > 0)
}

function isPatient(value: unknown): value is Patient {
  if (!isObject(value)) return false
  return optionalId(value.id) &&
    (value.uuid === undefined || (typeof value.uuid === 'string' && value.uuid.length > 0)) &&
    typeof value.name === 'string' && value.name.trim().length > 0 &&
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
}

function hasStrings(value: unknown, keys: string[]): boolean {
  return isObject(value) && keys.every((key) => typeof value[key] === 'string' && value[key].trim().length > 0)
}

/** SOAPは話されていない欄を空文字で持つため、空欄を許す（文字列であることだけ確かめる）。 */
function hasStringsAllowEmpty(value: unknown, keys: string[]): boolean {
  return isObject(value) && keys.every((key) => typeof value[key] === 'string')
}

function isVitals(value: unknown): value is Vitals {
  return isObject(value) && ['temp', 'bpHigh', 'bpLow', 'pulse', 'spo2', 'resp']
    .every((key) => typeof value[key] === 'string')
}

function isRecordDoc(value: unknown): value is RecordDoc {
  if (!isObject(value)) return false
  const type = value.type as RecordType
  if (!['soap', 'plan', 'report'].includes(type)) return false
  if (!optionalId(value.id) || !optionalId(value.patientId)) return false
  if (value.uuid !== undefined && (typeof value.uuid !== 'string' || !value.uuid)) return false
  if (typeof value.patientName !== 'string' || typeof value.memo !== 'string') return false
  if (typeof value.visitDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.visitDate)) return false
  if (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt)) return false
  if (typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)) return false
  if (value.vitals !== undefined && !isVitals(value.vitals)) return false
  if (type === 'soap') return hasStringsAllowEmpty(value.soap, ['s', 'o', 'a', 'p'])
  if (type === 'plan') return hasStrings(value.plan, ['goal', 'issues', 'evaluation'])
  // 報告書も足りない欄を空文字で持つため、空欄を許す
  return hasStringsAllowEmpty(value.report, ['progress', 'careContent', 'homeCare', 'notes'])
}

function isBackup(value: unknown): value is ImportBackupData {
  if (!isObject(value)) return false
  return value.app === 'recoco-kiroku' &&
    (value.version === 1 || value.version === 2) &&
    typeof value.exportedAt === 'number' && Number.isFinite(value.exportedAt) &&
    Array.isArray(value.patients) && value.patients.every(isPatient) &&
    Array.isArray(value.records) && value.records.every(isRecordDoc)
}

function hash(text: string): string {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return (value >>> 0).toString(36)
}

function legacyUuid(kind: 'patient' | 'record', exportedAt: number, oldId: number | undefined, index: number): string {
  return `legacy-${kind}-${hash(`${exportedAt}:${oldId ?? index}`)}`
}

function assertUniqueUuids(items: Array<{ uuid?: string }>, label: string): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (!item.uuid) continue
    if (seen.has(item.uuid)) throw new Error(`バックアップ内の${label}IDが重複しています。取込を中止しました。`)
    seen.add(item.uuid)
  }
}

export interface ImportResult {
  patients: number
  records: number
}

/** UUIDで同一データを判定し、同名の別人を統合せず、再取込も重複させない。 */
export async function importBackup(json: string): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('ファイルの形式が正しくありません（JSONとして読み取れませんでした）。')
  }
  if (!isBackup(parsed)) {
    throw new Error('recocoの有効なバックアップではありません。内容が欠けているか、形式が壊れています。')
  }
  assertUniqueUuids(parsed.patients, '利用者')
  assertUniqueUuids(parsed.records, '記録')

  return db.transaction('rw', db.patients, db.records, async () => {
    const existingPatients = await db.patients.toArray()
    const patientUuidToId = new Map<string, number>()
    for (const patient of existingPatients) {
      if (patient.uuid && patient.id != null) patientUuidToId.set(patient.uuid, patient.id)
    }

    const oldToNewPatientId = new Map<number, number>()
    let addedPatients = 0
    for (const [index, patient] of parsed.patients.entries()) {
      const uuid = patient.uuid ?? legacyUuid('patient', parsed.exportedAt, patient.id, index)
      let newId = patientUuidToId.get(uuid)
      if (newId == null) {
        newId = await db.patients.add({ uuid, name: patient.name.trim(), createdAt: patient.createdAt })
        patientUuidToId.set(uuid, newId)
        addedPatients++
      }
      if (patient.id != null) oldToNewPatientId.set(patient.id, newId)
    }

    const existingRecordUuids = new Set(
      (await db.records.toArray()).map((record) => record.uuid).filter((uuid): uuid is string => !!uuid)
    )
    let addedRecords = 0
    for (const [index, record] of parsed.records.entries()) {
      const uuid = record.uuid ?? legacyUuid('record', parsed.exportedAt, record.id, index)
      if (existingRecordUuids.has(uuid)) continue
      const { id: _oldId, patientId: oldPatientId, ...rest } = record
      const patientId = oldPatientId == null ? undefined : oldToNewPatientId.get(oldPatientId)
      if (oldPatientId != null && patientId == null) {
        throw new Error('記録が参照する利用者がバックアップ内にありません。取込を中止しました。')
      }
      await db.records.add({ ...rest, uuid, patientId })
      existingRecordUuids.add(uuid)
      addedRecords++
    }
    return { patients: addedPatients, records: addedRecords }
  })
}
