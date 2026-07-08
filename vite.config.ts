import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
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
