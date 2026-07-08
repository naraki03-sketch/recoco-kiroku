import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { migrateLegacyStorage } from './lib/settings'
import './styles.css'

// 旧バージョンで保存されたAPIキー・モデル設定を新形式へ移行してから起動する
migrateLegacyStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
