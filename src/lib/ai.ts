/**
 * Base URL for AI routes. Defaults to same-origin.
 * Override via VITE_AI_API_BASE when running Vite dev against a deployed Vercel.
 */
import type {
  BrandDataStatus,
  FoodLogStatus,
  NutritionEstimateSource,
  NutritionPortionBasis,
} from '../types/calorie'

const API_BASE = (import.meta.env.VITE_AI_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

function getInitData(): string {
  if (typeof window === 'undefined') return ''
  return window.Telegram?.WebApp?.initData ?? ''
}

/**
 * Типизированные ошибки AI-вызовов — чтобы UI мог показать
 * осмысленный текст вместо «AI недоступен» на всё подряд.
 */
export type AiErrorKind =
  | 'network' // нет интернета / fetch отклонён
  | 'unauthorized' // 401/403 — нет валидного x-init-data
  | 'overloaded' // 429/529 — rate limit или AI-провайдер перегружен
  | 'timeout' // 408/504 — сервер не успел
  | 'server' // 4xx/5xx остальное
  | 'parse' // ответ пришёл, но это не JSON

export class AiError extends Error {
  readonly kind: AiErrorKind
  readonly status: number | null
  constructor(kind: AiErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'AiError'
    this.kind = kind
    this.status = status
  }
}

function statusToKind(status: number): AiErrorKind {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 429 || status === 529) return 'overloaded'
  if (status === 408 || status === 504) return 'timeout'
  return 'server'
}

/**
 * Короткое сообщение для тоста — человекочитаемое, по-русски.
 */
export function describeAiError(e: unknown): string {
  if (!(e instanceof AiError)) return 'AI недоступен'
  switch (e.kind) {
    case 'network':
      return 'нет связи'
    case 'unauthorized':
      return 'запусти через Telegram'
    case 'overloaded':
      return 'AI перегружен — попробовать через минуту'
    case 'timeout':
      return 'AI долго думает — попробовать ещё'
    case 'parse':
      return 'AI сбился — попробовать ещё'
    case 'server':
      return 'AI недоступен'
  }
}

async function call<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getInitData() ? { 'x-init-data': getInitData() } : {}),
      },
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e
    const message = e instanceof Error ? e.message : 'network failed'
    console.error('[ai] network fail', path, message)
    throw new AiError('network', message)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[ai] http error', path, res.status, text.slice(0, 200))
    throw new AiError(statusToKind(res.status), `${path} ${res.status}: ${text.slice(0, 120)}`, res.status)
  }
  // Обёртка критична: chunked-ответы (а любой с heartbeat становится таким)
  // могут упасть на теле уже ПОСЛЕ 200 OK headers. fetch в этом случае бросает
  // TypeError('network'), который без обёртки выбрасывается как не-AiError
  // и показывается пользователю как «AI недоступен» — хотя суть сетевая.
  let raw: string
  try {
    raw = await res.text()
  } catch (e) {
    const message = e instanceof Error ? e.message : 'read failed'
    console.error('[ai] body read fail', path, message)
    throw new AiError('network', `body read failed: ${message}`)
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    // Ndjson-fallback остаётся на случай, если какой-то роут ещё стримит.
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      console.error('[ai] parse fail', path, 'empty body')
      throw new AiError('parse', 'empty response')
    }
    const last = lines[lines.length - 1]
    try {
      return JSON.parse(last) as T
    } catch (e) {
      const message = e instanceof Error ? e.message : 'invalid JSON'
      console.error('[ai] parse fail', path, message, raw.slice(0, 200))
      throw new AiError('parse', message)
    }
  }
}

export type FoodItem = {
  name: string
  grams: number
  kcal: number
  carbs: number
  fat: number
  protein: number
  fiber?: number
  confidence: number
  confidenceReason?: string
  portionBasis: NutritionPortionBasis
  basisLabel?: string
  brandDataStatus: BrandDataStatus
  brandDataLabel?: string
  estimateSource?: NutritionEstimateSource
  dataSource?: string
}

export type AiDebugModel = {
  provider: string
  model: string
  fallback?: boolean
}

export type ParseFoodResult =
  | {
      items: FoodItem[]
      balance?: number
      unlimited?: boolean
      analysisId?: number
      debugModel?: AiDebugModel
    }
  | { error: string; balance?: number; unlimited?: boolean; debugModel?: AiDebugModel }

export type ParseDayResult =
  | {
      foods: FoodItem[]
      notes: string[]
      waterMl: number
      lazy: true
      balance?: number
      unlimited?: boolean
      analysisId?: number
      debugModel?: AiDebugModel
    }
  | { error: string; balance?: number; unlimited?: boolean; debugModel?: AiDebugModel }

/**
 * Проверка специальной ошибки — токены закончились. Используется UI
 * для показа модалки «купить ещё» вместо обычного тоста про AI.
 */
export function isInsufficientTokens(
  r: ParseFoodResult | ParseDayResult | TranscribeAudioResult,
): r is { error: 'insufficient-tokens'; balance?: number; unlimited?: boolean } {
  return 'error' in r && r.error === 'insufficient-tokens'
}

export type ParseFoodImage = {
  data: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

export async function parseFood(
  input: {
    text?: string
    image?: ParseFoodImage | null
    images?: ParseFoodImage[] | null
    billing?: {
      mode?: 'primary' | 'refine'
      parentAnalysisId?: number | null
    } | null
  },
  signal?: AbortSignal,
): Promise<ParseFoodResult> {
  return call<ParseFoodResult>(
    '/api/parse-food',
    {
      text: input.text ?? '',
      image: input.image ?? null,
      images: input.images ?? null,
      billing: input.billing ?? null,
    },
    signal,
  )
}

export async function parseDay(
  input: {
    text?: string
    image?: ParseFoodImage | null
    images?: ParseFoodImage[] | null
  },
  signal?: AbortSignal,
): Promise<ParseDayResult> {
  return call<ParseDayResult>(
    '/api/parse-day',
    {
      text: input.text ?? '',
      image: input.image ?? null,
      images: input.images ?? null,
    },
    signal,
  )
}

/**
 * Транскрипция аудио через серверный AI-route. Используется голосовым вводом еды
 * вместо браузерного SpeechRecognition: позволяет обойти повторные
 * permission-prompt'ы Telegram Android WebView (он кеширует getUserMedia
 * в пределах сессии, но каждый рестарт SpeechRecognition считает новым
 * permission request).
 */
export type TranscribeAudioResult =
  | { text: string }
  | { error: string }

export async function transcribeAudio(
  input: { audio: string; mediaType: string },
  signal?: AbortSignal,
): Promise<TranscribeAudioResult> {
  return call<TranscribeAudioResult>('/api/transcribe-audio', input, signal)
}

export type AssistantMode = 'general' | 'health' | 'skin'
export type AssistantMemoryStatus = 'suggested' | 'confirmed' | 'dismissed'
export type AssistantMemoryKind = 'fact' | 'preference' | 'hypothesis'

export type AssistantStructuredMessage = {
  conclusion: string
  reasons: string[]
  confidence: 'низкая' | 'средняя' | 'высокая'
  checks: string[]
  redFlags: string[]
}

export type AssistantMemory = {
  id: number
  kind: AssistantMemoryKind
  text: string
  confidence: number
  status: AssistantMemoryStatus
}

export type AssistantSuggestedAction = {
  kind: 'diary' | 'photo' | 'memory' | 'doctor' | 'check'
  label: string
}

export type AssistantUsedContext = {
  messages: number
  memories: number
  days: number
  attachments: number
  dialogueState: boolean
}

export type AssistantDialogueState = {
  activeTopic: string
  focusDay: string
  focusRange: string
  pendingQuestion: string
  lastUserAsk: string
  lastAssistantPoint: string
  signals: string[]
  confidence: number
}

export type AssistantClientDiaryDay = {
  day: string
  foods: string[]
  waterMl: number
  notes: string[]
  lazy: boolean
  foodStatus?: FoodLogStatus
}

export type AssistantClientContext = {
  today?: string
  selectedDay?: string
  visibleDays?: string[]
  note?: string
  diaryDays?: AssistantClientDiaryDay[]
}

export type AssistantSafety = {
  level: 'normal' | 'health' | 'urgent'
  disclaimer: string
  redFlags: string[]
}

export type AssistantChatResult = {
  threadId: number
  assistantMessage: AssistantStructuredMessage
  suggestedMemory: AssistantMemory[]
  suggestedActions: AssistantSuggestedAction[]
  usedContext: AssistantUsedContext
  safety: AssistantSafety
  dialogueState: AssistantDialogueState
}

export type AssistantAttachment = {
  id: number
  kind: 'skin_photo' | 'photo'
  mediaType: string
  pathname: string
  size: number
  createdAt: string
}

export async function assistantChat(
  input: {
    threadId?: number | null
    message: string
    attachmentIds?: number[]
    mode?: AssistantMode
    clientContext?: AssistantClientContext | null
  },
  signal?: AbortSignal,
): Promise<AssistantChatResult> {
  return call<AssistantChatResult>(
    '/api/assistant-chat',
    {
      action: 'send',
      threadId: input.threadId ?? null,
      message: input.message,
      attachmentIds: input.attachmentIds ?? [],
      mode: input.mode ?? 'health',
      clientContext: input.clientContext ?? null,
    },
    signal,
  )
}

export async function assistantListMemories(
  signal?: AbortSignal,
): Promise<{ memories: AssistantMemory[] }> {
  return call<{ memories: AssistantMemory[] }>(
    '/api/assistant-chat',
    { action: 'list-memories' },
    signal,
  )
}

export async function assistantUpdateMemory(
  input: { memoryId: number; status: Extract<AssistantMemoryStatus, 'confirmed' | 'dismissed'> },
  signal?: AbortSignal,
): Promise<{ memories: AssistantMemory[] }> {
  return call<{ memories: AssistantMemory[] }>(
    '/api/assistant-chat',
    {
      action: 'update-memory',
      memoryId: input.memoryId,
      status: input.status,
    },
    signal,
  )
}

export async function assistantUploadAttachment(
  input: {
    kind: 'skin_photo' | 'photo'
    data: string
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
    metadata?: Record<string, unknown>
  },
  signal?: AbortSignal,
): Promise<{ attachment: AssistantAttachment }> {
  return call<{ attachment: AssistantAttachment }>(
    '/api/assistant-attachment',
    {
      action: 'upload',
      kind: input.kind,
      data: input.data,
      mediaType: input.mediaType,
      metadata: input.metadata ?? null,
    },
    signal,
  )
}

export async function assistantDeleteAttachment(
  input: { id: number },
  signal?: AbortSignal,
): Promise<{ ok: true }> {
  return call<{ ok: true }>(
    '/api/assistant-attachment',
    {
      action: 'delete',
      id: input.id,
    },
    signal,
  )
}

/**
 * AI доступен только на окружении с /api (Vercel). Локальный Vite — нет.
 */
export function aiAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (API_BASE) return true
  return true
}

export function formatAiDebugModel(debugModel: AiDebugModel): string {
  const provider = debugModel.provider.trim() || 'provider'
  const model = debugModel.model.trim() || 'model'
  return `${provider}/${model}${debugModel.fallback ? ' · fallback' : ''}`
}
