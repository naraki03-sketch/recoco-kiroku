# だれでも使えるSOAP記録 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 50〜60代の職員が自分のスマホで、話すだけでSOAPを作り、カイポケの経過記録欄へ1回で貼れるようにする。

**Architecture:** 既存のサーバーなしPWA（Vite + React + Dexie）をそのまま改修する。文章の整形・コピー文の組み立て・バイタルの正規化・設定コードは `src/lib/` の純粋関数に切り出してテストし、画面（`src/pages/`）はそれを呼ぶだけにする。APIキーは管理者がQRコード（設定コード）にして配り、職員はアプリ内カメラで読む。

**Tech Stack:** Vite 7 / React 19 / TypeScript / Dexie / vitest + @testing-library/react / 追加: `qrcode`（QR生成）、`jsqr`（QR読み取り）

**Spec:** `SOAP_KANTAN_DESIGN.md`（このファイルと同じフォルダ）。実装者は両方を読むこと。

## Global Constraints

- **コミット・push・デプロイ（`npm run deploy`）をしない。** 各フェーズの最後で止まり、変更ファイルの一覧とテスト結果を報告する。コミットは依頼者の承認後に計画担当が行う。
- 既存ファイルの削除・リネームをしない。`node_modules/`、`dist/`、`.claude/`、`qa-output/`、`recocoを開く.command` に触れない。
- 利用者の個人情報をコード・テスト・コメントに入れない。テストの利用者名は `QA利用者` のような架空名だけを使う。
- APIキーをコード・テスト・ログ・コミットに書かない。テストでは `test-key` を使う。
- 「言っていないことは書かない」方針を緩めない。`prompts.ts` の FACT_RULES の禁止事項（診断名・薬効・原因・心理の追加禁止など）は文言を保つ。
- 計画書（plan）・報告書（report）の生成内容と欄構成は変えない。
- 職員が通常の操作で見る画面（ホーム・入力・結果・初期設定）に、APIキー・モデル名・提供元名を表示しない。
- 画面の文言は日本語。カタカナ語・専門語を避け、短い話し言葉にする（例: 「再生成」ではなく「作り直す」）。
- 文字の大きさの下限: 本文17px、補足15px、主ボタン20px・高さ60px以上、入力欄18px。
- 追加してよい依存は `qrcode`、`jsqr`、`@types/qrcode` の3つだけ。
- 各タスクの完了条件に `npm test` 全件成功を含む。フェーズの最後は `npm run build` も成功させる。

## Review Focus

設計書が直接は書いていないが、使う人が踏みやすい条件。各行のテストは、所有するタスクに入れてある。

1. **古い記録や別モデルの出力に「未確認（…）」が残っている** → コピー前に警告が出る（Task 1・2）。
2. **声で言ったバイタルが「36度5分」「１２８」など数値以外の形で返る** → 半角数値に直すか、直せなければ空にする。誤った数値を保存しない（Task 6）。
3. **手で入れたバイタルと声のバイタルが食い違う** → 手入力を優先する（Task 6）。
4. **S・O・A・Pが全部空で返る（メモが短すぎる・無関係）** → 「全部コピー」を押せなくし、足りない点を表示する（Task 8）。
5. **別のQRコードや壊れたコードを読んだ／カメラが許可されない** → 分かる言葉でエラーを出し、設定は変えない。貼り付けでの設定に誘導する（Task 9・10）。

---

# フェーズ1: 画面の簡素化とコピー

### Task 1: コピー文の組み立て（`soapText.ts`）

**Files:**
- Create: `src/lib/soapText.ts`
- Test: `src/lib/soapText.test.ts`

**Interfaces:**
- Consumes: `SoapResult`（`src/lib/types.ts`）
- Produces:
  - `formatSoapForCopy(soap: SoapResult): string`
  - `findPlaceholders(soap: SoapResult): string[]` — 戻り値は `'S' | 'O' | 'A' | 'P'` の配列
  - `isSoapEmpty(soap: SoapResult): boolean`

- [ ] **Step 1: 失敗するテストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { findPlaceholders, formatSoapForCopy, isSoapEmpty } from './soapText'

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
    expect(findPlaceholders({
      s: '未確認（主観情報の入力なし）', o: '所見', a: '入力情報のみでは評価困難', p: '要確認（計画の入力なし）'
    })).toEqual(['S', 'A', 'P'])
    expect(findPlaceholders(soap)).toEqual([])
  })
  it('4欄すべて空白ならisSoapEmptyはtrue', () => {
    expect(isSoapEmpty({ s: '', o: ' ', a: '', p: '' })).toBe(true)
    expect(isSoapEmpty(soap)).toBe(false)
  })
})
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/lib/soapText.test.ts` / Expected: FAIL（モジュールなし）
- [ ] **Step 3: `src/lib/soapText.ts` に3関数を実装**（判定の正規表現は `/未確認（|要確認（|評価困難/`）
- [ ] **Step 4: 成功を確認** — Run: `npx vitest run src/lib/soapText.test.ts` / Expected: PASS

### Task 2: 結果画面（全部コピーを主役に・確認して保存）

**Files:**
- Modify: `src/pages/Result.tsx`
- Modify: `src/pages/Result.test.tsx`
- Modify: `src/styles.css`（`.review-check` は使わなくなるが定義は消さない）

**Interfaces:**
- Consumes: `formatSoapForCopy`、`findPlaceholders`（Task 1）
- Produces: なし（画面のみ）

**決めごと（文言はこのとおり）:**
- SOAPのとき、主ボタンの表記は `全部コピー（カイポケに貼る）`。コピーする文は `formatSoapForCopy(record.soap)`。成功時のトーストは `全部コピーしました。カイポケの経過記録に貼ってください`。
- 計画書・報告書の「全文をコピー」は表記も中身も現状のまま。
- 主ボタンは S の欄より上（`review-guidance` の直後）にも1つ置き、欄の下にも同じものを置く。
- `findPlaceholders` が1件以上なら、主ボタンの上に `role="status"` で次を表示: `「未確認」などの文が ${labels.join('・')} に残っています。貼る前に消すか書き直してください。`
- 照合チェック欄（`review-check`）と `reviewed` 状態を削除する。保存ボタンは `確認して保存`（`saving || loading` のときだけ無効）。押すと `window.confirm` を出す:
  - 警告なし: `元のメモと見比べましたか？\n話していない内容が入っていなければ「OK」を押してください。`
  - 警告あり（`hasReviewWarning`）: 先頭に `確認が必要な言葉があります。直しましたか？\n` を付ける。
  - キャンセルなら保存しない。
- 「AIで作り直す（再生成）」→ `作り直す`。「AI作成を中止」→ `作成をやめる`。`review-guidance` の文は `AIが作った下書きです。元のメモと見比べて、違うところは直してください。`

- [ ] **Step 1: テストを書き換える**（既存2件を次に置き換え、3件追加）

```ts
it('警告があるときは保存の確認文に「確認が必要な言葉」を含める', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<Result record={{ ...record, soap: { ...record.soap!, reviewWarning: '要確認：入力語句「下痢の不足」の意味を確認してください。' } }} onBack={vi.fn()} onSaved={vi.fn()} />)
  expect(screen.getByRole('alert')).toHaveTextContent('下痢の不足')
  fireEvent.click(screen.getByRole('button', { name: '確認して保存' }))
  expect(confirm.mock.calls[0][0]).toContain('確認が必要な言葉があります')
  expect(mocks.add).not.toHaveBeenCalled()
})

it('確認でOKを押したときだけ保存し、未保存結果と元下書きを削除する', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<Result record={record} onBack={vi.fn()} onSaved={vi.fn()} />)
  expect(screen.queryByRole('checkbox')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '確認して保存' }))
  await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(1))
  expect(mocks.clearPendingRecord).toHaveBeenCalledTimes(1)
  expect(mocks.clearDraft).toHaveBeenCalledWith('soap', '1')
})

it('全部コピーはS：O：A：P：の1つの文をクリップボードへ入れる', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  render(<Result record={record} onBack={vi.fn()} onSaved={vi.fn()} />)
  fireEvent.click(screen.getAllByRole('button', { name: '全部コピー（カイポケに貼る）' })[0])
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('S：発言\nO：所見\nA：評価\nP：計画'))
})

it('「未確認」が残る欄があれば貼る前の注意を出す', () => {
  render(<Result record={{ ...record, soap: { ...record.soap!, p: '要確認（計画の入力なし）' } }} onBack={vi.fn()} onSaved={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('P に残っています')
})

it('計画書では従来の「全文をコピー」を使う', () => {
  render(<Result record={{ ...record, type: 'plan', soap: undefined, plan: { goal: 'G', issues: 'I', evaluation: 'E' } }} onBack={vi.fn()} onSaved={vi.fn()} />)
  expect(screen.getByRole('button', { name: '全文をコピー（カイポケ貼り付け用）' })).toBeInTheDocument()
})
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/pages/Result.test.tsx` / Expected: FAIL
- [ ] **Step 3: `Result.tsx` を上の決めごとどおりに改修**
- [ ] **Step 4: 成功を確認** — Run: `npx vitest run src/pages/Result.test.tsx` / Expected: PASS

### Task 3: 入力画面（名前ボタン・説明を畳む）

**Files:**
- Modify: `src/pages/InputForm.tsx`
- Modify: `src/pages/InputForm.test.tsx`
- Modify: `src/styles.css`（`.patient-buttons`、`.patient-button`、`.patient-button[aria-pressed="true"]`、`.draft-mark` を追加）

**Interfaces:**
- Consumes / Produces: なし（Props は変えない）

**決めごと:**
- 利用者の `<select>` をやめ、`role="group"` `aria-label="だれの記録ですか？"` の中に利用者ごとの `<button type="button" aria-pressed>` を並べる（2列グリッド、高さ56px以上、名前は折り返し可）。押すと既存の `changePatient(id)` を呼ぶ。選択中をもう一度押しても何もしない。
- 下書きがある利用者のボタンには `<span class="draft-mark">書きかけ</span>` を付ける。
- 最後に `＋ 新しい利用者` ボタン（既存の追加フォームを開く）。
- 見出しは `だれの記録ですか？`。未選択で生成しようとしたときのエラーは `だれの記録か、名前を押して選んでください。`。フォーカスはグループの最初のボタンへ。
- 「入力する内容」の説明ブロック全体を `<details className="input-guide"><summary>書き方の例を見る</summary>…</details>` にする（初期状態は閉じる）。中身の文言は変えない。
- メモ欄の見出しは3種とも `話した内容（マイク🎤で入力）`。`rows={7}`。プレースホルダーは現状のまま。
- 主ボタン `AIで文章にする` → `文章にする`。作成中 `文章を作っています…`。中止 `作成をやめる`。
- 「前回の記録を参考に…」のチェックは文言を `前回（${日付}）とくらべて書く` に短くする。

- [ ] **Step 1: テストを書き換える**

既存の `it.each`（常時表示）を「畳まれた説明の中に指針と例文がある」に変える:

```ts
const details = screen.getByText('書き方の例を見る').closest('details')!
expect(details).not.toHaveAttribute('open')
expect(details).toHaveTextContent(guidance)
expect(details).toHaveTextContent(example)
```

既存の生成テストの操作部分を次に変える:

```ts
fireEvent.click(await screen.findByRole('button', { name: 'QA利用者' }))
expect(screen.getByRole('button', { name: 'QA利用者' })).toHaveAttribute('aria-pressed', 'true')
fireEvent.change(screen.getByPlaceholderText(/本人から夜眠れない/), { target: { value: '本人「よく眠れた」' } })
fireEvent.click(screen.getByRole('button', { name: '文章にする' }))
```

追加:

```ts
it('利用者を選ばずに押すと、名前を選ぶよう伝えて生成しない', async () => {
  render(<InputForm type="soap" onBack={vi.fn()} onGenerated={vi.fn()} goSettings={vi.fn()} />)
  await screen.findByRole('button', { name: 'QA利用者' })
  fireEvent.click(screen.getByRole('button', { name: '文章にする' }))
  expect(screen.getByRole('alert')).toHaveTextContent('名前を押して選んでください')
  expect(mocks.generateSoap).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/pages/InputForm.test.tsx` / Expected: FAIL
- [ ] **Step 3: `InputForm.tsx` と `styles.css` を改修**
- [ ] **Step 4: 成功を確認** — Run: `npx vitest run src/pages/InputForm.test.tsx` / Expected: PASS

### Task 4: ホームと文字の大きさ

**Files:**
- Modify: `src/pages/Home.tsx`
- Modify: `src/styles.css`
- Create: `src/pages/Home.test.tsx`

**決めごと:**
- 上から順に: 大ボタン `記録を書く`（補足 `話した内容をSOAPにします`、`go({name:'form',type:'soap'})`）／小ボタン2つ横並び `計画書` `報告書`／ボタン `これまでの記録`（履歴）／一番下に小さく `設定`。
- `home-hero` の文は `話すだけで記録の下書きができます`。
- キー未設定の案内は現状の文言のまま残す（フェーズ3で差し替える）。
- `styles.css`: Global Constraints の文字サイズ下限に合わせて `.btn`、`.big-action .title`（24px）、`.big-action`（高さ96px以上）、`input/textarea/select`、`.hint`、`.label`、`.notice`、`.error-box`、`.auto-grow-textarea`、`.btn-small`（15px・高さ44px以上）を引き上げる。色・角丸など他の見た目は変えない。

- [ ] **Step 1: テストを書く**

```ts
vi.mock('../lib/settings', () => ({ getActiveApiKey: () => 'test-key' }))

it('「記録を書く」でSOAPの入力画面へ進む', () => {
  const go = vi.fn()
  render(<Home go={go} />)
  fireEvent.click(screen.getByRole('button', { name: /記録を書く/ }))
  expect(go).toHaveBeenCalledWith({ name: 'form', type: 'soap' })
})
it('計画書・報告書・これまでの記録・設定へ進める', () => {
  const go = vi.fn()
  render(<Home go={go} />)
  fireEvent.click(screen.getByRole('button', { name: '計画書' }))
  fireEvent.click(screen.getByRole('button', { name: '報告書' }))
  fireEvent.click(screen.getByRole('button', { name: 'これまでの記録' }))
  fireEvent.click(screen.getByRole('button', { name: '設定' }))
  expect(go.mock.calls.map((c) => c[0])).toEqual([
    { name: 'form', type: 'plan' }, { name: 'form', type: 'report' }, { name: 'history' }, { name: 'settings' }
  ])
})
it('APIキーやモデル名を表示しない', () => {
  render(<Home go={vi.fn()} />)
  expect(document.body.textContent).not.toMatch(/API|Gemini|モデル/)
})
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/pages/Home.test.tsx` / Expected: FAIL
- [ ] **Step 3: `Home.tsx` と `styles.css` を改修**
- [ ] **Step 4: フェーズ1の確認** — Run: `npm test && npm run build` / Expected: 全件PASS・ビルド成功
- [ ] **Step 5: 止まって報告** — 変更ファイル一覧とテスト結果を報告する。コミットしない。

---

# フェーズ2: 文章の質

### Task 5: 空欄を許す検証と、分かる言葉のエラー

**Files:**
- Modify: `src/lib/aiValidation.ts`、`src/lib/aiValidation.test.ts`
- Modify: `src/lib/ai.ts`、`src/lib/ai.test.ts`

**Interfaces:**
- Produces:
  - `validateGeneratedJson<T>(value: unknown, schema: JsonSchema, allowEmpty: string[] = []): T` — `allowEmpty` にあるキーは空文字でもエラーにしない（欠落・文字列以外は従来どおりエラー）
  - `generateJson<T>(prompt: string, schema: JsonSchema, control: RequestControl = {}, allowEmpty: string[] = []): Promise<T>` — 3つの呼び出し経路すべてで `allowEmpty` を検証へ渡す。`JsonSchema` 型には何も足さない（Geminiへそのまま送るため）。

**エラー文言（`errorForStatus`）:**
- 429: `今AIが混み合っています。1分ほど待ってから、もう一度押してください。話した内容は消えていません。`
- 400: `設定に問題があります。管理者に知らせてください。（${providerLabel}のモデルまたはキー）`
- 401・403: `設定に問題があります。管理者に知らせてください。（${providerLabel}のキー）`
- 404: `設定に問題があります。管理者に知らせてください。（AIモデルが見つかりません）`
- `requireKey` の文: `まだ使う準備ができていません。管理者に設定してもらってください。`

- [ ] **Step 1: テストを追加**

```ts
// aiValidation.test.ts
it('allowEmptyに指定した項目は空文字を許す', () => {
  const value = { s: '', o: '所見', a: '', p: '計画' }
  expect(validateGeneratedJson(value, soapSchema, ['s', 'a'])).toEqual(value)
})
it('allowEmptyに無い項目の空文字は従来どおり拒否する', () => {
  expect(() => validateGeneratedJson({ s: '', o: ' ', a: '評価', p: '計画' }, soapSchema, ['s']))
    .toThrow('AIの回答に空の項目があります')
})
it('allowEmptyでも欠落は拒否する', () => {
  expect(() => validateGeneratedJson({ o: '所見', a: '評価', p: '計画' }, soapSchema, ['s']))
    .toThrow('AIの回答に必要な項目がありません')
})
```

`ai.test.ts` には、既存のfetchモックの書き方に合わせて「429のとき `混み合っています` を含むエラー」「401のとき `管理者に知らせてください` を含むエラー」「`allowEmpty` を渡すと空欄を含む応答が通る」の3件を足す。既存テストが旧文言を見ていれば新文言に直す。

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/lib/aiValidation.test.ts src/lib/ai.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: 成功を確認** — 同コマンド / Expected: PASS
- [ ] **Step 5: 文言の波及を直す** — `InputForm.tsx` の `error.includes('APIキー')` による「設定画面を開く」ボタンは削除する（職員に設定画面を案内しない）。`goSettings` の Props は残してよい。Run: `npm test` / Expected: PASS

### Task 6: 声のバイタルの正規化と、足りない点の読み取り

**Files:**
- Create: `src/lib/vitals.ts`、`src/lib/vitals.test.ts`
- Modify: `src/lib/types.ts`（`SoapResult` に `missing?: string` を追加。コメント: `話されていない欄の案内。改行区切り。なければ「なし」。貼り付け文には入れない。`）
- Modify: `src/lib/soapText.ts`、`src/lib/soapText.test.ts`

**Interfaces:**
- Produces:
  - `normalizeSpokenVitals(raw: Partial<Record<keyof Vitals, string>>): Vitals` — 各値を半角数値の文字列にする。全角数字→半角、前後の空白・単位（℃、度、mmHg、回、%、％、/分）を除く。`36度5分` → `36.5`。結果が `/^\d+(\.\d+)?$/` に合わなければ `''`。さらに `validateVitals` の範囲外になる項目は `''` にする（血圧は片方が空になったら両方 `''`）。
  - `mergeVitals(typed: Vitals | undefined, spoken: Vitals): Vitals` — 項目ごとに、手入力が空でなければ手入力、空なら声の値。血圧は上下を1組として扱う（手入力に上下どちらかがあれば、上下とも手入力を使う）。
  - `parseMissing(missing: string | undefined): string[]`（`soapText.ts`）— 改行で分け、空行と `なし` で始まる行を除く。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// vitals.test.ts
const empty = { temp: '', bpHigh: '', bpLow: '', pulse: '', spo2: '', resp: '' }

it('単位や全角数字を除いて半角数値にする', () => {
  expect(normalizeSpokenVitals({ temp: '36度5分', bpHigh: '１２８', bpLow: '76mmHg', pulse: '72回', spo2: '98％', resp: '' }))
    .toEqual({ temp: '36.5', bpHigh: '128', bpLow: '76', pulse: '72', spo2: '98', resp: '' })
})
it('数値にできない値と範囲外の値は空にする', () => {
  expect(normalizeSpokenVitals({ temp: '平熱', pulse: '900', spo2: '98' }))
    .toEqual({ ...empty, spo2: '98' })
})
it('血圧の片方が使えなければ両方空にする', () => {
  expect(normalizeSpokenVitals({ bpHigh: '128', bpLow: '不明' })).toEqual(empty)
})
it('手入力を優先し、空の項目だけ声の値で埋める', () => {
  expect(mergeVitals({ ...empty, temp: '37.0' }, { ...empty, temp: '36.5', pulse: '72' }))
    .toEqual({ ...empty, temp: '37.0', pulse: '72' })
})
it('血圧は手入力があれば上下とも手入力を使う', () => {
  expect(mergeVitals({ ...empty, bpHigh: '130', bpLow: '80' }, { ...empty, bpHigh: '128', bpLow: '76' }))
    .toMatchObject({ bpHigh: '130', bpLow: '80' })
})
it('手入力がundefinedなら声の値をそのまま使う', () => {
  expect(mergeVitals(undefined, { ...empty, spo2: '97' })).toEqual({ ...empty, spo2: '97' })
})

// soapText.test.ts
it('parseMissingは改行で分け、空行と「なし」を除く', () => {
  expect(parseMissing('Pの内容が話されていません\n\nなし')).toEqual(['Pの内容が話されていません'])
  expect(parseMissing('なし。')).toEqual([])
  expect(parseMissing(undefined)).toEqual([])
})
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/lib/vitals.test.ts src/lib/soapText.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: 成功を確認** — 同コマンド / Expected: PASS

### Task 7: SOAPの指示文（未確認を文章の外へ・声のバイタルを拾う）

**Files:**
- Modify: `src/lib/prompts.ts`、`src/lib/prompts.test.ts`
- Modify: `src/pages/InputForm.tsx`、`src/pages/Result.tsx`（戻り値の形が変わる分の最小限の追随だけ）
- Modify: `src/pages/InputForm.test.tsx`、`src/pages/Result.test.tsx`（モックの戻り値の形）

**Interfaces:**
- Consumes: `generateJson(…, allowEmpty)`（Task 5）、`normalizeSpokenVitals`・`mergeVitals`（Task 6）
- Produces:
  - `export interface SoapGeneration { soap: SoapResult; vitals: Vitals }`（`prompts.ts`）
  - `generateSoap(memo, vitals?, previous?, control?): Promise<SoapGeneration>` — `vitals` は `mergeVitals(手入力, normalizeSpokenVitals(AIが拾った値))`。`soap` には `s,o,a,p,reviewWarning,missing` だけを入れ、`v*` のキーは入れない。

**指示文の決めごと:**
- FACT_RULES の4行目（`不明な項目を…「未確認（入力情報なし）」と書く。`）を2つに分ける。前半 `不明な項目を「異常なし」「問題なし」「安定」「特記なし」と断定しない。` は FACT_RULES に残す。後半は定数にして使い分ける:
  - `UNKNOWN_AS_TEXT = '情報が必要な欄には「未確認（入力情報なし）」と書く。'` — 計画書・報告書の指示文に足す（出力は現状と同じ）。
  - `UNKNOWN_AS_MISSING` — SOAP用。内容: 情報がない欄は空文字にする。「未確認」「要確認」「評価困難」などの断り書きをS・O・A・Pの文章に書かない。代わりに `missing` に、足りない欄ごとに1行ずつ、職員に分かる短い文で書く（例: `Pが話されていません。次回みること・続けることを一言足してください。`）。足りない欄がなければ `missing` は `なし`。
- FACT_RULES の5行目（`…「入力情報のみでは評価困難」とする。`）も同様に、SOAPでは「Aを空文字にして `missing` に書く」へ差し替える。計画書・報告書では現状の文を保つ。
- 【SOAPの分類】のS・O・A・P各行から「なければ『未確認（…）』」「『要確認（計画の入力なし）』」「『入力情報のみでは評価困難』」を除き、「なければ空文字」とする。それ以外の文は保つ。
- 【音声入力・不明語の確認】: 誤変換が疑われる語句は、推測で訂正せず、その語句を含む内容をSOAPの欄に書かない。`reviewWarning` に `要確認：入力語句「原文」の意味を確認してください。` と書く（この文は現状のまま）。
- 追加する【声で言ったバイタル】: メモの中に体温・血圧・脈拍・SpO2・呼吸数の数値があれば、`vTemp, vBpHigh, vBpLow, vPulse, vSpo2, vResp` に半角数字だけで入れる（体温は `36.5` の形）。言っていない項目は空文字。数値を推測しない。メモの数値はO欄にも書く。
- スキーマ: `properties` に `missing` と `v*` 6項目（すべて `STRING`）を足し、`required` と `propertyOrdering` は `['s','o','a','p','reviewWarning','missing','vTemp','vBpHigh','vBpLow','vPulse','vSpo2','vResp']`。
- `generateJson` へ渡す `allowEmpty` は `['s','o','a','p','vTemp','vBpHigh','vBpLow','vPulse','vSpo2','vResp']`。

- [ ] **Step 1: テストを書き換える・追加する**（`prompts.test.ts`）

既存1件目の `expect(prompt).toContain('未確認')` を削除し、`schema.required` の期待値を上の12項目に直す。追加:

```ts
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
})
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/lib/prompts.test.ts` / Expected: FAIL
- [ ] **Step 3: `prompts.ts` を改修**
- [ ] **Step 4: 呼び出し側の追随** — `InputForm.tsx` と `Result.tsx` で `const { soap, vitals: merged } = await generateSoap(…)` とし、記録の `vitals` に `merged` を入れる。画面のテストのモック戻り値を `{ soap: {…}, vitals: {…} }` に直す。
- [ ] **Step 5: 成功を確認** — Run: `npm test && npx tsc -b` / Expected: PASS・型エラーなし

### Task 8: 足りない点の表示・話し足す・拾った数値の表示

**Files:**
- Modify: `src/pages/Result.tsx`、`src/pages/Result.test.tsx`
- Modify: `src/pages/InputForm.tsx`、`src/pages/InputForm.test.tsx`
- Modify: `src/styles.css`（`.missing-box`、`.vitals-line` を追加）

**Interfaces:**
- Consumes: `parseMissing`、`isSoapEmpty`（Task 1・6）、`SoapGeneration`（Task 7）、`validateVitals`、`vitalsToText`

**結果画面の決めごと（SOAPのみ）:**
- `parseMissing(record.soap.missing)` が1件以上なら、主ボタンより上に `<section className="missing-box" aria-label="足りないところ">` を出す。見出し `足りないところ`、各行を箇条書き、その下に `<textarea aria-label="話し足す内容" rows={3} placeholder="ここをタップして、マイク🎤で足りない分を話してください">` とボタン `話し足して作り直す`。
- ボタンを押すと: 入力が空なら何もしない。空でなければ `memo = memo.trimEnd() + '\n' + 追記` にして作り直す（既存の作り直し処理を使う）。直前の生成のあとに欄を手で直していた場合だけ、先に `window.confirm('手で直した文章は消えます。作り直しますか？')` を出す。直していなければ確認なしで作り直す。成功したら入力欄を空にする。
- 欄の手直しを覚える `edited` 状態を足す（`updateField` で true、生成成功で false）。「作り直す」ボタンの確認も、`edited` が true のときだけ出すように変える。
- `isSoapEmpty(record.soap)` のとき、`全部コピー` を `disabled` にする。
- `vitalsToText(record.vitals)` が空でなければ、S欄の上に `<p className="vitals-line">数値：${text}</p>` を出す。`validateVitals(record.vitals)` にエラーがあれば、その下に `role="status"` で `数値を確かめてください：${errors.join(' ')}` を出す。
- 保存の確認文: 足りないところが残っているときは、先頭に `足りないところが残っています。このまま保存しますか？\n` を付ける（警告ありの文より前）。

**入力画面の決めごと（SOAPのみ）:**
- バイタルのカードを `<details className="card vitals-details">` にし、`<summary>数値を手で入れる（声で言えば不要）</summary>` を付ける。いずれかの項目に値があるとき（下書きの復元を含む）は `open` にする。
- メモ欄の下の補足を `体温や血圧も、そのまま話せば入ります。氏名・住所は話さないでください。` にする（SOAPのみ。計画書・報告書は `氏名・住所は話さないでください。` だけ）。

- [ ] **Step 1: テストを追加**

```ts
// Result.test.tsx（generateSoapのモックを mocks に載せて制御できるようにする）
const withMissing = { ...record, soap: { ...record.soap!, p: '', missing: 'Pが話されていません。次回みること・続けることを一言足してください。' } }

it('足りないところを文章の外に出し、コピー文には入れない', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.assign(navigator, { clipboard: { writeText } })
  render(<Result record={withMissing} onBack={vi.fn()} onSaved={vi.fn()} />)
  expect(screen.getByRole('region', { name: '足りないところ' })).toHaveTextContent('Pが話されていません')
  fireEvent.click(screen.getAllByRole('button', { name: '全部コピー（カイポケに貼る）' })[0])
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('S：発言\nO：所見\nA：評価\nP：'))
})

it('話し足すとメモに追記して作り直し、確認は出さない', async () => {
  const confirm = vi.spyOn(window, 'confirm')
  mocks.generateSoap.mockResolvedValue({ soap: { s: '発言', o: '所見', a: '評価', p: '浮腫の観察を継続', missing: 'なし' }, vitals: emptyVitals })
  render(<Result record={withMissing} onBack={vi.fn()} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('話し足す内容'), { target: { value: '次回も浮腫を観察' } })
  fireEvent.click(screen.getByRole('button', { name: '話し足して作り直す' }))
  await waitFor(() => expect(mocks.generateSoap).toHaveBeenCalledTimes(1))
  expect(mocks.generateSoap.mock.calls[0][0]).toBe('本人「よく眠れた」\n次回も浮腫を観察')
  expect(confirm).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.queryByRole('region', { name: '足りないところ' })).toBeNull())
})

it('手で直したあとに話し足すと、消えることを確認する', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  render(<Result record={withMissing} onBack={vi.fn()} onSaved={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('S（主観的情報）の生成結果'), { target: { value: '直した' } })
  fireEvent.change(screen.getByLabelText('話し足す内容'), { target: { value: '次回も浮腫を観察' } })
  fireEvent.click(screen.getByRole('button', { name: '話し足して作り直す' }))
  expect(confirm).toHaveBeenCalledWith('手で直した文章は消えます。作り直しますか？')
  expect(mocks.generateSoap).not.toHaveBeenCalled()
})

it('4欄とも空なら全部コピーを押せない', () => {
  render(<Result record={{ ...record, soap: { s: '', o: '', a: '', p: '', missing: '内容が聞き取れませんでした。' } }} onBack={vi.fn()} onSaved={vi.fn()} />)
  screen.getAllByRole('button', { name: '全部コピー（カイポケに貼る）' }).forEach((b) => expect(b).toBeDisabled())
})

it('拾った数値を表示し、あり得ない値は確かめるよう伝える', () => {
  render(<Result record={{ ...record, vitals: { temp: '36.5', bpHigh: '128', bpLow: '', pulse: '', spo2: '', resp: '' } }} onBack={vi.fn()} onSaved={vi.fn()} />)
  expect(screen.getByText(/数値：体温36.5℃/)).toBeInTheDocument()
  expect(screen.getByText(/数値を確かめてください/)).toHaveTextContent('血圧は収縮期と拡張期を両方')
})

// InputForm.test.tsx
it('数値の手入力欄は畳んであり、声で入ることを案内する', async () => {
  render(<InputForm type="soap" onBack={vi.fn()} onGenerated={vi.fn()} goSettings={vi.fn()} />)
  expect(screen.getByText('数値を手で入れる（声で言えば不要）').closest('details')).not.toHaveAttribute('open')
  expect(screen.getByText(/体温や血圧も、そのまま話せば入ります/)).toBeInTheDocument()
})
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/pages` / Expected: FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: フェーズ2の確認** — Run: `npm test && npm run build` / Expected: 全件PASS・ビルド成功
- [ ] **Step 5: `src/lib/backup.ts` と `src/lib/pending.ts` を読み、`soap.missing` が付いた記録と `s/o/a/p` が空文字の記録を、書き出し・取り込み・未保存の復元で落とさないことを確かめる。** 落とす検査があれば直し、該当テストファイルに1件足す。
- [ ] **Step 6: 止まって報告** — コミットしない。

---

# フェーズ3: QRで初期設定

### Task 9: 設定コード（`setupCode.ts`）

**Files:**
- Create: `src/lib/setupCode.ts`、`src/lib/setupCode.test.ts`
- Modify: `src/lib/settings.ts`（`isKnownModel(model: string): boolean` を追加で公開）

**Interfaces:**
- Produces:
  - `interface SetupPayload { provider: Provider; model: string; apiKey: string }`
  - `encodeSetupCode(p: SetupPayload): string` — `'recoco1:' + base64url(JSON.stringify({ v: 1, p: provider, m: model, k: apiKey }))`（UTF-8）
  - `decodeSetupCode(text: string): SetupPayload` — 前後の空白を除いて読む。次のどれかなら `SetupCodeError` を投げる: 接頭辞が違う／base64やJSONが壊れている／`v !== 1`／`p` が `PROVIDERS` に無い／`m`・`k` が空文字／`getProvider(m) !== p`。メッセージは `このコードは使えません。管理者からもらったQRコードをもう一度読んでください。`
  - `currentSetupPayload(): SetupPayload | null` — 今の端末の設定（`getEffectiveModel()`、その提供元、そのキー）。キーが空なら `null`。
  - `applySetupCode(p: SetupPayload): void` — `setApiKey(p.provider, p.apiKey)`。`isKnownModel(p.model)` なら `setModel(p.model)` と `setCustomModelId('')`、そうでなければ `setCustomModelId(p.model)`。

- [ ] **Step 1: 失敗するテストを書く**

```ts
const payload = { provider: 'google' as const, model: 'gemini-3.6-flash', apiKey: 'test-key' }

it('作ったコードを読み戻せる', () => {
  const code = encodeSetupCode(payload)
  expect(code.startsWith('recoco1:')).toBe(true)
  expect(code).not.toContain('test-key')          // キーを平文で見せない
  expect(decodeSetupCode(`  ${code}\n`)).toEqual(payload)
})
it.each([
  ['https://example.com/'], ['recoco1:%%%'], ['recoco1:' + btoa('{"v":2}')], ['']
])('別のQRや壊れたコード %s は分かる言葉で断る', (text) => {
  expect(() => decodeSetupCode(text)).toThrow('このコードは使えません')
})
it('提供元とモデルが合わないコードを断る', () => {
  const bad = encodeSetupCode({ ...payload, model: 'claude-sonnet-5' })
  expect(() => decodeSetupCode(bad)).toThrow('このコードは使えません')
})
it('applySetupCodeはキーとモデルを保存し、カスタムIDを消す', () => {
  localStorage.setItem('recoco.customModelId', 'old-model')
  applySetupCode(payload)
  expect(getActiveApiKey()).toBe('test-key')
  expect(getEffectiveModel()).toBe('gemini-3.6-flash')
})
it('一覧に無いモデルはカスタムIDとして保存する', () => {
  applySetupCode({ ...payload, model: 'gemini-9-flash' })
  expect(getEffectiveModel()).toBe('gemini-9-flash')
})
it('キーが無ければcurrentSetupPayloadはnull', () => {
  localStorage.clear()
  expect(currentSetupPayload()).toBeNull()
})
```

（各テストの前に `localStorage.clear()`。）

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/lib/setupCode.test.ts` / Expected: FAIL
- [ ] **Step 3: 実装**
- [ ] **Step 4: 成功を確認** — 同コマンド / Expected: PASS

### Task 10: QRを読む画面（職員用）

**Files:**
- Modify: `package.json`（`npm install qrcode jsqr` と `npm install -D @types/qrcode`）
- Create: `src/components/QrScanner.tsx`
- Create: `src/pages/Setup.tsx`、`src/pages/Setup.test.tsx`
- Modify: `src/App.tsx`（`View` に `{ name: 'setup' }` を追加し、`<Setup onBack onDone>` を描画。どちらもホームへ戻す）
- Modify: `src/pages/Home.tsx`、`src/pages/Home.test.tsx`
- Modify: `src/styles.css`（`.qr-video`）

**Interfaces:**
- Consumes: `decodeSetupCode`、`applySetupCode`、`SetupCodeError`（Task 9）、`testConnection`（`ai.ts`）
- Produces:
  - `QrScanner({ onRead, onError }: { onRead: (text: string) => void; onError: (reason: 'denied' | 'unsupported') => void })` — `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` で `<video playsInline muted>` に映し、`requestAnimationFrame` ごとにcanvasへ描いて `jsQR` で読む。読めたら1回だけ `onRead` を呼び、カメラを止める。`mediaDevices` が無ければ `'unsupported'`、許可されなければ `'denied'`。アンマウント時に全トラックを止める。
  - `Setup({ onBack, onDone }: { onBack: () => void; onDone: () => void })`

**Setup画面の決めごと:**
- 見出し `はじめの設定`。本文 `管理者のスマホに出ているQRコードを読み取ってください。`。ボタン `カメラを開く` を押すと `QrScanner` を出す。
- 読めた文字列を `decodeSetupCode` → `applySetupCode` → `testConnection()`。
  - 成功: `準備ができました` と表示し、ボタン `記録を書く` で `onDone()`。
  - コードが不正: エラー文を `role="alert"` で出し、設定は変えない。もう一度 `カメラを開く` を押せる。
  - `testConnection` が失敗: 設定は保存したまま `設定は入りましたが、AIにつながりませんでした。管理者に知らせてください。` を出す。
- カメラが使えない（`onError`）: `カメラが使えません。下の「コードを貼って設定する」を使ってください。` を出し、下の欄を開く。
- `<details><summary>コードを貼って設定する</summary>` の中に `<textarea aria-label="設定コード">` とボタン `設定する`。処理はQRと同じ。
- この画面にキー・モデル名・提供元名を出さない。

**ホームの決めごと:**
- キー未設定のとき、今の案内文をやめて、一番上に案内 `はじめに、管理者のQRコードを読み取ってください。` とボタン `はじめの設定をする`（`go({ name: 'setup' })`）を出す。
- キー設定済みのときは、この案内とボタンを出さない。

- [ ] **Step 1: 依存を追加** — Run: `npm install qrcode jsqr && npm install -D @types/qrcode` / Expected: 成功。`package.json` に3つが増える。
- [ ] **Step 2: 失敗するテストを書く**（`Setup.test.tsx`。`QrScanner` は `vi.mock('../components/QrScanner')` で、`読めた` ボタンと `カメラ不可` ボタンを持つ代役にする。`testConnection` と `applySetupCode` もモック）

```ts
it('QRを読むと設定を入れ、準備ができたことを伝える', async () => {
  mocks.testConnection.mockResolvedValue(true)
  render(<Setup onBack={vi.fn()} onDone={onDone} />)
  fireEvent.click(screen.getByRole('button', { name: 'カメラを開く' }))
  fireEvent.click(screen.getByRole('button', { name: '読めた' }))   // 代役が有効なコードを onRead へ渡す
  expect(await screen.findByText('準備ができました')).toBeInTheDocument()
  expect(mocks.applySetupCode).toHaveBeenCalledWith({ provider: 'google', model: 'gemini-3.6-flash', apiKey: 'test-key' })
  expect(document.body.textContent).not.toMatch(/test-key|Gemini|gemini/)
})
it('別のQRを読んだら断り、設定を変えない', async () => {
  // 代役が 'https://example.com/' を渡す
  expect(await screen.findByRole('alert')).toHaveTextContent('このコードは使えません')
  expect(mocks.applySetupCode).not.toHaveBeenCalled()
})
it('カメラが使えないときは貼り付けでの設定を開く', () => {
  fireEvent.click(screen.getByRole('button', { name: 'カメラを開く' }))
  fireEvent.click(screen.getByRole('button', { name: 'カメラ不可' }))
  expect(screen.getByText(/カメラが使えません/)).toBeInTheDocument()
  expect(screen.getByText('コードを貼って設定する').closest('details')).toHaveAttribute('open')
})
it('コードを貼って設定できる', async () => { /* textareaに有効なコード → 「設定する」→ 準備ができました */ })
it('AIにつながらなければ管理者に知らせるよう伝える', async () => {
  mocks.testConnection.mockRejectedValue(new Error('x'))
  /* … */ expect(await screen.findByRole('alert')).toHaveTextContent('AIにつながりませんでした')
})
```

`Home.test.tsx` に追加: キー未設定（`getActiveApiKey: () => ''`）のとき `はじめの設定をする` を押すと `go({ name: 'setup' })`。設定済みのときはこのボタンが無い。

- [ ] **Step 3: 失敗を確認** — Run: `npx vitest run src/pages/Setup.test.tsx src/pages/Home.test.tsx` / Expected: FAIL
- [ ] **Step 4: 実装**
- [ ] **Step 5: 成功を確認** — Run: `npm test` / Expected: PASS

### Task 11: 設定画面（管理者用を畳む・職員用QRを作る）

**Files:**
- Modify: `src/pages/Settings.tsx`
- Create: `src/pages/Settings.test.tsx`
- Modify: `README.md`（「使い方」を新しい流れに書き直す。管理者: キーを取得して設定→「職員用QRを作る」。職員: 「はじめの設定をする」でQRを読む→「記録を書く」。退職時などはキーを作り直してQRを読み直してもらうこと、QRは紙に印刷せず画面を直接読ませることを明記する。）

**Interfaces:**
- Consumes: `currentSetupPayload`、`encodeSetupCode`（Task 9）、`qrcode` の `toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 280 })`

**決めごと:**
- `Settings` に Props `goSetup: () => void` を足し、`App.tsx` から `() => setView({ name: 'setup' })` を渡す。
- 画面の並び: ①ボタン `QRコードを読み直す`（`goSetup`）②利用者の管理（既存）③バックアップ（既存）④個人情報についての注意（既存。ただし提供元名を出さない文に直す: `話した内容はAIに送られます。` と `無料のAIでは、送った内容がAIの改善に使われる場合があります。`）⑤ `<details className="card admin-area"><summary>管理者用（AIの設定）</summary>` — 既存のAIモデル・APIキー・詳細設定・保存・接続テスト・テスト結果をすべてこの中へ移す。初期状態は閉じる。
- 管理者用の中の最後に `職員用QRを作る` ボタン。押すと先に保存（`persist()`）し、`currentSetupPayload()` が `null` なら `先にAPIキーを入れて保存してください。` を出す。あれば QR画像（`<img alt="職員用の設定QRコード">`）と、ボタン `設定コードをコピー`、注意書き `このQRコードにはAIのキーが入っています。印刷や写真での共有はせず、この画面を職員のスマホで直接読んでもらってください。` を出す。

- [ ] **Step 1: 失敗するテストを書く**（`qrcode` は `vi.mock('qrcode', () => ({ toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,xx') }))`、`PatientManager`・`backup`・`ai` もモック）

```ts
it('AIの設定は管理者用の中に畳んであり、開くまで見えない', () => {
  render(<Settings onBack={vi.fn()} goSetup={vi.fn()} />)
  const admin = screen.getByText('管理者用（AIの設定）').closest('details')!
  expect(admin).not.toHaveAttribute('open')
  expect(admin).toContainElement(screen.getByText('AIモデル'))
})
it('「QRコードを読み直す」で初期設定へ進む', () => { /* goSetup が呼ばれる */ })
it('キーが無いとQRを作らず、先に入れるよう伝える', async () => {
  /* 「職員用QRを作る」→ '先にAPIキーを入れて保存してください。' */
})
it('キーがあれば職員用QRと注意書きを出す', async () => {
  localStorage.setItem('recoco.apiKey.google', 'test-key')
  /* 「職員用QRを作る」→ */
  expect(await screen.findByAltText('職員用の設定QRコード')).toHaveAttribute('src', 'data:image/png;base64,xx')
  expect(screen.getByText(/印刷や写真での共有はせず/)).toBeInTheDocument()
})
```

- [ ] **Step 2: 失敗を確認** — Run: `npx vitest run src/pages/Settings.test.tsx` / Expected: FAIL
- [ ] **Step 3: 実装**（README も更新）
- [ ] **Step 4: フェーズ3の確認** — Run: `npm test && npm run build` / Expected: 全件PASS・ビルド成功
- [ ] **Step 5: 画面で確かめる** — `npm run dev` を起動し（`.claude/launch.json` の設定を使う）、幅375pxで次を確かめて、気づいた点を報告する: ホーム→「記録を書く」→名前ボタン→メモ入力まで横スクロールが出ない／主ボタンが親指で押せる大きさ／キー未設定でホームに「はじめの設定をする」が出る／設定画面でAIの設定が畳まれている。AIの実呼び出しは行わない（キーを扱わない）。
- [ ] **Step 6: 止まって報告** — コミット・デプロイしない。**実機での確認が必要な点**（iPhoneのホーム画面アプリでカメラが開くか、QRが読めるか、無料枠で実際の文章の質がどうか）を報告に明記する。
