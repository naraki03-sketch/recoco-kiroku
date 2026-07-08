import { formatDateJa } from '../components/ui'
import { generateJson } from './ai'
import type { PlanResult, ReportResult, SoapResult, Vitals } from './types'
import { vitalsToText } from './types'

// 事実の扱いに関する規律。ただし「解釈・判断」と「事実の創作」は区別する。
const FACT_RULES = `
【事実の扱い（厳守）】
- メモに書かれていない「事実」（新たな症状・数値・出来事・実施していないケア・検査値・診断名）を作り出さない。
- ただし、与えられた事実にもとづく「臨床的な解釈・判断・推論」はむしろ積極的に行ってよい（これは創作ではない）。
- 利用者の氏名・住所など個人を特定する情報は出力に含めない。「利用者」と表記する。
- 訪問看護の記録・書類として自然で簡潔な文体（常体、「〜である」「〜した」調）で書く。
- 情報が少ない項目は無理に膨らませない。該当情報が全くない項目は「特記なし」とする。
- 医療専門職が読む文書として、一般的な看護記録の慣例に従う。`

// アセスメント／解釈欄の質を高めるための思考の枠組みと表現ルール。
const ASSESSMENT_GUIDE = `
【臨床判断（アセスメント・解釈）を書くための思考の枠組み】
この欄は観察情報の「言い換え」ではなく、看護師としての「判断」を示す部分である。次の観点で考えて記述する。
1. 統合・解釈: 主観情報と客観情報を結びつけ、それらが何を意味するかを解釈する。
2. 経過の評価: メモに前回・以前の状態が示されていれば、改善・悪化・不変を判断する。
3. 要因の推論: 得られた情報から論理的に考えられる原因・誘因・関連要因を挙げる（例: 浮腫と塩分摂取・心負荷、不眠と日中活動量や不安）。ただしメモの事実から飛躍しない。
4. リスク・予測: 今後起こりうる問題や悪化の可能性、注意すべき点を示す。
5. 看護上の問題の明確化: 何が看護介入を要する問題かを述べる。

【表現のルール】
- 断定できない解釈・推論には「〜が考えられる」「〜の可能性がある」「〜を示唆する」など、判断であることが分かる語尾を用いる。
- 単に客観情報を繰り返す記述にしない。必ず「その情報をどう判断したか」を書く。

【弱い例と良い例（下肢浮腫・不眠のケース）】
弱い例: 「下肢に浮腫がみられる。食欲は良好。夜眠れないとの訴えあり。」
良い例: 「下肢浮腫は前回より軽減しており、利尿薬の効果が現れていると考えられる。食欲は保たれ全身状態は概ね安定しているが、不眠の訴えが続いており、日中の活動量低下や心不全増悪への不安が関与している可能性がある。浮腫の再増悪や睡眠不足による日中の活動性低下に留意が必要である。」`

/** 前回訪問の記録（経過評価のためAIに渡す。氏名など個人を特定する情報は含めない）。 */
export interface PreviousSoap {
  visitDate: string
  o: string
  a: string
  vitalsText: string
}

export async function generateSoap(
  memo: string,
  vitals?: Vitals,
  previous?: PreviousSoap
): Promise<SoapResult> {
  const vitalsText = vitalsToText(vitals)
  const previousBlock = previous
    ? `\n\n【前回訪問の記録（${formatDateJa(previous.visitDate)}）】
※ 経過（改善・悪化・不変）を評価するための参考情報。今回のメモに書かれていない事実を新たに作り出す根拠にはしないこと。
- 前回バイタル: ${previous.vitalsText || '（記録なし）'}
- 前回O（客観的情報）: ${previous.o || '（記録なし）'}
- 前回A（アセスメント）: ${previous.a || '（記録なし）'}`
    : ''

  const prompt = `あなたは経験豊富な訪問看護師の記録作成を手伝うアシスタントです。
訪問中に音声入力で羅列されたメモを、SOAP形式の訪問看護記録に整形してください。
${FACT_RULES}

【SOAP各項目の書き方】
- S（主観的情報）: 利用者や家族の発言・訴え。メモ内の発言はできるだけ「」付きの発言として残す。
- O（客観的情報）: バイタルサイン、観察所見、実施したケアの事実。バイタルサインが提供されていれば必ずOの冒頭に含める。
- A（アセスメント）: 最重要項目。下記の枠組みに沿って看護師の臨床判断を記述する。前回記録がある場合は前回からの変化を必ず評価に含める。
- P（プラン）: Aの判断を受けた今後の看護計画・次回訪問での観察点・指導内容。
${ASSESSMENT_GUIDE}

【手順】
まず assessmentReasoning に、上記1〜5の観点で考えた内容を短い箇条書きで整理する（思考の下書き）。
そのうえで a には、その思考を踏まえた完成文のアセスメントを、看護記録として自然な文章で記述する。

【バイタルサイン】
${vitalsText || '（入力なし）'}${previousBlock}

【音声入力メモ】
${memo}`

  const r = await generateJson<SoapResult & { assessmentReasoning?: string }>(prompt, {
    type: 'OBJECT',
    properties: {
      s: { type: 'STRING', description: 'S: 主観的情報' },
      o: { type: 'STRING', description: 'O: 客観的情報' },
      assessmentReasoning: {
        type: 'STRING',
        description: 'アセスメントの思考の下書き。統合・解釈／経過／要因／リスク／看護問題の観点で箇条書きに整理する（内部用のメモ）。'
      },
      a: { type: 'STRING', description: 'A: アセスメント（assessmentReasoningを踏まえた完成文）' },
      p: { type: 'STRING', description: 'P: プラン' }
    },
    required: ['s', 'o', 'assessmentReasoning', 'a', 'p'],
    propertyOrdering: ['s', 'o', 'assessmentReasoning', 'a', 'p']
  })
  return { s: r.s, o: r.o, a: r.a, p: r.p }
}

export async function generatePlan(memo: string): Promise<PlanResult> {
  const prompt = `あなたは経験豊富な訪問看護師の書類作成を手伝うアシスタントです。
音声入力で羅列されたメモを、訪問看護計画書（標準様式）の各欄の文章に整形してください。
${FACT_RULES}

【各欄の書き方】
- goal（看護・リハビリテーションの目標）: 利用者・家族の意向をふまえた療養目標。1〜3文程度。
- issues（療養上の課題・支援内容）: 問題点とそれに対する看護・支援の内容。問題点ごとに「・」の箇条書きで整理してよい。
- evaluation（評価）: 現在の状態・経過に対する評価。メモに評価に関する情報がなければ「特記なし」とする。

【音声入力メモ】
${memo}`

  return generateJson<PlanResult>(prompt, {
    type: 'OBJECT',
    properties: {
      goal: { type: 'STRING', description: '看護・リハビリテーションの目標' },
      issues: { type: 'STRING', description: '療養上の課題・支援内容（問題点・解決策）' },
      evaluation: { type: 'STRING', description: '評価' }
    },
    required: ['goal', 'issues', 'evaluation']
  })
}

export async function generateReport(memo: string): Promise<ReportResult> {
  const prompt = `あなたは経験豊富な訪問看護師の書類作成を手伝うアシスタントです。
音声入力で羅列されたメモを、主治医へ提出する訪問看護報告書（標準様式・別紙様式2）の各欄の文章に整形してください。
報告書は通常1か月間の訪問をまとめたものです。
${FACT_RULES}

【各欄の書き方】
- progress（病状の経過）: 最重要項目。単なる出来事の羅列ではなく、対象期間の病状・症状・バイタルの推移を「解釈」し、改善・悪化・安定などの傾向とその評価が主治医に伝わるように記述する。下記の枠組みに沿って臨床判断を示す。
- careContent（看護・リハビリテーションの内容）: 実施した看護・リハビリテーション・処置・指導の内容（事実）。
- homeCare（家庭での介護の状況）: 家族の介護状況、介護負担、家庭環境。メモに情報がなければ「特記なし」とする。
- notes（特記すべき事項）: 主治医に伝えるべき臨床的な判断・今後の方針・連携が必要な内容。メモに情報がなければ「特記なし」とする。
${ASSESSMENT_GUIDE}

【手順】
まず clinicalReasoning に、上記1〜5の観点で病状の経過に関する解釈を短い箇条書きで整理する（思考の下書き）。
そのうえで progress には、その思考を踏まえた完成文の「病状の経過」を記述する。

【音声入力メモ】
${memo}`

  const r = await generateJson<ReportResult & { clinicalReasoning?: string }>(prompt, {
    type: 'OBJECT',
    properties: {
      clinicalReasoning: {
        type: 'STRING',
        description: '病状の経過に関する思考の下書き。統合・解釈／経過／要因／リスク／問題の観点で箇条書きに整理する（内部用のメモ）。'
      },
      progress: { type: 'STRING', description: '病状の経過（clinicalReasoningを踏まえた完成文）' },
      careContent: { type: 'STRING', description: '看護・リハビリテーションの内容' },
      homeCare: { type: 'STRING', description: '家庭での介護の状況' },
      notes: { type: 'STRING', description: '特記すべき事項' }
    },
    required: ['clinicalReasoning', 'progress', 'careContent', 'homeCare', 'notes'],
    propertyOrdering: ['clinicalReasoning', 'progress', 'careContent', 'homeCare', 'notes']
  })
  return { progress: r.progress, careContent: r.careContent, homeCare: r.homeCare, notes: r.notes }
}
