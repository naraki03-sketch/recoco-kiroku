import { formatDateJa } from '../components/ui'
import { generateJson } from './ai'
import type { RequestControl } from './request'
import type { PlanResult, PreviousSoapContext, ReportResult, SoapResult, Vitals } from './types'
import { vitalsToText } from './types'
import { mergeVitals, normalizeSpokenVitals } from './vitals'

const FACT_RULES = `
【事実の扱い（最優先・厳守）】
- 入力メモ、入力されたバイタル、明示された前回記録だけを根拠にする。
- 入力にない診断名・薬剤名・薬効・原因・因果関係、症状、数値、処置、本人・家族の意向、心理状態を追加しない。
- 一般的にあり得る内容でも、今回の入力にないことは記録へ補わない。
- 不明な項目を「異常なし」「問題なし」「安定」「特記なし」と断定しない。
- 推測を事実らしく書かない。
- A・P、計画書、報告書では「まあまあ」などの口語・曖昧な表現をそのまま使わない。S欄で本人発言として引用する場合だけ原文を保持する。
- 口語を記録表現へ整える際も意味の強弱を変えず、主観情報なら「本人申告上、食欲は一定程度保たれている」のように情報源が分かる表現にする。
- 利用者の氏名・住所など個人を特定する情報は出力に含めず、「利用者」と表記する。
- 簡潔な常体で記述し、入力内容を誇張・一般化・言い換えによって変質させない。`

/** 計画書・報告書用: 足りない情報は文章の中に断り書きとして書かせる（従来どおり）。 */
const UNKNOWN_AS_TEXT = `- 情報が必要な欄には「未確認（入力情報なし）」と書く。
- 入力事実だけでは判断できない場合は「入力情報のみでは評価困難」とする。`

/** SOAP用: 足りない情報は文章に書かせず、missing で職員に知らせる（貼り付け文に断り書きを残さない）。 */
const UNKNOWN_AS_MISSING = `
【足りない情報の扱い】
- 情報がない欄、入力事実だけでは評価できない欄は空文字にする。
- 「未確認」「要確認」「評価困難」などの断り書きをS・O・A・Pの文章に書かない。
- 代わりに missing に、足りない欄ごとに1行ずつ、職員に分かる短い文で書く（例: 「Pが話されていません。次回みること・続けることを一言足してください。」）。
- 足りない欄がなければ missing は「なし」とする。`

/** 前回訪問の記録（経過比較のため。氏名など個人を特定する情報は含めない）。 */
export type PreviousSoap = PreviousSoapContext

/** SOAP生成の結果。vitals は手入力を優先し、空の項目を声で言った値で埋めたもの。 */
export interface SoapGeneration {
  soap: SoapResult
  vitals: Vitals
}

interface SoapResponse extends SoapResult {
  vTemp: string
  vBpHigh: string
  vBpLow: string
  vPulse: string
  vSpo2: string
  vResp: string
}

const SOAP_KEYS = ['s', 'o', 'a', 'p', 'reviewWarning', 'missing', 'vTemp', 'vBpHigh', 'vBpLow', 'vPulse', 'vSpo2', 'vResp']

export async function generateSoap(
  memo: string,
  vitals?: Vitals,
  previous?: PreviousSoap,
  control: RequestControl = {}
): Promise<SoapGeneration> {
  const vitalsText = vitalsToText(vitals)
  const previousBlock = previous
    ? `\n\n【前回訪問の記録（${formatDateJa(previous.visitDate)}）】
※今回と前回の両方に同じ観察項目が明示されている場合だけ比較する。変化の原因は推測しない。前回情報を今回の所見として転記しない。
- 前回バイタル: ${previous.vitalsText || '（記録なし）'}
- 前回O: ${previous.o || '（記録なし）'}
- 前回A: ${previous.a || '（記録なし）'}`
    : ''

  const prompt = `あなたは訪問看護記録の整形を補助するアシスタントです。
入力された事実をSOAPの各欄へ分類してください。新しい臨床情報や看護計画を考案する仕事ではありません。
${FACT_RULES}
${UNKNOWN_AS_MISSING}

【SOAPの分類】
- S: 入力に明示された本人・家族の発言や訴えだけ。発言は可能な限り「」で保持する。なければ空文字。
- O: 入力されたバイタル、観察所見、実際に行ったケアだけ。主観や推測を混ぜない。なければ空文字。
- A: S・Oに明示された事実を簡潔に評価する。O欄の内容を単に言い換えたり再掲したりせず、A欄にバイタルの数値を再掲しない。バイタルには、前回との変化や臨床的な意味が入力から明確に言える場合だけ触れる。診断、原因、薬効、リスク、心理を推測しない。評価できなければ空文字にして missing に書く。
- P: メモに明示された継続事項、次回確認事項、連携方針だけ。明示がなければ空文字。

【音声入力・不明語の確認】
- 文脈上意味が通らない語句、医学用語として不自然な語句、音声入力の誤変換が疑われる語句を、そのまま臨床事実として記載しない。
- 誤変換らしく見えても、推測で別の医学用語へ訂正しない。その語句を含む内容はSOAPの欄に書かない。
- reviewWarningには、確認が必要な原文を引用して「要確認：入力語句「原文」の意味を確認してください。」と記載する。確認事項がなければ「なし」とする。

【声で言ったバイタル】
- メモの中に体温・血圧・脈拍・SpO2・呼吸数の数値があれば、vTemp, vBpHigh, vBpLow, vPulse, vSpo2, vResp に半角数字だけで入れる（体温は 36.5 の形）。
- 言っていない項目は空文字。数値を推測しない。
- メモの数値はO欄にも書く。

【バイタルサイン（手入力）】
${vitalsText || '（入力なし）'}${previousBlock}

【今回の入力メモ】
${memo}`

  const res = await generateJson<SoapResponse>(prompt, {
    type: 'OBJECT',
    properties: {
      s: { type: 'STRING', description: 'S: 入力に明示された主観的情報のみ。なければ空文字' },
      o: { type: 'STRING', description: 'O: 入力された客観的情報と実施事実のみ。なければ空文字' },
      a: { type: 'STRING', description: 'A: 入力事実の範囲内の評価。推測禁止。評価できなければ空文字' },
      p: { type: 'STRING', description: 'P: 入力に明示された計画のみ。なければ空文字' },
      reviewWarning: { type: 'STRING', description: '誤変換・意味不明語の確認事項。なければ「なし」' },
      missing: { type: 'STRING', description: '足りない欄の案内。1欄1行。なければ「なし」' },
      vTemp: { type: 'STRING', description: 'メモで言った体温（半角数字）。なければ空文字' },
      vBpHigh: { type: 'STRING', description: 'メモで言った収縮期血圧。なければ空文字' },
      vBpLow: { type: 'STRING', description: 'メモで言った拡張期血圧。なければ空文字' },
      vPulse: { type: 'STRING', description: 'メモで言った脈拍。なければ空文字' },
      vSpo2: { type: 'STRING', description: 'メモで言ったSpO2。なければ空文字' },
      vResp: { type: 'STRING', description: 'メモで言った呼吸数。なければ空文字' }
    },
    required: SOAP_KEYS,
    propertyOrdering: SOAP_KEYS
  }, control, ['s', 'o', 'a', 'p', 'vTemp', 'vBpHigh', 'vBpLow', 'vPulse', 'vSpo2', 'vResp'])

  const soap: SoapResult = { s: res.s, o: res.o, a: res.a, p: res.p, reviewWarning: res.reviewWarning, missing: res.missing }
  const spoken = normalizeSpokenVitals({
    temp: res.vTemp,
    bpHigh: res.vBpHigh,
    bpLow: res.vBpLow,
    pulse: res.vPulse,
    spo2: res.vSpo2,
    resp: res.vResp
  })
  return { soap, vitals: mergeVitals(vitals, spoken) }
}

export async function generatePlan(
  memo: string,
  control: RequestControl = {}
): Promise<PlanResult> {
  const prompt = `あなたは訪問看護計画書の整形を補助するアシスタントです。
入力メモを各欄へ分類してください。入力にない目標・問題・支援内容を考案しないでください。
${FACT_RULES}
${UNKNOWN_AS_TEXT}

【各欄】
- goal: 入力に明示された利用者・家族の意向や目標だけ。なければ「未確認（目標の入力なし）」。
- issues: 入力に明示された療養上の課題と、実施予定として明示された支援だけ。推測した課題や標準的ケアを追加しない。なければ「未確認（課題・支援内容の入力なし）」。
- evaluation: 入力に明示された現在の状態・経過の評価だけ。なければ「未確認（評価情報の入力なし）」。

【入力メモ】
${memo}`

  return generateJson<PlanResult>(prompt, {
    type: 'OBJECT',
    properties: {
      goal: { type: 'STRING', description: '入力に明示された目標' },
      issues: { type: 'STRING', description: '入力に明示された課題・支援内容' },
      evaluation: { type: 'STRING', description: '入力に明示された評価' }
    },
    required: ['goal', 'issues', 'evaluation']
  }, control)
}

export async function generateReport(
  memo: string,
  control: RequestControl = {}
): Promise<ReportResult> {
  const prompt = `あなたは主治医へ提出する訪問看護報告書の整形を補助するアシスタントです。
対象期間の入力事実を各欄へ分類してください。入力にない期間全体の傾向や臨床判断を補わないでください。
${FACT_RULES}
${UNKNOWN_AS_TEXT}

【各欄】
- progress: 入力に明示された病状・症状・バイタルの経過。複数時点の情報がある場合だけ改善・悪化・不変を記載する。期間評価に情報が足りなければ、その旨を明記する。
- careContent: 入力に明示された実施済みの看護・処置・指導だけ。
- homeCare: 入力に明示された家族の介護状況・介護負担・家庭環境だけ。なければ「未確認（家庭での介護状況の入力なし）」。
- notes: 入力に明示された主治医への伝達事項、今後の方針、連携事項だけ。なければ「未確認（特記事項の入力なし）」。

【対象期間の入力情報】
${memo}`

  return generateJson<ReportResult>(prompt, {
    type: 'OBJECT',
    properties: {
      progress: { type: 'STRING', description: '入力された対象期間の病状の経過' },
      careContent: { type: 'STRING', description: '入力に明示された実施内容' },
      homeCare: { type: 'STRING', description: '入力に明示された家庭での介護状況' },
      notes: { type: 'STRING', description: '入力に明示された伝達・連携事項' }
    },
    required: ['progress', 'careContent', 'homeCare', 'notes'],
    propertyOrdering: ['progress', 'careContent', 'homeCare', 'notes']
  }, control)
}
