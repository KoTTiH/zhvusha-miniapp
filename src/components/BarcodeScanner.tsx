import { useEffect, useRef, useState } from 'react'
import { subscribeBackButton } from '../lib/tma'

type ScannerControls = { stop: () => void }

type TrackCapsWithTorch = MediaTrackCapabilities & { torch?: boolean }

type Status = 'init' | 'scanning' | 'denied' | 'error'

/**
 * Module-level camera stream cache. We reuse one MediaStream across
 * open/close cycles so the WebView (especially Telegram) doesn't re-prompt
 * for camera permission on every launch. When the scanner closes we don't
 * kill the stream immediately — we schedule a stop in a few seconds so that
 * a quick re-open slots back into the same stream.
 */
let cachedStream: MediaStream | null = null
let cachedStopTimer: number | null = null

function isStreamLive(stream: MediaStream | null): stream is MediaStream {
  if (!stream) return false
  return stream.getVideoTracks().some((t) => t.readyState === 'live')
}

function stopCachedStream() {
  if (cachedStopTimer !== null) {
    window.clearTimeout(cachedStopTimer)
    cachedStopTimer = null
  }
  if (cachedStream) {
    cachedStream.getTracks().forEach((t) => t.stop())
    cachedStream = null
  }
}

async function acquireStream(): Promise<MediaStream> {
  if (isStreamLive(cachedStream)) {
    if (cachedStopTimer !== null) {
      window.clearTimeout(cachedStopTimer)
      cachedStopTimer = null
    }
    return cachedStream
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
  cachedStream = stream
  return stream
}

function scheduleStreamStop(delayMs = 8000) {
  if (cachedStopTimer !== null) window.clearTimeout(cachedStopTimer)
  cachedStopTimer = window.setTimeout(() => {
    cachedStopTimer = null
    if (cachedStream) {
      cachedStream.getTracks().forEach((t) => t.stop())
      cachedStream = null
    }
  }, delayMs)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', stopCachedStream)
  window.addEventListener('beforeunload', stopCachedStream)
}

export function BarcodeScanner({
  onDetected,
  onClose,
  title = 'Сканирование',
}: {
  onDetected: (code: string) => void
  onClose: () => void
  title?: string
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const controlsRef = useRef<ScannerControls | null>(null)
  const lastDetectedRef = useRef<{ code: string; at: number } | null>(null)
  const handleDetectedRef = useRef(onDetected)

  const [status, setStatus] = useState<Status>('init')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  useEffect(() => {
    handleDetectedRef.current = onDetected
  }, [onDetected])

  useEffect(() => subscribeBackButton(onClose), [onClose])

  useEffect(() => {
    let cancelled = false

    const cleanup = () => {
      try { controlsRef.current?.stop() } catch { /* ignore */ }
      controlsRef.current = null
      const video = videoRef.current
      if (video) {
        try { video.pause() } catch { /* ignore */ }
        video.srcObject = null
      }
      streamRef.current = null
      // Keep the shared stream alive briefly so a quick re-open reuses it.
      scheduleStreamStop()
    }

    async function start() {
      try {
        const stream = await acquireStream()
        if (cancelled) return
        streamRef.current = stream

        const track = stream.getVideoTracks()[0]
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as TrackCapsWithTorch
          if (caps.torch) setTorchAvailable(true)
        }

        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play().catch(() => {
          /* iOS иногда требует жест — видео появится как только браузер разрешит */
        })

        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled) return
        const reader = new BrowserMultiFormatReader()
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (!result) return
          const text = result.getText()
          const now = Date.now()
          const last = lastDetectedRef.current
          if (last && last.code === text && now - last.at < 1500) return
          lastDetectedRef.current = { code: text, at: now }
          handleDetectedRef.current(text)
        })
        if (cancelled) {
          try { controls.stop() } catch { /* ignore */ }
          return
        }
        controlsRef.current = controls
        setStatus('scanning')
      } catch (err) {
        if (cancelled) return
        const name = (err as { name?: string }).name
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setStatus('denied')
          setErrorMsg('Нет доступа к камере. Разрешите в настройках устройства.')
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setStatus('error')
          setErrorMsg('Камера не найдена.')
        } else {
          setStatus('error')
          setErrorMsg('Не удалось запустить камеру.')
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    const next = !torchOn
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      })
      setTorchOn(next)
    } catch {
      setTorchAvailable(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black flex flex-col">
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        playsInline
        muted
      />

      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div
          className="rounded-2xl"
          style={{
            width: '78%',
            aspectRatio: '5 / 3',
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
            outline: '2px solid rgba(255,255,255,0.9)',
          }}
        />
      </div>

      <div
        className="relative z-10 flex items-center justify-between px-4 text-white"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px' }}
      >
        <span className="text-sm font-medium">{title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="h-9 w-9 rounded-full bg-black/50 flex items-center justify-center text-xl active:opacity-70"
        >
          ✕
        </button>
      </div>

      <div
        className="mt-auto relative z-10 px-4 flex flex-col items-center gap-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
      >
        <div className="text-white text-sm text-center max-w-xs min-h-[20px]">
          {status === 'init' && 'Запуск камеры…'}
          {status === 'scanning' && 'Наведите на штрих-код'}
          {status === 'denied' && (errorMsg ?? 'Нет доступа к камере')}
          {status === 'error' && (errorMsg ?? 'Ошибка камеры')}
        </div>
        {torchAvailable && status === 'scanning' && (
          <button
            type="button"
            onClick={() => void toggleTorch()}
            className={`h-11 px-4 rounded-full text-sm active:opacity-70 ${
              torchOn ? 'bg-white text-black' : 'bg-black/50 text-white'
            }`}
          >
            {torchOn ? 'Выключить подсветку' : 'Включить подсветку'}
          </button>
        )}
        {(status === 'denied' || status === 'error') && (
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-5 rounded-full bg-white text-black text-sm font-medium active:opacity-70"
          >
            Закрыть
          </button>
        )}
      </div>
    </div>
  )
}
