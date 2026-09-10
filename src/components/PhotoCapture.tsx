import { useEffect, useRef, useState } from 'react'
import { ZH, accentAlpha } from '../design/tokens'
import type { CapturedImage } from '../lib/imageCapture'
import { subscribeBackButton } from '../lib/tma'

type Status = 'init' | 'live' | 'denied' | 'error'

// Синхронизировано с imageCapture.ts: держим 5 фото + текст в пределах
// ~2 MB JSON-тела, чтобы не упираться в лимит туннеля/serverless function.
const MAX_LONGEST_SIDE = 1024
const JPEG_QUALITY = 0.78

/**
 * Модальное окно с живым превью камеры. По нажатию «снять» делает снапшот
 * текущего кадра через canvas, сжимает и возвращает через onCaptured.
 * Используется, когда пользователь выбирает именно «сфотографировать», а не
 * «выбрать из галереи» — file-input с capture="environment" в Telegram WebView
 * не всегда открывает камеру, поэтому идём через getUserMedia напрямую.
 */
export function PhotoCapture({
  onCaptured,
  onClose,
}: {
  onCaptured: (img: CapturedImage) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [status, setStatus] = useState<Status>('init')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let localStream: MediaStream | null = null
    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        localStream = stream
        streamRef.current = stream
        const v = videoRef.current
        if (v) {
          v.srcObject = stream
          v.playsInline = true
          v.muted = true
          await v.play().catch(() => {
            /* некоторые WebView требуют жеста — продолжим по готовности */
          })
        }
        setStatus('live')
      } catch (e) {
        const name = e instanceof Error ? e.name : ''
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setStatus('denied')
        } else {
          setStatus('error')
          setErrorMsg(e instanceof Error ? e.message : 'camera failed')
        }
      }
    }
    void start()
    return () => {
      cancelled = true
      if (localStream) localStream.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  useEffect(() => {
    return subscribeBackButton(() => onClose())
  }, [onClose])

  const capture = async () => {
    const v = videoRef.current
    if (!v || status !== 'live') return
    const w = v.videoWidth
    const h = v.videoHeight
    if (w === 0 || h === 0) return
    const scale = Math.min(1, MAX_LONGEST_SIDE / Math.max(w, h))
    const tw = Math.round(w * scale)
    const th = Math.round(h * scale)
    const canvas = document.createElement('canvas')
    canvas.width = tw
    canvas.height = th
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(v, 0, 0, tw, th)
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('blob-failed'))),
        'image/jpeg',
        JPEG_QUALITY,
      )
    })
    const data = dataUrl.replace(/^data:[^;]+;base64,/, '')
    onCaptured({
      data,
      mediaType: 'image/jpeg',
      previewUrl: URL.createObjectURL(blob),
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <video
          ref={videoRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          playsInline
          muted
          autoPlay
        />
        {/* Подсказка о якоре масштаба. AI точнее оценивает порцию,
            когда в кадре есть предмет известного размера — индустриальный
            workaround: 75% → 95% точности. */}
        {status === 'live' && <ScaleAnchorHint />}
        {status !== 'live' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              textAlign: 'center',
              color: ZH.textDim,
              fontFamily: ZH.mono,
              fontSize: 12,
              lineHeight: 1.5,
              letterSpacing: '0.06em',
            }}
          >
            {status === 'init' && 'включаю камеру…'}
            {status === 'denied' && 'доступ к камере не разрешён'}
            {status === 'error' && (errorMsg ?? 'ошибка камеры')}
          </div>
        )}
      </div>
      <div
        style={{
          flexShrink: 0,
          padding:
            'calc(env(safe-area-inset-bottom) + 20px) 20px calc(env(safe-area-inset-bottom) + 20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 20,
          background: 'rgba(8,9,15,0.88)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '10px 16px',
            borderRadius: 10,
            border: `1px solid ${ZH.line}`,
            color: ZH.textDim,
            fontFamily: ZH.mono,
            fontSize: 11,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          отмена
        </button>
        <button
          type="button"
          onClick={() => void capture()}
          disabled={status !== 'live'}
          aria-label="сфотографировать"
          style={{
            all: 'unset',
            cursor: status === 'live' ? 'pointer' : 'not-allowed',
            width: 68,
            height: 68,
            borderRadius: 999,
            background: status === 'live' ? '#fff' : 'rgba(255,255,255,0.3)',
            border: `4px solid ${accentAlpha(0.6)}`,
            boxShadow: status === 'live' ? `0 0 18px ${accentAlpha(0.4)}` : 'none',
          }}
        />
        <div style={{ width: 70 }} />
      </div>
    </div>
  )
}

/**
 * Top-overlay подсказка о якоре масштаба. AI оценивает порцию точнее,
 * когда в кадре есть предмет известного размера: вилка, ладонь, монета,
 * телефон. Без якоря модель опирается на типовые порции и confidence
 * падает до 0.3-0.5.
 */
function ScaleAnchorHint() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 'calc(env(safe-area-inset-top) + 12px)',
        left: 12,
        right: 12,
        padding: '8px 12px',
        borderRadius: 10,
        background: 'rgba(8,9,15,0.66)',
        border: `1px solid ${accentAlpha(0.3)}`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: 1,
          background: ZH.accent,
          boxShadow: `0 0 6px ${ZH.accent}`,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          letterSpacing: '0.08em',
          lineHeight: 1.4,
          color: ZH.textDim,
        }}
      >
        для точности — вилка, ладонь или монета в кадр
      </span>
    </div>
  )
}
