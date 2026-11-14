import { useRef, useState } from 'react'
import QRCode from 'qrcode'
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
import { copyText, Header, useToast } from '../components/ui'
import { currentSetupPayload, encodeSetupCode } from '../lib/setupCode'
import { checkAdminPin, getAdminPinHash, isValidPin, setAdminPin } from '../lib/adminPin'

const ALL_PROVIDERS = Object.keys(PROVIDERS) as Provider[]

interface Props {
  onBack: () => void
  goSetup: () => void
}

export default function Settings({ onBack, goSetup }: Props) {
  // 新しく貼ったキーだけを持つ（保存済みのキーは画面に読み込まない＝見せない）
  const emptyKeys = () => Object.fromEntries(ALL_PROVIDERS.map((p) => [p, ''])) as Record<Provider, string>
  const [keys, setKeys] = useState<Record<Provider, string>>(emptyKeys)
  // 管理者用の欄の鍵。暗証番号を入れるまで中身を出さない
  const [unlocked, setUnlocked] = useState(false)
  const [hasPin, setHasPin] = useState(() => !!getAdminPinHash())
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [pinError, setPinError] = useState('')
  const [model, setModelState] = useState(getModel())
  const [customId, setCustomId] = useState(getCustomModelId())
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)
  const [staffQr, setStaffQr] = useState<{ image: string; code: string } | null>(null)
  const [qrError, setQrError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [toast, showToast] = useToast()

  // カスタムモデルIDがあればそれ、なければ選択中モデルの提供元メタを使う
  const meta = getProviderMeta(customId.trim() || model)
  const currentKey = keys[meta.id]
  const setCurrentKey = (v: string) => setKeys((k) => ({ ...k, [meta.id]: v }))
  const hasSavedKey = !!getApiKey(meta.id)

  /** 貼ったキーだけを保存する（空欄なら保存済みのキーをそのまま残す）。 */
  const persist = () => {
    for (const p of ALL_PROVIDERS) if (keys[p].trim()) setApiKey(p, keys[p])
    setKeys(emptyKeys())
    setModel(model)
    setCustomModelId(customId)
  }

  const openAdmin = async () => {
    setPinError('')
    if (!(await checkAdminPin(pin))) {
      setPinError('暗証番号が違います。')
      return
    }
    setPin('')
    setUnlocked(true)
  }

  const createPin = async () => {
    setPinError('')
    if (!isValidPin(pin)) {
      setPinError('暗証番号は4〜6桁の数字にしてください。')
      return
    }
    if (pin !== pin2) {
      setPinError('同じ番号を2回入れてください。')
      return
    }
    await setAdminPin(pin)
    setPin('')
    setPin2('')
    setHasPin(true)
    setUnlocked(true)
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

  /** 管理者用: 今の設定を職員に渡すQRコードを作る。 */
  const makeStaffQr = async () => {
    persist()
    setStaffQr(null)
    setQrError('')
    const payload = currentSetupPayload()
    if (!payload) {
      setQrError('先にAPIキーを入れて保存してください。')
      return
    }
    const code = encodeSetupCode(payload)
    try {
      const image = await QRCode.toDataURL(code, { errorCorrectionLevel: 'M', margin: 2, width: 280 })
      setStaffQr({ image, code })
    } catch {
      setQrError('QRコードを作れませんでした。もう一度押してください。')
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
        <button className="btn btn-primary" onClick={goSetup}>
          QRコードを読み直す
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
          ・話した内容はAIに送られます。
          <strong>利用者の氏名・住所・電話番号は話さない</strong>でください（「本人」などでOK）。
          <br />
          ・アプリで選ぶ利用者名はAIには送られず、この端末の中にだけ保存されます。
          <br />
          ・無料のAIでは、送った内容がAIの改善に使われる場合があります。
        </div>

        <details className="card admin-area">
          <summary>管理者用（AIの設定）</summary>
          {!unlocked ? (
            <div className="pin-gate">
              {hasPin ? (
                <>
                  <p className="hint">管理者の暗証番号を入れてください。</p>
                  <input
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label="暗証番号"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                  />
                  <button className="btn btn-secondary" onClick={() => void openAdmin()}>
                    開く
                  </button>
                </>
              ) : (
                <>
                  <p className="hint">はじめに管理者の暗証番号を決めてください。職員には教えないでください。</p>
                  <label className="label" htmlFor="new-pin">新しい暗証番号（4〜6桁の数字）</label>
                  <input
                    id="new-pin"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                  />
                  <label className="label" htmlFor="new-pin2">もう一度</label>
                  <input
                    id="new-pin2"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    value={pin2}
                    onChange={(e) => setPin2(e.target.value)}
                  />
                  <button className="btn btn-secondary" onClick={() => void createPin()}>
                    暗証番号を決める
                  </button>
                </>
              )}
              {pinError && <div className="error-box" role="alert">{pinError}</div>}
            </div>
          ) : (
          <>
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
            {hasSavedKey && <p className="hint key-saved">設定済み（キーは表示しません。変えるときだけ新しいキーを貼ってください）</p>}
            <input
              type="password"
              aria-label={`${meta.label}のAPIキー`}
              placeholder={hasSavedKey ? '変えるときだけ貼る' : meta.keyPlaceholder}
              value={currentKey}
              onChange={(e) => setCurrentKey(e.target.value)}
              autoComplete="off"
            />
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
          <button className="btn btn-secondary" onClick={runTest} disabled={testing || !(currentKey.trim() || hasSavedKey)}>
            {testing ? '接続テスト中…' : '接続テスト'}
          </button>

          <p className="hint">{meta.privacyNote}</p>

          <button className="btn btn-secondary" onClick={makeStaffQr}>
            職員用QRを作る
          </button>
          {qrError && <div className="error-box" role="alert">{qrError}</div>}
          {staffQr && (
            <div className="staff-qr">
              <img src={staffQr.image} alt="職員用の設定QRコード" width={280} height={280} />
              <button
                className="btn btn-secondary"
                onClick={async () =>
                  showToast((await copyText(staffQr.code)) ? '設定コードをコピーしました' : 'コピーできませんでした')
                }
              >
                設定コードをコピー
              </button>
              <div className="notice">
                このQRコードにはAIのキーが入っています。印刷や写真での共有はせず、この画面を職員のスマホで直接読んでもらってください。
              </div>
            </div>
          )}
          </>
          )}
        </details>
      </div>
      {toast}
    </>
  )
}
