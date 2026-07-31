import { describe, expect, it } from 'vitest'
import { validateGeneratedJson, type JsonSchema } from './aiValidation'

const soapSchema: JsonSchema = {
  type: 'OBJECT',
  properties: {
    s: { type: 'STRING' },
    o: { type: 'STRING' },
    a: { type: 'STRING' },
    p: { type: 'STRING' }
  },
  required: ['s', 'o', 'a', 'p']
}

describe('validateGeneratedJson', () => {
  it('必須項目が欠けたAI応答を拒否する', () => {
    expect(() => validateGeneratedJson({ s: '本人は食欲あり' }, soapSchema)).toThrow(
      'AIの回答に必要な項目がありません'
    )
  })

  it('文字列以外の値を拒否する', () => {
    expect(() =>
      validateGeneratedJson({ s: 123, o: '所見', a: '評価', p: '計画' }, soapSchema)
    ).toThrow('AIの回答の形式が正しくありません')
  })

  it('空文字の必須項目を拒否する', () => {
    expect(() =>
      validateGeneratedJson({ s: '発言', o: ' ', a: '評価', p: '計画' }, soapSchema)
    ).toThrow('AIの回答に空の項目があります')
  })

  it('正しい応答をそのまま返す', () => {
    const value = { s: '発言', o: '所見', a: '評価', p: '計画' }
    expect(validateGeneratedJson(value, soapSchema)).toEqual(value)
  })
})
