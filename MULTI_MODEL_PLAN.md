# マルチモデル対応 実装計画

作成日: 2026-07-08 ／ 対象: recoco 記録アシスタント

## 現状

- 対応済み: **Google**（Gemini 2.5系・Gemma 3系）と **Anthropic**（Claude Haiku 4.5 / Sonnet 5 / Opus 4.8）の2提供元
- `src/lib/gemini.ts` の `generateJson` が `getProvider(model)`（モデルIDのプレフィックス判定）で `callGoogle` / `callAnthropic` に分岐
- APIキーは提供元ごとに localStorage に別保存（`recoco.geminiApiKey` / `recoco.claudeApiKey`）
- Gemini は構造化出力（responseSchema）、Gemma / Claude はプロンプトJSON指示＋`parseJsonLoose` で頑健にパース

## 大前提（このアプリ固有の制約）

1. **バックエンドがない** — ブラウザから直接 fetch できる（CORS を許可している）API しか使えない。
   - CORS 対応が確認できている: Google (generativelanguage) / Anthropic（`anthropic-dangerous-direct-browser-access` ヘッダ）/ **OpenAI** / **OpenRouter** / **Groq**
   - 実装時は必ず「接続テスト」で実機確認してから提供元をリストに載せること（CORS事情は変わりうる）。
2. **APIキーは端末内のみ**の方針を維持（提供元が増えてもサーバーに送らない）。
3. **個人情報方針を維持** — どの提供元でも利用者名は送らない。提供元ごとの「学習利用ポリシー」の注意書きを設定画面に出す。
4. モデルIDは変化が速い。**ハードコードのリストは「編集しやすい1箇所」に集約**し、加えて自由入力（カスタムモデルID）を用意して陳腐化に備える。

## 推奨アーキテクチャ: 「OpenAI互換」を第3の経路として追加する

OpenAI・OpenRouter・Groq・DeepSeek・xAI などは、ほぼ同じ Chat Completions 形式
（`POST {baseUrl}/chat/completions`、`Authorization: Bearer <key>`）で呼べる。
**`callOpenAICompatible(baseUrl, ...)` を1つ実装すれば多数の提供元をカバーできる**ため、
提供元ごとに実装を増やすのではなく、この汎用経路＋提供元メタデータ（レジストリ）方式にする。

```
generateJson(prompt, schema)
  └─ PROVIDERS[getProvider(model)] を参照して分岐
       ├─ google:    callGoogle（既存。Gemini=responseSchema / Gemma=プロンプトJSON）
       ├─ anthropic: callAnthropic（既存）
       └─ openai互換: callOpenAICompatible（新規。baseUrl だけ差し替え）
            ├─ openai:     https://api.openai.com/v1
            ├─ openrouter: https://openrouter.ai/api/v1
            ├─ groq:       https://api.groq.com/openai/v1
            └─ custom:     ユーザー入力のURL（Ollama / LM Studio 等のローカルLLM）
```

---

## フェーズM1: 提供元レジストリへのリファクタ（土台）

現在の「モデルIDプレフィックスで判定」方式は提供元が増えると破綻する（例: OpenRouter経由の
`anthropic/claude-...` はAnthropicではなくOpenRouterに送る必要がある）。**モデル定義に提供元を明示**する。

### settings.ts の再設計

```ts
export type Provider = 'google' | 'anthropic' | 'openai' | 'openrouter' | 'custom'

export interface ProviderMeta {
  id: Provider
  label: string            // 例: 'OpenAI（ChatGPTのAPI）'
  keyStorageKey: string    // 'recoco.apiKey.openai'
  keyPlaceholder: string   // 'sk-...'
  consoleUrl: string       // キー取得ページ
  consoleName: string      // 'OpenAI Platform' など
  privacyNote: string      // 学習利用に関する注意書き（設定画面に表示）
  kind: 'google' | 'anthropic' | 'openai-compatible'  // 呼び出し経路
  baseUrl?: string         // openai-compatible のみ
}

export const PROVIDERS: Record<Provider, ProviderMeta> = { ... }

export interface ModelOption {
  value: string      // APIに渡すモデルID
  label: string      // 表示名
  provider: Provider // ← プレフィックス判定をやめ、明示する
}
```

- `MODEL_GROUPS` の各オプションに `provider` を持たせ、`getProvider(model)` は
  「選択中モデルの定義から引く」実装に変更（後方互換のため既存モデルはプレフィックスをフォールバックに）。
- **キー保存の移行**: 旧キー（`recoco.geminiApiKey` / `recoco.claudeApiKey`）が存在し新キーが無ければ
  初回アクセス時に新形式 `recoco.apiKey.<provider>` へコピーする移行関数を `settings.ts` に置く。
- `gemini.ts` はこのタイミングで `ai.ts` に改名、`GeminiError` → `AiError`
  （参照元: Settings.tsx / InputForm.tsx / prompts.ts。旧名の re-export を残せば差分最小でも可）。

### 動作確認

既存の Gemini / Gemma / Claude が今まで通り動くこと（リファクタのみで挙動不変）。

---

## フェーズM2: OpenAI 対応

- `callOpenAICompatible` を新規実装:
  - `POST {baseUrl}/chat/completions`、`Authorization: Bearer`、`messages: [{role:'user', content}]`
  - 構造化出力: OpenAI は `response_format: { type: 'json_schema', json_schema: {...} }` に対応。
    対応モデルではこれを使い、非対応・エラー時は `jsonInstruction` ＋ `parseJsonLoose` にフォールバック
    （まずはフォールバック経路のみで出し、json_schema は動作確認後に有効化でもよい）。
  - `temperature` は送らない（Claude同様、モデルによって既定値以外を拒否するものがあるため。
    整形タスクなので既定値で問題ない）。
  - エラーメッセージは既存と同じ日本語トーンで（401/403=キー確認、429=上限、404=モデル見直し）。
- モデルリスト: **実装時に最新のモデルIDを公式ドキュメントで確認して**2〜3個に絞って載せる
  （例: 標準・軽量・高品質の3段。リストは settings.ts の1箇所のみ）。
- 設定画面: 提供元セクションに OpenAI キー欄を追加（`PROVIDERS` のメタデータから自動生成されるUIにすると
  以降の提供元追加でUI改修が不要になる。フェーズM4参照）。

---

## フェーズM3: OpenRouter 対応（1つのキーで多数のモデル）

OpenRouter はブラウザからの直接呼び出しを公式にサポートしており、**1つのAPIキーで
GPT / Claude / Gemini / Llama / DeepSeek / Qwen など数百モデル**を呼べる。
「いろんなモデルを試したい」ニーズには実質これが本命。

- `callOpenAICompatible` に `baseUrl: 'https://openrouter.ai/api/v1'` を渡すだけ。
  任意ヘッダ `HTTP-Referer` / `X-Title`（アプリ名表示用）を付けてもよい。
- モデルリスト: 代表的なものを4〜5個だけ厳選して載せる（多すぎると看護師ユーザーには選べない）
  ＋ **カスタムモデルID入力欄**（OpenRouterのモデルページのIDをそのまま貼れる）。
- 構造化出力はモデル依存のため、OpenRouter経由は常に `jsonInstruction` ＋ `parseJsonLoose` 経路とする（安全側）。
- 注意書き: OpenRouterは各社モデルへの中継サービスである旨と、無料モデル（`:free`）は
  学習利用される場合がある旨を privacyNote に明記。

---

## フェーズM4: 設定画面の再設計（提供元が増えても破綻しないUI）

現状は Google / Anthropic の2択前提の分岐UI。3提供元以上になるので構造を変える。

- モデル選択（optgroup）は現状踏襲。選択したモデルの `provider` に応じて:
  - キー入力欄（1つだけ表示。他提供元のキーは消さず保持）
  - キー取得リンク・placeholder・privacyNote を `PROVIDERS` メタデータから描画
  - → **提供元を足すときは PROVIDERS と MODEL_GROUPS に足すだけ**でUIが追従する状態にする
- 「詳細設定」（details折りたたみ）に:
  - カスタムモデルID入力（選択中provider宛てに任意のモデルIDを送る）
  - カスタムエンドポイント（provider='custom'）: baseUrl＋モデルID＋（任意）キー。
    Ollama / LM Studio などのローカルLLMを使いたい上級ユーザー向け。
    ※ localhost への fetch は PWA(https) からは mixed content でブロックされるため
    「同一LAN内のhttpは不可・httpsが必要」という注意書きを添える。
- 接続テストは現状のまま流用できる（`generateJson` 経由なので全提供元で動く）。

---

## フェーズM5: 品質・保守

- `README.md` の対応モデル一覧を更新。
- 動作確認チェックリスト（提供元ごと）:
  1. 接続テスト成功
  2. SOAP生成（バイタル込み）が4欄すべて日本語で返る
  3. わざと不正なキーで401系の日本語エラーが出る
  4. 前回記録参照ON時も正常生成
- （任意）生成結果に「使用モデル」を記録・履歴表示する（`RecordDoc.model?: string` を追加。
  Dexieはスキーマ変更不要のフィールド追加なので version 上げ不要）。

---

## 優先順位の推奨

| 順位 | 内容 | 理由 |
|---|---|---|
| 1 | M1 レジストリ化 | 土台。これ無しで提供元を足すと分岐が散らばる |
| 2 | M3 OpenRouter | 1キーで多モデル。「いろんなモデル」への最短ルート |
| 3 | M2 OpenAI | 定番。OpenRouter経由でもGPTは使えるので直結は後回しでも可 |
| 4 | M4 設定UI再設計 | M2/M3と同時進行でもよい |
| 5 | M5 品質 | 仕上げ |

## やらないこと

- モデル一覧のAPI動的取得（`/models` エンドポイント）: リストが数百件になり選べなくなる。厳選リスト＋自由入力で足りる。
- 提供元ごとのSDK導入: fetch直書きで十分。バンドルサイズを増やさない。
- APIキーの暗号化保存: 端末内localStorageの範囲では実効性が薄い。現方針を維持し注意書きで対応。
