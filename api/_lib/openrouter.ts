import {
  OPENROUTER_STT_MODEL_ID,
  OPENROUTER_V4_LITE_MODEL_ID,
  OPENROUTER_VISION_MODEL_ID,
} from './modelIds.js'
import { logUsage } from './usage.js'

export const MODEL_ID_V4_LITE = OPENROUTER_V4_LITE_MODEL_ID
export const MODEL_ID_VISION = OPENROUTER_VISION_MODEL_ID
export const MODEL_ID_STT = OPENROUTER_STT_MODEL_ID

export type OpenRouterImageInput = {
  /** base64 без префикса data:...;base64, */
  data: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

export type OpenRouterJsonSchema = {
  type?: string | string[]
  description?: string
  enum?: string[]
  properties?: Record<string, OpenRouterJsonSchema>
  required?: string[]
  items?: OpenRouterJsonSchema
  additionalProperties?: boolean
  minItems?: number
  maxItems?: number
  minimum?: number
  maximum?: number
  nullable?: boolean
  propertyOrdering?: string[]
}

type OpenRouterContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

type OpenRouterMessage = {
  role: 'system' | 'user'
  content: string | OpenRouterContentPart[]
}

type OpenRouterChoice = {
  message?: {
    content?: string | null
  } | null
}

type OpenRouterResponse = {
  choices?: OpenRouterChoice[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
  }
}

type OpenRouterTranscriptionResponse = {
  text?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    cost?: number
  }
}

type JsonSchema = Record<string, unknown>

export async function askJson<T>(args: {
  system: string
  user: string
  images?: OpenRouterImageInput[]
  maxTokens?: number
  model?: string
  schema?: {
    name: string
    schema: JsonSchema
  }
  timeoutMs?: number
  usage?: { route: string; userId: number | null }
}): Promise<T> {
  const model = args.model ?? MODEL_ID_V4_LITE
  const controller = new AbortController()
  const timeoutMs = args.timeoutMs ?? 30_000
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': referer(),
        'X-Title': 'Zhvusha Mini App',
      },
      body: JSON.stringify({
        model,
        provider: args.schema ? { require_parameters: true } : undefined,
        messages: messages(args.system, args.user, args.images ?? []),
        max_tokens: args.maxTokens ?? 400,
        response_format: args.schema
          ? {
              type: 'json_schema',
              json_schema: {
                name: args.schema.name,
                strict: true,
                schema: args.schema.schema,
              },
            }
          : { type: 'json_object' },
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`OpenRouter timeout after ${timeoutMs}ms`)
    }
    throw err
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 300)}`)
  }

  const data = await response.json() as OpenRouterResponse
  const raw = data.choices?.[0]?.message?.content?.trim()
  if (!raw) throw new Error('Empty OpenRouter response')

  if (args.usage) {
    logUsage({
      route: args.usage.route,
      userId: args.usage.userId,
      model,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
    })
  }

  const json = extractLastJsonObject(raw)
  if (!json) {
    logOpenRouterDiag('no JSON', raw)
    throw new Error('No JSON in OpenRouter response')
  }

  try {
    return JSON.parse(json) as T
  } catch (e) {
    const message = e instanceof Error ? e.message : 'invalid JSON'
    logOpenRouterDiag(`malformed JSON: ${message}`, json)
    throw new Error(`Malformed OpenRouter JSON: ${message}`)
  }
}

export async function transcribeAudio(
  audioBase64: string,
  mediaType: string,
  usageContext?: { route: string; userId: number | null },
): Promise<string> {
  const format = audioFormat(mediaType)
  const response = await fetch('https://openrouter.ai/api/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': referer(),
      'X-Title': 'Zhvusha Mini App',
    },
    body: JSON.stringify({
      model: MODEL_ID_STT,
      input_audio: {
        data: audioBase64,
        format,
      },
      language: 'ru',
      temperature: 0,
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenRouter STT ${response.status}: ${body.slice(0, 300)}`)
  }
  const data = await response.json() as OpenRouterTranscriptionResponse
  if (usageContext && data.usage) {
    logUsage({
      route: usageContext.route,
      userId: usageContext.userId,
      model: MODEL_ID_STT,
      inputTokens: data.usage.input_tokens ?? 0,
      outputTokens: data.usage.output_tokens ?? 0,
    })
  }
  return (data.text ?? '').trim()
}

function messages(system: string, user: string, images: OpenRouterImageInput[]): OpenRouterMessage[] {
  const userContent: OpenRouterMessage['content'] = images.length > 0
    ? [
        { type: 'text', text: user },
        ...images.map((image) => ({
          type: 'image_url' as const,
          image_url: {
            url: `data:${image.mediaType};base64,${image.data}`,
          },
        })),
      ]
    : user
  return [
    { role: 'system', content: system },
    { role: 'user', content: userContent },
  ]
}

function audioFormat(mediaType: string): string {
  if (mediaType === 'audio/webm') return 'webm'
  if (mediaType === 'audio/ogg') return 'ogg'
  if (mediaType === 'audio/wav') return 'wav'
  if (mediaType === 'audio/mp3' || mediaType === 'audio/mpeg') return 'mp3'
  if (mediaType === 'audio/mp4') return 'm4a'
  if (mediaType === 'audio/aac') return 'aac'
  if (mediaType === 'audio/flac') return 'flac'
  if (mediaType === 'audio/opus') return 'opus'
  throw new Error(`unsupported audio format: ${mediaType}`)
}

function apiKey(): string {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY is not set')
  return key
}

function referer(): string {
  const vercelUrl = process.env.VERCEL_URL
  if (vercelUrl) return `https://${vercelUrl}`
  return 'http://localhost:5173'
}

function extractLastJsonObject(text: string): string | null {
  const end = text.lastIndexOf('}')
  if (end < 0) return null
  let depth = 0
  for (let i = end; i >= 0; i--) {
    const ch = text[i]
    if (ch === '}') depth++
    else if (ch === '{') {
      depth--
      if (depth === 0) return text.slice(i, end + 1)
    }
  }
  return null
}

function logOpenRouterDiag(what: string, body: string): void {
  const prodLike = !!process.env.VERCEL && process.env.VERCEL_ENV === 'production'
  if (prodLike) {
    console.error('[openrouter] %s. len=%d', what, body.length)
  } else {
    console.error('[openrouter] %s. body=%s', what, body.slice(0, 300))
  }
}
