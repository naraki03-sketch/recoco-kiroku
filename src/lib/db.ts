import Dexie, { type Table } from 'dexie'
import type { Patient, RecordDoc } from './types'
import { createStableId } from './id'

class RecocoDB extends Dexie {
  patients!: Table<Patient, number>
  records!: Table<RecordDoc, number>

  constructor() {
    super('recoco-kiroku')
    this.version(1).stores({
      patients: '++id, name',
      records: '++id, type, patientId, visitDate, updatedAt'
    })
    this.version(2).stores({
      patients: '++id, uuid, name',
      records: '++id, uuid, type, patientId, visitDate, updatedAt'
    }).upgrade(async (tx) => {
      await tx.table('patients').toCollection().modify((patient: Patient) => {
        if (!patient.uuid) patient.uuid = createStableId()
      })
      await tx.table('records').toCollection().modify((record: RecordDoc) => {
        if (!record.uuid) record.uuid = createStableId()
      })
    })
  }
}

export const db = new RecocoDB()
