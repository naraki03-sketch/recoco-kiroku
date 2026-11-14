import { beforeEach, describe, expect, it } from 'vitest'
import { importBackup } from './backup'
import { db } from './db'

const backup = JSON.stringify({
  app: 'recoco-kiroku',
  version: 2,
  exportedAt: 100,
  patients: [
    { id: 1, uuid: 'patient-a', name: '同名利用者', createdAt: 1 },
    { id: 2, uuid: 'patient-b', name: '同名利用者', createdAt: 2 }
  ],
  records: [
    {
      id: 1, uuid: 'record-a', type: 'soap', patientId: 1, patientName: '同名利用者',
      visitDate: '2026-07-01', memo: 'A', soap: { s: 'S', o: 'O', a: 'A', p: 'P' },
      createdAt: 1, updatedAt: 1
    },
    {
      id: 2, uuid: 'record-b', type: 'soap', patientId: 2, patientName: '同名利用者',
      visitDate: '2026-07-02', memo: 'B', soap: { s: 'S', o: 'O', a: 'A', p: 'P' },
      createdAt: 2, updatedAt: 2
    }
  ]
})

describe('importBackup identity safety', () => {
  beforeEach(async () => {
    await db.records.clear()
    await db.patients.clear()
  })

  it('同名でもUUIDが異なる利用者を別人として復元する', async () => {
    await expect(importBackup(backup)).resolves.toEqual({ patients: 2, records: 2 })
    const patients = await db.patients.toArray()
    const records = await db.records.orderBy('visitDate').toArray()
    expect(patients).toHaveLength(2)
    expect(records[0].patientId).not.toBe(records[1].patientId)
  })

  it('同じバックアップを再取込しても重複しない', async () => {
    await importBackup(backup)
    await expect(importBackup(backup)).resolves.toEqual({ patients: 0, records: 0 })
    expect(await db.patients.count()).toBe(2)
    expect(await db.records.count()).toBe(2)
  })
  it('空欄のあるSOAPや「足りないところ」付きの記録も取り込める', async () => {
    const data = JSON.parse(backup)
    data.records[0].soap = { s: 'S', o: 'O', a: '', p: '', reviewWarning: 'なし', missing: 'Pが話されていません。' }
    await expect(importBackup(JSON.stringify(data))).resolves.toEqual({ patients: 2, records: 2 })
    const saved = await db.records.where('uuid').equals('record-a').first()
    expect(saved?.soap).toMatchObject({ a: '', p: '', missing: 'Pが話されていません。' })
  })
})
