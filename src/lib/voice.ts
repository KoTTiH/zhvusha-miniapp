import { transcribeAudio } from './ai'

/**
 * Голосовой ввод через MediaRecorder + серверную транскрипцию.
 *
 * Почему не Web Speech API: в Telegram Android WebView каждый внутренний
 * рестарт SpeechRecognition триггерит onPermissionRequest, и юзер видит
 * диалог «разрешить микрофон» по десять раз за минуту непрерывной речи
 * (см. DrKLO/Telegram#1947 — фикс не смержен).
 *
 * Мы же делаем ОДИН getUserMedia (его permission Telegram кеширует),
 * пишем непрерывно в MediaRecorder, на stop() конвертируем в base64
 * и отправляем на /api/transcribe-audio → AI STT → текст.
 *
 * Компромисс: нет interim-текста (распознавание только после остановки),
 * зато один permission prompt за сессию и точность выше.
 */

export function isVoiceAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (!navigator.mediaDevices?.getUserMedia) return false
  if (typeof MediaRecorder === 'undefined') return false
  return true
}

export type VoiceCallbacks = {
  /** Аудио пошло — запись активна. */
  onStart?: () => void
  /** Пользователь остановил запись / сработал автостоп — началась транскрипция. */
  onStop?: () => void
  /** Готовый текст транскрипции. Может быть пустым если ничего не распознали. */
  onFinal: (text: string) => void
  onError?: (error: string) => void
  /** Сессия полностью завершилась (успех или ошибка) — можно сбросить UI. */
  onEnd?: () => void
}

/**
 * На Chrome/Android дефолт — 'audio/webm;codecs=opus'. В iOS Safari
 * (Telegram iOS WebView) — 'audio/mp4'. Подбираем первый поддерживаемый.
 */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

function pickMime(): string | '' {
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return ''
}

/**
 * Серверный STT принимает базовые MIME без `;codecs=...` суффикса.
 * Нормализуем то, что отдал MediaRecorder, перед отправкой на бэкенд.
 */
function normalizeMime(raw: string): string {
  const base = raw.split(';')[0].trim()
  if (!base || !base.startsWith('audio/')) return 'audio/webm'
  return base
}

// Телефон → сервер: выше 60 сек будет дорого и ожидать 10+ сек на ответ.
// Автостоп защищает от забытой активной записи.
const MAX_DURATION_MS = 60_000

export class VoiceRecorder {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private active = false
  private cb: VoiceCallbacks | null = null
  private mimeType = ''
  private autoStopTimer: number | null = null

  async start(cb: VoiceCallbacks): Promise<boolean> {
    if (this.active) return false
    if (!isVoiceAvailable()) {
      cb.onError?.('unavailable')
      cb.onEnd?.()
      return false
    }
    this.cb = cb
    this.chunks = []
    this.mimeType = pickMime()

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      const name = e instanceof Error ? e.name : ''
      const err = name === 'NotAllowedError' || name === 'SecurityError' ? 'not-allowed' : 'mic-failed'
      cb.onError?.(err)
      cb.onEnd?.()
      return false
    }

    try {
      this.recorder = this.mimeType
        ? new MediaRecorder(this.stream, { mimeType: this.mimeType })
        : new MediaRecorder(this.stream)
    } catch {
      this.cleanup()
      cb.onError?.('unavailable')
      cb.onEnd?.()
      return false
    }

    this.recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) this.chunks.push(ev.data)
    }
    this.recorder.onstop = () => {
      void this.finalize()
    }
    this.recorder.onerror = () => {
      cb.onError?.('recorder-error')
      this.cleanup()
      cb.onEnd?.()
    }

    try {
      this.recorder.start()
    } catch {
      this.cleanup()
      cb.onError?.('start-failed')
      cb.onEnd?.()
      return false
    }
    this.active = true
    cb.onStart?.()

    this.autoStopTimer = window.setTimeout(() => {
      this.autoStopTimer = null
      this.stop()
    }, MAX_DURATION_MS)

    return true
  }

  stop(): void {
    if (!this.active) return
    this.active = false
    if (this.autoStopTimer !== null) {
      window.clearTimeout(this.autoStopTimer)
      this.autoStopTimer = null
    }
    this.cb?.onStop?.()
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop()
    } catch {
      /* already stopped */
    }
  }

  isActive(): boolean {
    return this.active
  }

  private async finalize() {
    const cb = this.cb
    if (!cb) {
      this.cleanup()
      return
    }
    const rawMime = this.recorder?.mimeType || this.mimeType || 'audio/webm'
    const blob = new Blob(this.chunks, { type: rawMime })
    this.cleanup()

    // Меньше ~0.3 сек opus-аудио → пустой клик: STT вернёт пустой ответ,
    // а нам дорого гонять запрос ради этого.
    if (blob.size < 2000) {
      cb.onError?.('no-speech')
      cb.onEnd?.()
      return
    }

    try {
      const base64 = await blobToBase64(blob)
      const mediaType = normalizeMime(rawMime)
      const result = await transcribeAudio({ audio: base64, mediaType })
      if ('error' in result) {
        cb.onError?.(result.error)
      } else {
        const text = result.text.trim()
        if (!text) cb.onError?.('no-speech')
        else cb.onFinal(text)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'transcribe-failed'
      cb.onError?.(message)
    } finally {
      cb.onEnd?.()
    }
  }

  private cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.stop()
        } catch {
          /* ignore */
        }
      })
      this.stream = null
    }
    this.recorder = null
    this.chunks = []
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const raw = typeof reader.result === 'string' ? reader.result : ''
      const comma = raw.indexOf(',')
      resolve(comma >= 0 ? raw.slice(comma + 1) : '')
    }
    reader.onerror = () => reject(new Error('read-failed'))
    reader.readAsDataURL(blob)
  })
}
