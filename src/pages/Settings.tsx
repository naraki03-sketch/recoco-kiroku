import { useRef, useState } from 'react'
import PatientManager from '../components/PatientManager'
import { exportBackup, importBackup } from '../lib/backup'
import { testConnection } from '../lib/ai'
import {
  getApiKey,
  getCustomModelId,
  getModel,
  getProviderMeta,
  isGemmaModel,
  MODEL_GROUPS,
  PROVIDERS,
  setApiKey,
  setCustomModelId,
  setModel,
  type Provider
} from '../lib/settings'
import { Header, useToast } from '../components/ui'

const ALL_PROVIDERS = Object.keys(PROVIDERS) as Provider[]

export default function Settings({ onBack }: { onBack: () => void }) {
  // 全提供元のキーをまとめて保持（提供元を切り替えても入力済みキーを失わない）
  const [keys, setKeys] = useState<Record<Provider, string>>(() =>
    Object.fromEntries(ALL_PROVIDERS.map((p) => [p, getApiKey(p)])) as Record<Provider, string>
  )
  const [model, setModelState] = useState(getModel())
  const [customId, setCustomId] = useState(getCustomModelId())
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [toast, showToast] = useToast()

  // カスタムモデルIDがあればそれ、なければ選択中モデルの提供元メタを使う
  const meta = getProviderMeta(customId.trim() || model)
  const currentKey = keys[meta.id]
  const setCurrentKey = (v: string) => setKeys((k) => ({ ...k, [meta.id]: v }))

  const persist = () => {
    for (const p of ALL_PROVIDERS) setApiKey(p, keys[p])
    setModel(model)
    setCustomModelId(customId)
  }

  const save = () => {
    persist()
    setTestResult(null)
    showToast('設定を保存しました')
  }

  const doExport = async () => {
    setBackupBusy(true)
    try {
      await exportBackup()
      showToast('バックアップを書き出しました')
    } catch {
      showToast('書き出しに失敗しました')
    } finally {
      setBackupBusy(false)
    }
  }

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 同じファイルを続けて選べるようにリセット
    if (!file) return
    setBackupBusy(true)
    try {
      const text = await file.text()
      const res = await importBackup(text)
      showToast(`取り込みました（利用者${res.patients}件・記録${res.records}件を追加）`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '取り込みに失敗しました')
    } finally {
      setBackupBusy(false)
    }
  }

  const runTest = async () => {
    persist()
    setTesting(true)
    setTestResult(null)
    try {
      await testConnection()
      setTestResult({ ok: true, msg: '接続に成功しました。AIでの文章整形が使えます。' })
    } catch (e) {
      setTestResult({ ok: false, msg: e instanceof Error ? e.message : '接続に失敗しました。' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <Header title="設定" onBack={onBack} />
      <div className="page">
        <div className="card">
          <label className="label">AIモデル</label>
          <select value={model} onChange={(e) => setModelState(e.target.value)}>
            {MODEL_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {isGemmaModel(model) && !customId.trim() && (
            <p className="hint">
              Gemmaは軽量なオープンモデルです。Geminiと同じAPIキーで使えますが、
              文章の質はGeminiより落ちる場合があります。選んだら一度「接続テスト」で動作を確認してください。
            </p>
          )}
          <p className="hint">
            選択中の提供元: <strong>{meta.label}</strong>
          </p>

          <label className="label" style={{ marginTop: 12 }}>
            {meta.label}のAPIキー
          </label>
          <div className="patient-row">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder={meta.keyPlaceholder}
              value={currentKey}
              onChange={(e) => setCurrentKey(e.target.value)}
              autoComplete="off"
            />
            <button className="btn-small" onClick={() => setShowKey(!showKey)}>
              {showKey ? '隠す' : '表示'}
            </button>
          </div>
          <p className="hint">
            APIキーは{' '}
            <a href={meta.consoleUrl} target="_blank" rel="noreferrer">
              {meta.consoleName}
            </a>{' '}
            で取得できます。キーはこの端末の中にだけ保存されます（提供元ごとに別々に保存されます）。
          </p>

          <details className="advanced">
            <summary>詳細設定（カスタムモデルID）</summary>
            <p className="hint" style={{ marginTop: 8 }}>
              一覧にない新しいモデルを使う場合、モデルIDを直接入力できます（上の選択より優先されます）。
              提供元は上で選んだモデルの提供元（{meta.label}）宛てに送られます。OpenRouterのモデルは
              「provider/model」形式のIDです。空欄にすると一覧の選択に戻ります。
            </p>
            <input
              type="text"
              placeholder="例: openai/gpt-5.1 / gemini-2.5-flash など"
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              autoComplete="off"
              style={{ marginTop: 8 }}
            />
          </details>
        </div>

        {testResult && (
          <div className={testResult.ok ? 'notice' : 'error-box'} style={testResult.ok ? { background: '#f0fdf4', borderColor: '#86efac' } : undefined}>
            {testResult.msg}
          </div>
        )}

        <button className="btn btn-primary" onClick={save}>
          保存
        </button>
        <button className="btn btn-secondary" onClick={runTest} disabled={testing || !currentKey.trim()}>
          {testing ? '接続テスト中…' : '接続テスト'}
        </button>

        <PatientManager showToast={showToast} />

        <div className="card">
          <label className="label">データのバックアップ</label>
          <p className="hint" style={{ marginTop: 0 }}>
            記録データはこの端末の中だけに保存されています。機種変更・ブラウザのデータ削除・端末の故障で
            すべて消えることがあります。ときどき書き出して安全な場所に保管してください。
          </p>
          <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={doExport} disabled={backupBusy}>
            バックアップを書き出す
          </button>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 10 }}
            onClick={() => fileRef.current?.click()}
            disabled={backupBusy}
          >
            バックアップから復元する
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onPickFile}
            style={{ display: 'none' }}
          />
          <p className="hint">
            復元は既存のデータを消さずに追加します（同じ利用者名はまとめられます）。
            書き出したファイルには利用者名と記録が含まれます。取り扱いにご注意ください。
          </p>
        </div>

        <div className="notice">
          <strong>個人情報についての注意</strong>
          <br />
          ・メモの内容はAI（{meta.label}）に送信されます。
          <strong>利用者の氏名・住所・電話番号はメモに入れない</strong>でください（「Aさん」「本人」などでOK）。
          <br />
          ・アプリで選択する利用者名はAIには送信されず、この端末の中にだけ保存されます。
          <br />
          ・{meta.privacyNote}
        </div>
      </div>
      {toast}
    </>
  )
}
