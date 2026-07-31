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
    expect(prompt).toContain('未確認')
    expect(prompt).toContain('推測を事実らしく書かない')
    expect(prompt).toContain('「まあまあ」などの口語・曖昧な表現をそのまま使わない')
    expect(prompt).not.toContain('利尿薬の効果')
    expect(schema.required).toEqual(['s', 'o', 'a', 'p', 'reviewWarning'])
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
    expect(reportSchema.required).toEqual(['progress', 'careContent', 'homeCare', 'notes'])
    expect(reportSchema.properties).not.toHaveProperty('reportingReasoning')
  })
})
