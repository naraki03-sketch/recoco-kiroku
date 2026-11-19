import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePlan, generateReport, generateSoap } from './prompts'

const generateJson = vi.hoisted(() => vi.fn())
vi.mock('./ai', () => ({ generateJson }))

describe('medical-record prompts', () => {
  beforeEach(() => {
    generateJson.mockReset()
    generateJson.mockResolvedValue({ s: 'S', o: 'O', a: 'A', p: 'P' })
  })

  it('SOAPでは入力にない診断・薬効・因果関係を禁止し、推論欄を出力させない', async () => {
    await generateSoap('本人「眠れた」。下肢浮腫軽減。', {
      temp: '', bpHigh: '', bpLow: '', pulse: '', spo2: '', resp: ''
    })

    const [prompt, schema] = generateJson.mock.calls[0]
    expect(prompt).toContain('入力にない診断名・薬剤名・薬効・原因・因果関係')
    expect(prompt).toContain('推測を事実らしく書かない')
    expect(prompt).toContain('「まあまあ」などの口語・曖昧な表現をそのまま使わない')
    expect(prompt).not.toContain('利尿薬の効果')
    expect(schema.required).toEqual(['s', 'o', 'a', 'p', 'reviewWarning', 'missing', 'vTemp', 'vBpHigh', 'vBpLow', 'vPulse', 'vSpo2', 'vResp'])
    expect(schema.properties).not.toHaveProperty('assessmentReasoning')
  })

  it('A欄ではO欄のバイタル数値を再掲せず、評価だけを書くよう指示する', async () => {
    await generateSoap('夜間不眠の訴えあり', {
      temp: '36.5', bpHigh: '128', bpLow: '72', pulse: '76', spo2: '98', resp: '16'
    })

    const [prompt] = generateJson.mock.calls[0]
    expect(prompt).toContain('A欄にバイタルの数値を再掲しない')
    expect(prompt).toContain('前回との変化や臨床的な意味が入力から明確に言える場合だけ')
  })

  it('音声入力の誤変換が疑われる語句は推測で訂正せず、確認警告を返すよう指示する', async () => {
    await generateSoap('下痢の不足、やや軽減。次回も不足の計画を続ける。')

    const [prompt, schema] = generateJson.mock.calls[0]
    expect(prompt).toContain('音声入力の誤変換')
    expect(prompt).toContain('推測で別の医学用語へ訂正しない')
    expect(schema.required).toContain('reviewWarning')
  })

  it('計画書・報告書も内部推論欄を要求しない', async () => {
    generateJson.mockResolvedValueOnce({ goal: 'G', issues: 'I', evaluation: 'E' })
    await generatePlan('自宅生活を続けたい')
    const planSchema = generateJson.mock.calls[0][1]
    expect(planSchema.required).toEqual(['goal', 'issues', 'evaluation'])
    expect(planSchema.properties).not.toHaveProperty('planningReasoning')

    generateJson.mockResolvedValueOnce({ progress: 'P', careContent: 'C', homeCare: 'H', notes: 'N' })
    await generateReport('今月は発熱なし')
    const reportSchema = generateJson.mock.calls[1][1]
    expect(reportSchema.required).toEqual(['progress', 'careContent', 'homeCare', 'notes', 'missing'])
    expect(reportSchema.properties).not.toHaveProperty('reportingReasoning')
  })

  it('報告書は複数回の記録を日付順にまとめ、足りない欄は missing で知らせる', async () => {
    generateJson.mockResolvedValueOnce({ progress: '経過', careContent: '内容', homeCare: '', notes: '', missing: '家庭での介護の状況が分かりません。' })
    const report = await generateReport('【アプリの記録】\n■2026年11月5日\nO：下肢浮腫あり')
    const [prompt, , , allowEmpty] = generateJson.mock.calls[0]
    expect(prompt).toContain('訪問日')
    expect(prompt).toContain('同じ内容は1つにまとめる')
    expect(prompt).toContain('■2026年11月5日')
    expect(prompt).not.toContain('「未確認（')
    expect(prompt).not.toContain('入力情報のみでは評価困難')
    expect(allowEmpty).toEqual(['progress', 'careContent', 'homeCare', 'notes'])
    expect(report.missing).toBe('家庭での介護の状況が分かりません。')
  })
  it('SOAPでは断り書きを文章に書かせず、missingへ出させる', async () => {
    generateJson.mockResolvedValue({ s: '', o: 'O', a: '', p: '', reviewWarning: 'なし', missing: 'Pが話されていません。', vTemp: '', vBpHigh: '', vBpLow: '', vPulse: '', vSpo2: '', vResp: '' })
    const { soap } = await generateSoap('下肢浮腫軽減')
    const [prompt, , , allowEmpty] = generateJson.mock.calls[0]
    expect(prompt).not.toContain('「未確認（')
    expect(prompt).not.toContain('入力情報のみでは評価困難')
    expect(prompt).toContain('空文字')
    expect(prompt).toContain('missing')
    expect(allowEmpty).toEqual(expect.arrayContaining(['s', 'o', 'a', 'p']))
    expect(soap).toEqual({ s: '', o: 'O', a: '', p: '', reviewWarning: 'なし', missing: 'Pが話されていません。' })
  })

  it('声のバイタルを正規化し、手入力を優先して返す', async () => {
    generateJson.mockResolvedValue({ s: 'S', o: 'O', a: 'A', p: 'P', reviewWarning: 'なし', missing: 'なし', vTemp: '36度5分', vBpHigh: '128', vBpLow: '76', vPulse: '', vSpo2: '', vResp: '' })
    const { vitals } = await generateSoap('体温36度5分 血圧128の76', { temp: '37.0', bpHigh: '', bpLow: '', pulse: '', spo2: '', resp: '' })
    expect(vitals).toEqual({ temp: '37.0', bpHigh: '128', bpLow: '76', pulse: '', spo2: '', resp: '' })
  })

  it('禁止事項（診断・薬効・原因の追加禁止）は保つ', async () => {
    generateJson.mockResolvedValue({ s: 'S', o: 'O', a: 'A', p: 'P', reviewWarning: 'なし', missing: 'なし', vTemp: '', vBpHigh: '', vBpLow: '', vPulse: '', vSpo2: '', vResp: '' })
    await generateSoap('本人「眠れた」')
    const [prompt] = generateJson.mock.calls[0]
    expect(prompt).toContain('入力にない診断名・薬剤名・薬効・原因・因果関係')
    expect(prompt).toContain('推測で別の医学用語へ訂正しない')
  })

  it('計画書・報告書は従来どおり「未確認」を文章に書かせる', async () => {
    generateJson.mockResolvedValueOnce({ goal: 'G', issues: 'I', evaluation: 'E' })
    await generatePlan('自宅生活を続けたい')
    expect(generateJson.mock.calls[0][0]).toContain('未確認（入力情報なし）')
    expect(generateJson.mock.calls[0][0]).toContain('入力情報のみでは評価困難')
  })
})
