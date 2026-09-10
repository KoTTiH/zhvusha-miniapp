import { createRoute } from './_lib/handler.js'
import {
  askJson as askOpenRouterJson,
  MODEL_ID_V4_LITE,
  MODEL_ID_VISION,
  type OpenRouterImageInput,
  type OpenRouterJsonSchema,
} from './_lib/openrouter.js'
import {
  assertCanRefine,
  credit,
  debit,
  ensureUser,
  hasUnlimitedAiCredits,
  InsufficientTokensError,
  recordAiAnalysis,
  UNLIMITED_BALANCE,
  type AiInputType,
} from './_lib/tokens.js'

const PROMPT_VERSION = 'food-v7'

const SYSTEM = `Ты — пищевой ассистент. Определяешь состав, вес порции и калорийность по описанию и/или фото еды. Описание может содержать несколько блюд (перечисление через запятую, список «на завтрак…/на обед…», голосовой рассказ о еде за день). Каждое отдельное блюдо разбираешь отдельно.

Если пользователь называет конкретный бренд или SKU российской сети (ВкусВилл, Magnit, Пятёрочка, Перекрёсток, Лента, Ашан, Яндекс.Лавка, Самокат, Дикси, Окей, Мираторг, Сыробогатов, Простоквашино, Danone-Актимель и т.п.) или бренд виден на фото — распознай бренд и конкретное название продукта настолько точно, насколько позволяет вход.
Не называй данные точными только по догадке или общей памяти. brandDataStatus = "exact" ставь только если есть этикетка/упаковка/штрихкод/явная пищевая ценность в предоставленных данных или результат пришёл из подключённой базы продуктов. Если бренд указан, но точные данные продукта не подтверждены — brandDataStatus = "estimated", confidence не выше 0.6, это типовая оценка. Если бренд не указан и не виден — brandDataStatus = "not_provided".

ФОРМАТ ОТВЕТА — только валидный JSON-объект по схеме, без markdown, без пояснений, без текста до или после JSON:
{"items":[<список объектов>],"error":null} или {"items":[],"error":"not food"} если это не еда.

Каждый элемент items — объект:
{"name":"<короткое название>","grams":<целое>,"kcal":<целое>,"carbs":<целое>,"fat":<целое>,"protein":<целое>,"fiber":<целое|null>,"confidence":<0..1>,"confidenceReason":"<что добавить для точности или пустая строка>","portionBasis":"stated_weight|visual_anchor|label|typical_portion|unknown","basisLabel":"<коротко, откуда взята порция>","brandDataStatus":"not_provided|exact|estimated","brandDataLabel":"<бренд/продукт/источник или пустая строка>"}

ВАЖНО: kcal/carbs/fat/protein/fiber — за указанную порцию grams, НЕ на 100 г.

ПРАВИЛА ДЛЯ SCALE:
- Если пользователь дал вес текстом («400г», «пол-тарелки», «маленькая чашка») — бери оттуда, confidence 0.85+, portionBasis = "stated_weight", basisLabel = "вес из текста".
- Если есть этикетка/бренд/штрихкод/упаковка с пищевой ценностью — используй её, confidence 0.85+, portionBasis = "label", basisLabel = "этикетка/бренд".
- Если только фото — найди в кадре якорь масштаба (столовый прибор, рука/пальцы, упаковка с брендом, монета, телефон, соседняя посуда). Если якорь есть: portionBasis = "visual_anchor".
- Если ни веса, ни якоря нет — оцени типовую порцию, portionBasis = "typical_portion" и выстави confidence 0.3-0.5 у этого конкретного блюда, чтобы пользователь видел: AI угадал.

CONFIDENCE (для каждого элемента отдельно):
- 0.85–1.0 — пользователь назвал вес ИЛИ в кадре явный якорь масштаба.
- 0.6–0.84 — разумная оценка без явного якоря (типовая порция, узнаваемая посуда).
- ниже 0.5 — «хлеб», «кофе» без контекста; AI взял типовые значения.
- Если confidence < 0.8 — confidenceReason обязателен: одна короткая русская фраза до 120 символов, которая отвечает пользователю на вопрос «что добавить, чтобы AI посчитал точнее?».
- confidenceReason должен быть конкретным действием для пользователя, а не внутренней причиной AI. Не пиши: «взята типовая порция», «низкая уверенность», «нет контекста».
- Хорошие confidenceReason: «напиши вес порции в граммах или размер: тарелка/ложки/штуки», «сфоткай рядом вилку, ладонь или упаковку для масштаба», «напиши бренд и название с этикетки», «уточни способ приготовления: жареное, с маслом, соусом или без», «покажи/напиши состав соуса и сколько его было».
- Если confidence >= 0.8 — confidenceReason = "".

BRAND DATA:
- brandDataStatus = "not_provided" если пользователь не указал бренд/SKU и на фото нет бренда/упаковки/этикетки.
- brandDataStatus = "exact" если расчёт взят из точных данных конкретного брендового продукта: этикетка, штрихкод, видимая пищевая ценность, упаковка с точным SKU или подключённая база продуктов.
- brandDataStatus = "estimated" если бренд/SKU указан или виден, но точные КБЖУ продукта не подтверждены. Не скрывай это в confidenceReason.
- Если пользователь просто назвал бренд без этикетки, штрихкода или данных из базы — это "estimated", не "exact".
- Для estimated обязательно назови распознанный бренд/продукт в brandDataLabel. Не пиши общую фразу "бренд указан". Пиши конкретно: "ВкусВилл · сэндвич Нежный · точные данные не подтверждены".
- brandDataLabel — коротко: "этикетка ВкусВилл творог 5%" или "ВкусВилл · сэндвич Нежный · точные данные не подтверждены". Для not_provided — пустая строка.

ОБЩЕЕ:
- Русский язык, СНГ-продукты и бренды.
- Все числа в JSON — целые (округление до целого), confidence — дробь 0..1.
- Если это не еда — верни {"items":[],"error":"not food"}.
- Если ровно одно блюдо — массив items из одного элемента.
- Максимум 10 элементов в items (для очень длинных описаний отрежь остальное).
- Без прелюдии и послесловия. Первый символ ответа — {, последний — }.`

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

type RawFoodResponse = {
  items?: unknown[]
  error?: string
  name?: string
  grams?: number
  kcal?: number
  carbs?: number
  fat?: number
  protein?: number
  fiber?: number | null
  confidence?: number
  confidenceReason?: string
  portionBasis?: string
  basisLabel?: string
  brandDataStatus?: string
  brandDataLabel?: string
}

const FOOD_ITEM_SCHEMA: OpenRouterJsonSchema = {
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
      description: 'Коротко: вес из текста, фото с вилкой, типовая порция, этикетка и т.п.',
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

const FOOD_RESPONSE_SCHEMA: OpenRouterJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: { type: 'array', maxItems: 10, items: FOOD_ITEM_SCHEMA },
    error: { type: ['string', 'null'] },
  },
  required: ['items', 'error'],
  propertyOrdering: ['items', 'error'],
}

type ImageIn = { data?: string; mediaType?: string }
type BillingInput = {
  mode?: 'primary' | 'refine'
  parentAnalysisId?: number | null
}
type Input = {
  text?: string
  image?: ImageIn | null
  images?: ImageIn[] | null
  billing?: BillingInput | null
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
      items: FoodItem[]
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
const KNOWN_BRANDS = [
  { label: 'ВкусВилл', aliases: ['вкусвилл', 'вкус вилл', 'vkusvill', 'vkus vill'] },
] as const

const MAX_IMAGES = 5
// Клиент сжимает в ~200–300 КБ JPEG (imageCapture.ts). 2.5 МБ на кадр —
// потолок для случаев, когда фото грузят не через наш input (браузер на PC,
// curl). Выше — либо сырое фото без нашей сжатия, либо умышленный DoS.
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024
// Vercel Hobby body-limit — 4.5 МБ. Оставляем запас под JSON overhead
// и текстовое описание, поэтому суммарно 4 МБ на все картинки.
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
        // sanitizeImage вернул null — либо невалидный формат, либо слишком большой.
        // Если data был, но отсечён — помечаем, чтобы клиент увидел честный error.
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
  return 'text'
}

function avgConfidence(items: FoodItem[]): number {
  if (items.length === 0) return 0
  return items.reduce((sum, item) => sum + item.confidence, 0) / items.length
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

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function knownBrandInText(value: string): string | undefined {
  const normalized = normalizeText(value)
  return KNOWN_BRANDS.find((brand) =>
    brand.aliases.some((alias) => normalized.includes(normalizeText(alias))),
  )?.label
}

function looksGenericBrandLabel(value?: string): boolean {
  if (!value) return true
  const normalized = normalizeText(value)
  return normalized === 'бренд указан точные данные не подтверждены' ||
    normalized === 'точные данные не подтверждены' ||
    normalized === 'бренд sku указан точные данные не подтверждены'
}

function enrichBrandLabels(items: FoodItem[], sourceText: string): FoodItem[] {
  const brand = knownBrandInText(sourceText)
  if (!brand) return items
  return items.map((item) => {
    if (item.brandDataStatus === 'exact') return item
    if (item.brandDataStatus === 'not_provided') {
      return {
        ...item,
        brandDataStatus: 'estimated',
        confidence: Math.min(item.confidence, 0.6),
        brandDataLabel: `${brand} · ${item.name} · точные данные не подтверждены`,
      }
    }
    if (!looksGenericBrandLabel(item.brandDataLabel) && item.brandDataLabel?.includes(brand)) return item
    return {
      ...item,
      confidence: Math.min(item.confidence, 0.6),
      brandDataLabel: `${brand} · ${item.name} · точные данные не подтверждены`,
    }
  })
}

function debugModelOut(
  expose: boolean,
  provider: string,
  model: string,
  fallback: boolean,
): { debugModel?: DebugModel } {
  return expose
    ? { debugModel: { provider, model, ...(fallback ? { fallback: true } : {}) } }
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
    confidence: Math.max(0, Math.min(1, Number(r.confidence ?? 0))),
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

export default createRoute<Input, Output>(async ({ input, userId }) => {
  const text = String(input.text ?? '').trim().slice(0, 2000)
  const { images, tooLarge } = sanitizeImages(input.image, input.images)
  if (tooLarge) return { error: 'too-large' }
  if (!text && images.length === 0) return { error: 'empty' }
  const unlimited = hasUnlimitedAiCredits(userId)
  const unlimitedOut = unlimited ? { unlimited: true as const } : {}
  const exposeDebugModel = unlimited || process.env.ALLOW_UNAUTH === '1'

  const billing = input.billing && typeof input.billing === 'object' ? input.billing : null
  const billingMode = billing?.mode === 'refine' ? 'refine' : 'primary'
  const parentAnalysisId = Number(billing?.parentAnalysisId)

  // Списание 1 AI-кредита только за первичный food-анализ. Уточнения результата
  // бесплатны, но в prod требуют parentAnalysisId успешного разбора этого юзера.
  let balance: number | undefined = unlimited ? UNLIMITED_BALANCE : undefined
  let debited = false
  if (userId !== null) {
    try {
      if (billingMode === 'refine') {
        if (!Number.isInteger(parentAnalysisId) || parentAnalysisId <= 0) {
          return { error: 'invalid-refine', balance, ...unlimitedOut }
        }
        await assertCanRefine(userId, parentAnalysisId)
      } else {
        await ensureUser(userId)
        balance = await debit(userId, 1, 'parse-food', { hasImages: images.length > 0 })
        debited = true
      }
    } catch (err) {
      if (err instanceof InsufficientTokensError) {
        return { error: 'insufficient-tokens', balance: err.balance }
      }
      if (err instanceof Error && err.message === 'invalid-refine-parent') {
        return { error: 'invalid-refine', balance, ...unlimitedOut }
      }
      throw err
    }
  }

  const userMsg =
    text ||
    (images.length > 1
      ? `Определи все блюда и калорийность по фотографиям (${images.length} шт.). Каждое фото может содержать одно или несколько блюд.`
      : 'Определи блюдо и калорийность по фото.')

  let raw: RawFoodResponse
  const modelProvider = 'openrouter'
  let modelName = images.length === 0 ? MODEL_ID_V4_LITE : MODEL_ID_VISION
  let modelFallback = false
  try {
    const modelUserMsg = billingMode === 'refine'
      ? `Это бесплатное уточнение уже оплаченного AI-кредита. Пересчитай результат с учётом контекста: ${userMsg}`
      : userMsg
    if (images.length === 0) {
      try {
        raw = await askOpenRouterJson<RawFoodResponse>({
          system: SYSTEM,
          user: modelUserMsg,
          model: MODEL_ID_V4_LITE,
          maxTokens: 4800,
          schema: {
            name: 'food_response',
            schema: FOOD_RESPONSE_SCHEMA,
          },
          usage: { route: 'parse-food', userId },
        })
      } catch (openRouterErr) {
        modelName = MODEL_ID_VISION
        modelFallback = true
        console.warn(
          '[parse-food] OpenRouter V4 failure, falling back to OpenRouter vision model:',
          openRouterErr instanceof Error ? openRouterErr.message : openRouterErr,
        )
        raw = await askOpenRouterJson<RawFoodResponse>({
          system: SYSTEM,
          user: modelUserMsg,
          images,
          model: MODEL_ID_VISION,
          maxTokens: 4800,
          schema: {
            name: 'food_response',
            schema: FOOD_RESPONSE_SCHEMA,
          },
          usage: { route: 'parse-food', userId },
        })
      }
    } else {
      raw = await askOpenRouterJson<RawFoodResponse>({
        system: SYSTEM,
        user: modelUserMsg,
        images,
        model: MODEL_ID_VISION,
        maxTokens: 4800,
        schema: {
          name: 'food_response',
          schema: FOOD_RESPONSE_SCHEMA,
        },
        usage: { route: 'parse-food', userId },
      })
    }
  } catch (err) {
    // AI упал — refund только если этот запрос реально списал AI-кредит.
    if (userId !== null && debited) {
      try {
        balance = await credit(userId, 1, 'refund', { reason: 'parse-food-failed' })
      } catch (refundErr) {
        console.error('[parse-food] refund failed:', refundErr)
      }
    }
    throw err
  }

  if (raw.error) {
    if (userId !== null && debited) {
      try {
        balance = await credit(userId, 1, 'refund', { reason: 'parse-food-unusable', error: raw.error })
      } catch (refundErr) {
        console.error('[parse-food] refund failed:', refundErr)
      }
    }
    return {
      error: raw.error,
      balance,
      ...unlimitedOut,
      ...debugModelOut(exposeDebugModel, modelProvider, modelName, modelFallback),
    }
  }

  const items: FoodItem[] = []
  if (Array.isArray(raw.items)) {
    for (const it of raw.items) {
      const parsed = parseItem(it)
      if (parsed) items.push(parsed)
      if (items.length >= 10) break
    }
  }
  // Legacy fallback: старый формат одиночного объекта.
  if (items.length === 0 && raw.name) {
    const parsed = parseItem(raw)
    if (parsed) items.push(parsed)
  }
  const enrichedItems = enrichBrandLabels(items, text)

  if (enrichedItems.length === 0) {
    if (userId !== null && debited) {
      try {
        balance = await credit(userId, 1, 'refund', { reason: 'parse-food-empty' })
      } catch (refundErr) {
        console.error('[parse-food] refund failed:', refundErr)
      }
    }
    return { error: 'empty', balance, ...unlimitedOut }
  }

  let analysisId: number | undefined
  if (userId !== null) {
    analysisId = await recordAiAnalysis({
      userId,
      parentAnalysisId: billingMode === 'refine' && Number.isInteger(parentAnalysisId)
        ? parentAnalysisId
        : null,
      inputType: inputType(text, images),
      modelProvider,
      modelName,
      promptVersion: PROMPT_VERSION,
      rawInputText: text || null,
      resultJson: { items: enrichedItems },
      confidence: avgConfidence(enrichedItems),
      status: 'success',
    })
  }

  return {
    items: enrichedItems,
    balance,
    ...unlimitedOut,
    analysisId,
    ...debugModelOut(exposeDebugModel, modelProvider, modelName, modelFallback),
  }
})
