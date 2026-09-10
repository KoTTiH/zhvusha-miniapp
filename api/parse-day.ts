import { createRoute } from './_lib/handler.js'
import {
  askJson as askOpenRouterJson,
  MODEL_ID_VISION,
  type OpenRouterImageInput,
  type OpenRouterJsonSchema,
} from './_lib/openrouter.js'
import {
  credit,
  debit,
  ensureUser,
  hasUnlimitedAiCredits,
  InsufficientTokensError,
  recordAiAnalysis,
  UNLIMITED_BALANCE,
  type AiInputType,
} from './_lib/tokens.js'

const PROMPT_VERSION = 'day-v6'

const SYSTEM = `Ты — пищевой ассистент для дневника. Пользователь одним общим голосовым рассказом, текстом и/или фотографиями описывает целый день: еду, воду и заметки. Нужно превратить рассказ и фото в структурированный JSON.

ФОРМАТ ОТВЕТА — только валидный JSON-объект по схеме, без markdown, без пояснений:
{"foods":[<еда>],"notes":[<заметки>],"waterMl":<целое>,"lazy":true,"error":null}
или {"foods":[],"notes":[],"waterMl":0,"lazy":true,"error":"not a day"} если в тексте нет данных для дневника.

Еда foods — до 10 объектов:
{"name":"<короткое название>","grams":<целое>,"kcal":<целое>,"carbs":<целое>,"fat":<целое>,"protein":<целое>,"fiber":<целое|null>,"confidence":<0..1>,"confidenceReason":"<что добавить для точности или пустая строка>","portionBasis":"stated_weight|visual_anchor|label|typical_portion|unknown","basisLabel":"<коротко, откуда взята порция>","brandDataStatus":"not_provided|exact|estimated","brandDataLabel":"<бренд/продукт/источник или пустая строка>"}

ВАЖНО: kcal/carbs/fat/protein/fiber — за указанную порцию grams, НЕ на 100 г.

Правила:
- Русский язык, СНГ-продукты и обычные домашние порции.
- Если есть завтрак/обед/ужин/перекусы — разбирай каждое отдельное блюдо отдельно.
- Если приложены фото — распознай на них еду как отдельные блюда и объедини с текстом/голосом. Если по фото неясно, ставь confidence 0.35-0.6.
- Если вес назван — используй его, portionBasis = "stated_weight", basisLabel = "вес из рассказа".
- Если есть этикетка/бренд/упаковка с пищевой ценностью — используй её, portionBasis = "label".
- Если есть визуальный якорь масштаба на фото — portionBasis = "visual_anchor".
- Если веса/якоря/этикетки нет — оцени типовую порцию, portionBasis = "typical_portion" и ставь confidence 0.35-0.65.
- Если confidence < 0.8 — confidenceReason обязателен: одна короткая русская фраза до 120 символов, которая отвечает пользователю на вопрос «что добавить, чтобы AI посчитал точнее?».
- confidenceReason должен быть конкретным действием для пользователя, а не внутренней причиной AI. Не пиши: «взята типовая порция», «низкая уверенность», «нет контекста».
- Хорошие confidenceReason: «напиши вес порции в граммах или размер: тарелка/ложки/штуки», «сфоткай рядом вилку, ладонь или упаковку для масштаба», «напиши бренд и название с этикетки», «уточни способ приготовления: жареное, с маслом, соусом или без», «покажи/напиши состав соуса и сколько его было».
- Если confidence >= 0.8 — confidenceReason = "".
- Если пользователь называет конкретный бренд или SKU, явно покажи, были ли точные данные продукта подтверждены. Не называй данные точными только по догадке или общей памяти.
- brandDataStatus = "not_provided" если пользователь не указал бренд/SKU и на фото нет бренда/упаковки/этикетки.
- brandDataStatus = "exact" если расчёт взят из точных данных конкретного брендового продукта: этикетка, штрихкод, видимая пищевая ценность, упаковка с точным SKU или подключённая база продуктов.
- brandDataStatus = "estimated" если бренд/SKU указан или виден, но точные КБЖУ продукта не подтверждены. В таком случае confidence не выше 0.6.
- Если пользователь просто назвал бренд без этикетки, штрихкода или данных из базы — это "estimated", не "exact".
- brandDataLabel — коротко: "этикетка ВкусВилл творог 5%" или "бренд указан, точные данные не подтверждены". Для not_provided — пустая строка.
- Для воды считай миллилитры: стакан = 250 мл, кружка = 300 мл, бутылка = 500 мл, литр = 1000 мл, если пользователь не сказал точнее.
- В notes вынеси важные не-пищевые факты дня: самочувствие, тренировка, сон, событие, "болел", "стресс". Не дублируй туда еду и воду.
- Если еды нет, но есть вода или заметки — это валидный день.
- waterMl = 0 если воду не упоминали.
- lazy всегда true: день записан через AI по общему описанию, не точными ручными записями.
- Фото не превращай в notes: notes только для не-пищевых фактов.
- Все числа — неотрицательные, округлённые. Первый символ ответа — {, последний — }.`

const PORTION_BASIS_VALUES = [
  'stated_weight',
  'visual_anchor',
  'label',
  'typical_portion',
  'unknown',
] as const

type PortionBasis = typeof PORTION_BASIS_VALUES[number]

const BRAND_DATA_STATUS_VALUES = ['not_provided', 'exact', 'estimated'] as const

type BrandDataStatus = typeof BRAND_DATA_STATUS_VALUES[number]

const DAY_FOOD_ITEM_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'Короткое русское название блюда или продукта.' },
    grams: { type: 'integer', minimum: 0, maximum: 5000 },
    kcal: { type: 'integer', minimum: 0, maximum: 10000 },
    carbs: { type: 'integer', minimum: 0, maximum: 2000 },
    fat: { type: 'integer', minimum: 0, maximum: 2000 },
    protein: { type: 'integer', minimum: 0, maximum: 2000 },
    fiber: { type: ['integer', 'null'], minimum: 0, maximum: 500 },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    confidenceReason: {
      type: 'string',
      description: 'Что добавить пользователю для более точного расчёта или пустая строка.',
    },
    portionBasis: {
      type: 'string',
      enum: [...PORTION_BASIS_VALUES],
      description: 'На чём основана оценка размера порции.',
    },
    basisLabel: {
      type: 'string',
      description: 'Коротко: вес из рассказа, фото с вилкой, типовая порция, этикетка и т.п.',
    },
    brandDataStatus: {
      type: 'string',
      enum: [...BRAND_DATA_STATUS_VALUES],
      description: 'Подтверждены ли точные данные конкретного брендового продукта.',
    },
    brandDataLabel: {
      type: 'string',
      description: 'Коротко: какой брендовый источник использован или почему это оценка.',
    },
  },
  required: [
    'name',
    'grams',
    'kcal',
    'carbs',
    'fat',
    'protein',
    'fiber',
    'confidence',
    'confidenceReason',
    'portionBasis',
    'basisLabel',
    'brandDataStatus',
    'brandDataLabel',
  ],
  propertyOrdering: [
    'name',
    'grams',
    'kcal',
    'carbs',
    'fat',
    'protein',
    'fiber',
    'confidence',
    'confidenceReason',
    'portionBasis',
    'basisLabel',
    'brandDataStatus',
    'brandDataLabel',
  ],
}

const DAY_RESPONSE_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    foods: { type: 'array', maxItems: 10, items: DAY_FOOD_ITEM_SCHEMA },
    notes: { type: 'array', maxItems: 5, items: { type: 'string' } },
    waterMl: { type: 'integer', minimum: 0, maximum: 10000 },
    lazy: { type: 'boolean' },
    error: { type: ['string', 'null'] },
  },
  required: ['foods', 'notes', 'waterMl', 'lazy', 'error'],
  propertyOrdering: ['foods', 'notes', 'waterMl', 'lazy', 'error'],
}

type ImageIn = { data?: string; mediaType?: string }
type Input = {
  text?: string
  image?: ImageIn | null
  images?: ImageIn[] | null
}

type FoodItem = {
  name: string
  grams: number
  kcal: number
  carbs: number
  fat: number
  protein: number
  fiber?: number
  confidence: number
  confidenceReason?: string
  portionBasis: PortionBasis
  basisLabel?: string
  brandDataStatus: BrandDataStatus
  brandDataLabel?: string
}

type Output =
  | {
      foods: FoodItem[]
      notes: string[]
      waterMl: number
      lazy: true
      balance?: number
      unlimited?: boolean
      analysisId?: number
      debugModel?: DebugModel
    }
  | { error: string; balance?: number; unlimited?: boolean; debugModel?: DebugModel }

type DebugModel = {
  provider: string
  model: string
  fallback?: boolean
}

const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_IMAGES = 5
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024
const MAX_TOTAL_IMAGE_BYTES = 4 * 1024 * 1024

function base64Bytes(data: string): number {
  return Math.ceil(data.length * 0.75)
}

function sanitizeImage(raw: ImageIn | null | undefined): OpenRouterImageInput | null {
  if (!raw || typeof raw !== 'object') return null
  const data = typeof raw.data === 'string' ? raw.data.replace(/^data:[^;]+;base64,/, '') : ''
  const mediaType = typeof raw.mediaType === 'string' ? raw.mediaType : 'image/jpeg'
  if (!data || !ALLOWED_MEDIA.has(mediaType)) return null
  if (base64Bytes(data) > MAX_IMAGE_BYTES) return null
  return { data, mediaType: mediaType as OpenRouterImageInput['mediaType'] }
}

function sanitizeImages(
  single: ImageIn | null | undefined,
  many: ImageIn[] | null | undefined,
): { images: OpenRouterImageInput[]; tooLarge: boolean } {
  const arr: OpenRouterImageInput[] = []
  let totalBytes = 0
  let tooLarge = false
  if (Array.isArray(many)) {
    for (const m of many) {
      const ok = sanitizeImage(m)
      if (!ok) {
        if (m && typeof m === 'object' && typeof m.data === 'string' && m.data) tooLarge = true
        continue
      }
      totalBytes += base64Bytes(ok.data)
      if (totalBytes > MAX_TOTAL_IMAGE_BYTES) {
        tooLarge = true
        break
      }
      arr.push(ok)
      if (arr.length >= MAX_IMAGES) break
    }
  }
  if (arr.length === 0 && !tooLarge) {
    const ok = sanitizeImage(single)
    if (ok) arr.push(ok)
    else if (single && typeof single === 'object' && typeof single.data === 'string' && single.data) {
      tooLarge = true
    }
  }
  return { images: arr, tooLarge }
}

function inputType(text: string, images: OpenRouterImageInput[]): AiInputType {
  if (text && images.length > 0) return 'mixed'
  if (images.length > 0) return 'photo'
  return 'voice'
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback
}

function confidenceReason(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const text = v.trim().replace(/\s+/g, ' ').slice(0, 140)
  return text || undefined
}

function portionBasis(v: unknown): PortionBasis {
  if (typeof v !== 'string') return 'unknown'
  return PORTION_BASIS_VALUES.includes(v as PortionBasis) ? v as PortionBasis : 'unknown'
}

function brandDataStatus(v: unknown): BrandDataStatus {
  if (typeof v !== 'string') return 'not_provided'
  return BRAND_DATA_STATUS_VALUES.includes(v as BrandDataStatus)
    ? v as BrandDataStatus
    : 'not_provided'
}

function basisLabel(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const text = v.trim().replace(/\s+/g, ' ').slice(0, 80)
  return text || undefined
}

function brandDataLabel(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const text = v.trim().replace(/\s+/g, ' ').slice(0, 120)
  return text || undefined
}

function debugModelOut(
  expose: boolean,
  provider: string,
  model: string,
): { debugModel?: DebugModel } {
  return expose
    ? { debugModel: { provider, model, ...(provider !== 'openrouter' ? { fallback: true } : {}) } }
    : {}
}

function parseItem(raw: unknown): FoodItem | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = String(r.name ?? '').trim().slice(0, 80)
  if (!name) return null
  const item: FoodItem = {
    name,
    grams: num(r.grams, 100),
    kcal: num(r.kcal),
    carbs: num(r.carbs),
    fat: num(r.fat),
    protein: num(r.protein),
    confidence: Math.max(0, Math.min(1, Number(r.confidence ?? 0.5))),
    portionBasis: portionBasis(r.portionBasis),
    brandDataStatus: brandDataStatus(r.brandDataStatus),
  }
  if (r.fiber !== null && r.fiber !== undefined) {
    const f = num(r.fiber, -1)
    if (f >= 0) item.fiber = f
  }
  const reason = confidenceReason(r.confidenceReason)
  if (reason) item.confidenceReason = reason
  const label = basisLabel(r.basisLabel)
  if (label) item.basisLabel = label
  const brandLabel = brandDataLabel(r.brandDataLabel)
  if (brandLabel) item.brandDataLabel = brandLabel
  return item
}

function parseNotes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    const text = String(item ?? '').trim().replace(/\s+/g, ' ').slice(0, 160)
    if (text) out.push(text)
    if (out.length >= 5) break
  }
  return out
}

function avgConfidence(items: FoodItem[]): number | null {
  if (items.length === 0) return null
  return items.reduce((sum, item) => sum + item.confidence, 0) / items.length
}

async function refundIfNeeded(
  userId: number | null,
  debited: boolean,
  reason: string,
): Promise<number | undefined> {
  if (userId === null || !debited) return undefined
  try {
    return await credit(userId, 1, 'refund', { reason })
  } catch (refundErr) {
    console.error('[parse-day] refund failed:', refundErr)
    return undefined
  }
}

export default createRoute<Input, Output>(async ({ input, userId }) => {
  const text = String(input.text ?? '').trim().slice(0, 4000)
  const { images, tooLarge } = sanitizeImages(input.image, input.images)
  if (tooLarge) return { error: 'too-large' }
  if (!text && images.length === 0) return { error: 'empty' }
  const unlimited = hasUnlimitedAiCredits(userId)
  const unlimitedOut = unlimited ? { unlimited: true as const } : {}
  const exposeDebugModel = unlimited || process.env.ALLOW_UNAUTH === '1'

  let balance: number | undefined = unlimited ? UNLIMITED_BALANCE : undefined
  let debited = false
  if (userId !== null) {
    try {
      await ensureUser(userId)
      balance = await debit(userId, 1, 'parse-food', { route: 'parse-day', hasImages: images.length > 0 })
      debited = true
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        return { error: 'insufficient-tokens', balance: err.balance }
      }
      throw err
    }
  }

  let raw: {
    foods?: unknown[]
    notes?: unknown
    waterMl?: unknown
    lazy?: unknown
    error?: string | null
  }
  const modelProvider = 'openrouter'
  const modelName = MODEL_ID_VISION
  try {
    const userMsg =
      text ||
      (images.length > 1
        ? `Разбери день по фотографиям еды (${images.length} шт.). Воды и заметок нет, если они не видны/не названы.`
        : 'Разбери день по фотографии еды. Воды и заметок нет, если они не видны/не названы.')
    raw = await askOpenRouterJson({
      system: SYSTEM,
      user: userMsg,
      images,
      model: MODEL_ID_VISION,
      maxTokens: 4800,
      schema: {
        name: 'day_response',
        schema: DAY_RESPONSE_SCHEMA,
      },
      usage: { route: 'parse-day', userId },
    })
  } catch (err) {
    balance = await refundIfNeeded(userId, debited, 'parse-day-failed')
    throw err
  }

  if (raw.error) {
    balance = await refundIfNeeded(userId, debited, 'parse-day-unusable')
    return { error: raw.error, balance, ...unlimitedOut, ...debugModelOut(exposeDebugModel, modelProvider, modelName) }
  }

  const foods: FoodItem[] = []
  if (Array.isArray(raw.foods)) {
    for (const it of raw.foods) {
      const parsed = parseItem(it)
      if (parsed) foods.push(parsed)
      if (foods.length >= 10) break
    }
  }
  const notes = parseNotes(raw.notes)
  const waterMl = Math.min(10000, num(raw.waterMl))

  if (foods.length === 0 && notes.length === 0 && waterMl === 0) {
    balance = await refundIfNeeded(userId, debited, 'parse-day-empty')
    return { error: 'empty', balance, ...unlimitedOut }
  }

  let analysisId: number | undefined
  if (userId !== null) {
    analysisId = await recordAiAnalysis({
      userId,
      inputType: inputType(text, images),
      modelProvider,
      modelName,
      promptVersion: PROMPT_VERSION,
      rawInputText: text || null,
      resultJson: { foods, notes, waterMl, lazy: true },
      confidence: avgConfidence(foods),
      status: 'success',
    })
  }

  return { foods, notes, waterMl, lazy: true,
    balance,
    ...unlimitedOut,
    analysisId,
    ...debugModelOut(exposeDebugModel, modelProvider, modelName),
  }
})
