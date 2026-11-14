import { beforeEach, describe, expect, it } from 'vitest'
import { checkAdminPin, getAdminPinHash, hashPin, isValidPin, setAdminPin } from './adminPin'

describe('adminPin', () => {
  beforeEach(() => localStorage.clear())

  it('4〜6桁の数字だけを暗証番号として認める', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('123456')).toBe(true)
    expect(isValidPin('123')).toBe(false)
    expect(isValidPin('1234567')).toBe(false)
    expect(isValidPin('12a4')).toBe(false)
  })

  it('暗証番号はそのまま保存せず、照合できる', async () => {
    await setAdminPin('2580')
    expect(getAdminPinHash()).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(localStorage)).not.toContain('2580')
    expect(await checkAdminPin('2580')).toBe(true)
    expect(await checkAdminPin('0000')).toBe(false)
  })

  it('同じ番号は同じハッシュになる', async () => {
    expect(await hashPin('1234')).toBe(await hashPin('1234'))
  })
})
