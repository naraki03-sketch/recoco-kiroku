import { useCallback, useRef, useState, type ReactNode } from 'react'

export function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="header">
      {onBack && (
        <button className="back-btn" onClick={onBack} aria-label="戻る">
          ←
        </button>
      )}
      <h1>{title}</h1>
    </header>
  )
}

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2000)
  }, [])
  const node = msg ? <div className="toast">{msg}</div> : null
  return [node, show]
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 古いブラウザ・非HTTPS環境向けフォールバック
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

export function today(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function formatDateJa(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${y}年${Number(m)}月${Number(d)}日`
}
