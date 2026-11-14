import { useState } from 'react'
import { Header } from '../components/ui'
import QrScanner from '../components/QrScanner'
import { testConnection } from '../lib/ai'
import { applySetupCode, decodeSetupCode, SetupCodeError } from '../lib/setupCode'

interface Props {
  onBack: () => void
  onDone: () => void
}

type Status = 'idle' | 'scanning' | 'checking' | 'ready'

/** 職員用の初期設定。管理者のQRコードを読むだけでAIを使えるようにする。 */
export default function Setup({ onBack, onDone }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [cameraNote, setCameraNote] = useState('')
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasted, setPasted] = useState('')

  const handleCode = async (text: string) => {
    setError('')
    let payload
    try {
      payload = decodeSetupCode(text)
    } catch (e) {
      setStatus('idle')
      setError(e instanceof SetupCodeError ? e.message : 'このコードは使えません。')
      return
    }
    applySetupCode(payload)
    setStatus('checking')
    try {
      await testConnection()
      setStatus('ready')
    } catch {
      setStatus('idle')
      setError('設定は入りましたが、AIにつながりませんでした。管理者に知らせてください。')
    }
  }

  return (
    <>
      <Header title="はじめの設定" onBack={onBack} />
      <main className="page">
        {status === 'ready' ? (
          <div className="card setup-done">
            <h2 className="setup-title">準備ができました</h2>
            <p>これで記録を書けます。</p>
            <button className="btn btn-primary" type="button" onClick={onDone}>
              記録を書く
            </button>
          </div>
        ) : (
          <>
            <div className="card">
              <h2 className="setup-title">はじめの設定</h2>
              <p>管理者のスマホに出ているQRコードを読み取ってください。</p>
              {status === 'scanning' && (
                <QrScanner
                  onRead={(text) => void handleCode(text)}
                  onError={() => {
                    setStatus('idle')
                    setCameraNote('カメラが使えません。下の「コードを貼って設定する」を使ってください。')
                    setPasteOpen(true)
                  }}
                />
              )}
              {status === 'checking' && <p role="status">確かめています…</p>}
              {cameraNote && <div className="notice">{cameraNote}</div>}
              {error && (
                <div className="error-box" role="alert">
                  {error}
                </div>
              )}
              {status === 'idle' && (
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setError('')
                    setCameraNote('')
                    setStatus('scanning')
                  }}
                >
                  カメラを開く
                </button>
              )}
              {status === 'scanning' && (
                <button className="btn btn-ghost" type="button" onClick={() => setStatus('idle')}>
                  カメラを閉じる
                </button>
              )}
            </div>

            <details className="card paste-setup" open={pasteOpen} onToggle={(e) => setPasteOpen(e.currentTarget.open)}>
              <summary>コードを貼って設定する</summary>
              <textarea
                aria-label="設定コード"
                rows={3}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <button
                className="btn btn-secondary"
                type="button"
                disabled={status === 'checking' || !pasted.trim()}
                onClick={() => void handleCode(pasted)}
              >
                設定する
              </button>
            </details>
          </>
        )}
      </main>
    </>
  )
}
