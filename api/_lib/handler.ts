import type { VercelRequest, VercelResponse } from '@vercel/node'
import { CORS_HEADERS } from './cors.js'
import { isDevBypass, readInitData, validateInitData } from './auth.js'

type Handler<TIn, TOut> = (args: {
  input: TIn
  userId: number | null
}) => Promise<TOut>

/**
 * Общая подготовка запроса: CORS, OPTIONS-preflight, валидация метода,
 * разбор x-init-data, парсинг JSON-тела.
 * Возвращает `null`, если ответ уже написан в res (ошибка/preflight) —
 * вызывающий обработчик должен немедленно return.
 */
async function prepare(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ input: unknown; userId: number | null } | null> {
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.setHeader(k, v)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return null
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return null
  }

  let userId: number | null = null
  const initData = readInitData(req)
  const botToken = process.env.TELEGRAM_BOT_TOKEN

  if (isDevBypass()) {
    userId = null
  } else if (!initData || !botToken) {
    res.status(401).json({ error: 'Missing initData' })
    return null
  } else {
    const auth = validateInitData(initData, botToken)
    if (!auth) {
      res.status(401).json({ error: 'Invalid initData' })
      return null
    }
    userId = auth.userId
  }

  let body: unknown = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      res.status(400).json({ error: 'Invalid JSON' })
      return null
    }
  }
  if (!body || typeof body !== 'object') body = {}

  return { input: body, userId }
}

/**
 * Wrap a route: CORS + OPTIONS + initData validation + JSON body parsing +
 * error normalization. The inner handler only deals with typed input/output.
 */
export function createRoute<TIn, TOut>(handler: Handler<TIn, TOut>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    const prepared = await prepare(req, res)
    if (!prepared) return
    try {
      const out = await handler({ input: prepared.input as TIn, userId: prepared.userId })
      res.status(200).json(out)
    } catch (err) {
      // В prod клиенту отдаём нейтральный 'internal' — иначе в текст ошибки
      // могут утечь детали SDK (provider, endpoint, ключ API в traceback).
      // Полное сообщение остаётся в serverless-логе Vercel.
      const message = err instanceof Error ? err.message : 'unknown'
      console.error('[api] error:', message)
      const reveal = !process.env.VERCEL || process.env.VERCEL_ENV !== 'production'
      res.status(500).json({ error: reveal ? message : 'internal' })
    }
  }
}
