import type { View } from '../App'
import { getActiveApiKey } from '../lib/settings'
import { Header } from '../components/ui'

export default function Home({ go }: { go: (v: View) => void }) {
  const hasKey = !!getActiveApiKey()

  return (
    <>
      <Header title="recoco 記録アシスタント" />
      <div className="page">
        {!hasKey && (
          <div className="notice setup-notice">
            <p>はじめに、管理者のQRコードを読み取ってください。</p>
            <button className="btn btn-primary" onClick={() => go({ name: 'setup' })}>
              はじめの設定をする
            </button>
          </div>
        )}

        <div className="home-hero">
          <p>話すだけで記録の下書きができます</p>
        </div>

        <button className="big-action main" onClick={() => go({ name: 'form', type: 'soap' })}>
          <span className="title">記録を書く</span>
          <span className="desc">話した内容をSOAPにします</span>
        </button>

        <div className="home-sub">
          <button className="btn btn-secondary" onClick={() => go({ name: 'form', type: 'plan' })}>
            計画書
          </button>
          <button className="btn btn-secondary" onClick={() => go({ name: 'form', type: 'report' })}>
            報告書
          </button>
        </div>

        <button className="btn btn-secondary" onClick={() => go({ name: 'history' })}>
          これまでの記録
        </button>

        <button className="btn btn-ghost home-settings" onClick={() => go({ name: 'settings' })}>
          設定
        </button>
      </div>
    </>
  )
}
