import { describe, expect, it } from 'vitest'
import { maskNames, nameTokens } from './anonymize'

describe('nameTokens', () => {
  it('フルネーム・空白なし・名字・名前を長い順に返す', () => {
    expect(nameTokens(['山田 太郎'])).toEqual(['山田 太郎', '山田　太郎', '山田太郎', '山田', '太郎'])
  })

  it('様・さんを外した形も含め、1文字の語は置き換え対象にしない', () => {
    expect(nameTokens(['林様'])).toEqual(['林様'])
    expect(nameTokens(['A'])).toEqual([])
    expect(nameTokens(['佐藤さん'])).toEqual(['佐藤さん', '佐藤'])
  })
})

describe('maskNames', () => {
  it('登録名を「利用者」に置き換え、置き換えたことを返す', () => {
    const result = maskNames('山田太郎さんは昨夜よく眠れた。山田 太郎様の妻より相談あり。太郎「痛い」', ['山田 太郎'])
    expect(result.text).toBe('利用者さんは昨夜よく眠れた。利用者様の妻より相談あり。利用者「痛い」')
    expect(result.masked).toBe(true)
  })

  it('名前がなければそのまま返す', () => {
    expect(maskNames('発熱なし', ['山田 太郎'])).toEqual({ text: '発熱なし', masked: false })
  })

  it('正規表現の記号を含む名前でも壊れない', () => {
    expect(maskNames('A.B(仮)の記録', ['A.B(仮)']).text).toBe('利用者の記録')
  })
})
