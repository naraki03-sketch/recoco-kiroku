import Dexie, { type Table } from 'dexie'
import type { Patient, RecordDoc } from './types'

class RecocoDB extends Dexie {
  patients!: Table<Patient, number>
  records!: Table<RecordDoc, number>

  constructor() {
    super('recoco-kiroku')
    this.version(1).stores({
      patients: '++id, name',
      records: '++id, type, patientId, visitDate, updatedAt'
    })
  }
}

export const db = new RecocoDB()
