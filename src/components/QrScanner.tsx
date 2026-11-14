import { useEffect, useRef } from 'react'
import jsQR from 'jsqr'

interface Props {
  onRead: (text: string) => void
  onError: (reason: 'denied' | 'unsupported') => void
}

/** 背面カメラでQRコードを読む。読めたら1回だけ onRead を呼び、カメラを止める。 */
export default function QrScanner({ onRead, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  // 親の再描画でカメラを開き直さないよう、最新のコールバックを参照で持つ
  const onReadRef = useRef(onRead)
  const onErrorRef = useRef(onError)
  onReadRef.current = onRead
  onErrorRef.current = onError

  useEffect(() => {
    let stream: MediaStream | null = null
    let frame = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    const stop = () => {
      stopped = true
      cancelAnimationFrame(frame)
      stream?.getTracks().forEach((track) => track.stop())
    }

    const tick = () => {
      if (stopped) return
      const video = videoRef.current
      if (video && ctx && video.readyState >= video.HAVE_ENOUGH_DATA && video.videoWidth) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })
        if (code?.data) {
          stop()
          onReadRef.current(code.data)
          return
        }
      }
      frame = requestAnimationFrame(tick)
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current('unsupported')
      return
    }

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) {
          s.getTracks().forEach((track) => track.stop())
          return
        }
        stream = s
        const video = videoRef.current
        if (!video) return
        video.srcObject = s
        void video.play().catch(() => undefined)
        frame = requestAnimationFrame(tick)
      })
      .catch(() => {
        if (!stopped) onErrorRef.current('denied')
      })

    return stop
  }, [])

  return <video ref={videoRef} className="qr-video" playsInline muted aria-label="カメラの映像" />
}
