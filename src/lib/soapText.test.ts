import { describe, expect, it } from 'vitest'
import { findPlaceholders, formatSoapForCopy, isSoapEmpty, parseMissing } from './soapText'

const soap = { s: ' 「よく眠れた」 ', o: '体温36.5℃', a: '睡眠は保たれている', p: '睡眠状況の観察を継続' }

describe('soapText', () => {
  it('S・O・A・Pを全角コロン付き・改行区切りで並べ、前後の空白を除く', () => {
    expect(formatSoapForCopy(soap)).toBe(
      'S：「よく眠れた」\nO：体温36.5℃\nA：睡眠は保たれている\nP：睡眠状況の観察を継続'
    )
  })

  it('空の欄も見出しだけ残す', () => {
    expect(formatSoapForCopy({ ...soap, p: '' })).toContain('\nP：')
  })

  it('reviewWarningやmissingはコピー文に入れない', () => {
    expect(formatSoapForCopy({ ...soap, reviewWarning: '要確認：…' })).not.toContain('要確認')
  })

  it('「未確認（」「要確認（」「評価困難」が残る欄を返す', () => {
    expect(
      findPlaceholders({
        s: '未確認（主観情報の入力なし）',
        o: '所見',
        a: '入力情報のみでは評価困難',
        p: '要確認（計画の入力なし）'
      })
    ).toEqual(['S', 'A', 'P'])
    expect(findPlaceholders(soap)).toEqual([])
  })

  it('4欄すべて空白ならisSoapEmptyはtrue', () => {
    expect(isSoapEmpty({ s: '', o: ' ', a: '', p: '' })).toBe(true)
    expect(isSoapEmpty(soap)).toBe(false)
  })
  it('parseMissingは改行で分け、空行と「なし」を除く', () => {
    expect(parseMissing('Pの内容が話されていません\n\nなし')).toEqual(['Pの内容が話されていません'])
    expect(parseMissing('なし。')).toEqual([])
    expect(parseMissing(undefined)).toEqual([])
  })
})
