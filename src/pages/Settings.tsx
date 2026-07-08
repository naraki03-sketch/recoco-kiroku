import { useRef, useState } from 'react'
import PatientManager from '../components/PatientManager'
import { exportBackup, importBackup } from '../lib/backup'
import { testConnection } from '../lib/gemini'
import { getApiKey, getModel, getProvider, isGemmaModel, MODEL_GROUPS, setApiKey, setModel } from '../lib/settings'
import { Header, useToast } from '../components/ui'

export default function Settings({ onBack }: { onBack: () => void }) {
  const [googleKey, setGoogleKey] = useState(getApiKey('google'))
  const [claudeKey, setClaudeKey] = useState(getApiKey('anthropic'))
  const [model, setModelState] = useState(getModel())
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [toast, showToast] = useToast()

  const provider = getProvider(model)
  const isClaude = provider === 'anthropic'
  const currentKey = isClaude ? claudeKey : googleKey
  const setCurrentKey = isClaude ? setClaudeKey : setGoogleKey

  const persist = () => {
    setApiKey('google', googleKey)
    setApiKey('anthropic', claudeKey)
    setModel(model)
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
          {isGemmaModel(model) && (
            <p className="hint">
              Gemmaは軽量なオープンモデルです。Geminiと同じAPIキーで使えますが、
              文章の質はGeminiより落ちる場合があります。選んだら一度「接続テスト」で動作を確認してください。
            </p>
          )}
          {isClaude && (
            <p className="hint">
              Claudeは高品質ですが、無料枠がなく利用に応じた料金がかかります（Anthropicのアカウントとクレジットが必要）。
            </p>
          )}

          <label className="label" style={{ marginTop: 12 }}>
            {isClaude ? 'Claude（Anthropic）APIキー' : 'Gemini / Gemma APIキー'}
          </label>
          <div className="patient-row">
            <input
              type={showKey ? 'text' : 'password'}
              placeholder={isClaude ? 'sk-ant-...' : 'AIza...'}
              value={currentKey}
              onChange={(e) => setCurrentKey(e.target.value)}
              autoComplete="off"
            />
            <button className="btn-small" onClick={() => setShowKey(!showKey)}>
              {showKey ? '隠す' : '表示'}
            </button>
          </div>
          {isClaude ? (
            <p className="hint">
              APIキーは{' '}
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                Anthropic Console
              </a>{' '}
              で取得できます（ログイン →「Create Key」）。キーはこの端末の中にだけ保存されます。
            </p>
          ) : (
            <p className="hint">
              APIキーは{' '}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio
              </a>{' '}
              で無料で取得できます（Googleアカウントでログイン →「APIキーを作成」）。
              キーはこの端末の中にだけ保存されます。
            </p>
          )}
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
          ・メモの内容はAI（{isClaude ? 'Anthropic Claude' : 'Google Gemini / Gemma'}）に送信されます。
          <strong>利用者の氏名・住所・電話番号はメモに入れない</strong>でください（「Aさん」「本人」などでOK）。
          <br />
          ・アプリで選択する利用者名はAIには送信されず、この端末の中にだけ保存されます。
          <br />
          {isClaude
            ? '・Anthropic APIは、既定では送信内容をモデルの学習に利用しません。'
            : '・Gemini / Gemma APIの無料枠では、送信内容がGoogleのサービス改善に利用される場合があります。'}
        </div>
      </div>
      {toast}
    </>
  )
}
