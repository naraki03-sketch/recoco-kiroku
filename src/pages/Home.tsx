import type { View } from '../App'
import { getActiveApiKey } from '../lib/settings'
import { Header } from '../components/ui'

export default function Home({ go }: { go: (v: View) => void }) {
  const hasKey = !!getActiveApiKey()

  return (
    <>
      <Header title="recoco 記録アシスタント" />
      <div className="page">
        <div className="home-hero">
          <p>音声入力のメモをAIが記録文章に整形します（カイポケ転記用の下書き）</p>
        </div>

        {!hasKey && (
          <div className="notice">
            はじめに<strong>設定画面でGemini APIキー</strong>を登録してください。キーがなくてもメモの入力はできますが、AIでの文章整形ができません。
          </div>
        )}

        <button className="big-action" onClick={() => go({ name: 'form', type: 'soap' })}>
          <span className="title">訪問看護記録を作る</span>
          <span className="desc">メモ＋バイタル → SOAP形式（S・O・A・P）</span>
        </button>

        <button className="big-action alt" onClick={() => go({ name: 'form', type: 'plan' })}>
          <span className="title">訪問看護計画書を作る</span>
          <span className="desc">メモ → 目標・課題と支援内容・評価</span>
        </button>

        <button className="big-action alt" onClick={() => go({ name: 'form', type: 'report' })}>
          <span className="title">訪問看護報告書を作る</span>
          <span className="desc">メモ → 病状の経過・看護内容・介護状況・特記事項</span>
        </button>

        <div className="home-links">
          <button className="btn btn-secondary" onClick={() => go({ name: 'history' })}>
            履歴
          </button>
          <button className="btn btn-secondary" onClick={() => go({ name: 'settings' })}>
            設定
          </button>
        </div>
      </div>
    </>
  )
}
