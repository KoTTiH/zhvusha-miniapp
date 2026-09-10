import { createRoute } from './_lib/handler.js'
import { transcribeAudio } from './_lib/openrouter.js'

type Input = { audio?: string; mediaType?: string }
type Output =
  | { text: string }
  | { error: string }

/**
 * OpenRouter STT принимает несколько форматов, но на клиенте мы пишем только
 * webm/opus (дефолт MediaRecorder на Chrome). Остальные оставлены на
 * случай, если в будущем добавим fallback-кодек.
 */
const ALLOWED_AUDIO = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/flac',
  'audio/opus',
])

// 60 секунд webm/opus ≈ 600 KB. Берём 4 МБ: хватит на 5-минутное описание
// дня, при этом вписываемся в Vercel Hobby body-limit (4.5 МБ) — за ним
// serverless всё равно отдаёт 413 без захода в наш код.
const MAX_BYTES = 4 * 1024 * 1024

export default createRoute<Input, Output>(async ({ input, userId }) => {
  const audioRaw = typeof input.audio === 'string' ? input.audio : ''
  const mediaType = typeof input.mediaType === 'string' ? input.mediaType : ''
  if (!audioRaw) return { error: 'empty' }
  if (!ALLOWED_AUDIO.has(mediaType)) {
    console.warn('[transcribe-audio] unsupported-format:', mediaType)
    return { error: 'unsupported-format' }
  }

  const data = audioRaw.replace(/^data:[^;]+;base64,/, '')
  // base64 → байты: ≈ len * 3/4
  if (data.length * 0.75 > MAX_BYTES) return { error: 'too-large' }

  const approxBytes = Math.round(data.length * 0.75)
  console.log('[transcribe-audio] in:', { mediaType, bytes: approxBytes })
  try {
    const text = await transcribeAudio(data, mediaType, {
      route: 'transcribe-audio',
      userId,
    })
    if (!text) {
      console.warn('[transcribe-audio] empty transcription')
      return { error: 'empty-transcription' }
    }
    console.log('[transcribe-audio] ok:', text.length, 'chars')
    return { text }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    console.error('[transcribe-audio] failed:', message)
    // В dev (ALLOW_UNAUTH=1) прокидываем реальную причину в клиент — иначе
    // с локального тоста «AI не распознал» диагностировать нечего.
    const devReveal = process.env.ALLOW_UNAUTH === '1'
    return {
      error: devReveal ? `transcribe-failed: ${message.slice(0, 200)}` : 'transcribe-failed',
    }
  }
})
