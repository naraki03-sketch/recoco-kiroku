import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * 公開版だけに通信先の制限（CSP）を入れる。開発サーバーはインラインスクリプトを使うため対象外。
 * 通信してよいのは自分自身とAIの公式窓口だけ。万一画面に悪いスクリプトが入っても、
 * キーや記録を外部へ送れないようにする。AIの提供元を増やしたら connect-src に足すこと。
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com https://openrouter.ai",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'"
].join('; ')

const cspPlugin = {
  name: 'recoco-csp',
  apply: 'build' as const,
  transformIndexHtml(html: string) {
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
    )
  }
}

// GitHub Pages のプロジェクトサイト（https://<user>.github.io/recoco-kiroku/）で
// 配信するため、ベースパスをリポジトリ名に合わせる。独自ドメインやVercelに移す場合は '/' に戻す。
export default defineConfig({
  base: '/recoco-kiroku/',
  plugins: [
    react(),
    cspPlugin,
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'recoco 記録アシスタント',
        short_name: 'recoco記録',
        description: '訪問看護の記録・計画書の下書きをAIで整形（カイポケ転記用）',
        lang: 'ja',
        theme_color: '#0f766e',
        background_color: '#f6f8f8',
        display: 'standalone',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // AI APIへのリクエストはキャッシュしない（アプリ本体のみオフライン対応）
        navigateFallbackDenylist: [/^\/api/]
      }
    })
  ]
})
