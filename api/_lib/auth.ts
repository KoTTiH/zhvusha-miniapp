import { createHmac } from 'node:crypto'

/**
 * Validate Telegram WebApp initData signature per official scheme:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * secret = HMAC_SHA256(bot_token, "WebAppData")
 * expected_hash = HMAC_SHA256(data_check_string, secret)
 *
 * Returns parsed user id on success, null on failure.
 * Also returns null if initData is stale (> 1 hour).
 */
export function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 3600,
): { userId: number | null } | null {
  if (!initData || !botToken) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null
  params.delete('hash')

  const pairs: string[] = []
  params.forEach((value, key) => pairs.push(`${key}=${value}`))
  pairs.sort()
  const dataCheckString = pairs.join('\n')

  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(dataCheckString).digest('hex')
  if (expected !== hash) return null

  const authDateStr = params.get('auth_date')
  if (authDateStr) {
    const authDate = Number(authDateStr)
    if (Number.isFinite(authDate)) {
      const nowSec = Math.floor(Date.now() / 1000)
      if (nowSec - authDate > maxAgeSec) return null
    }
  }

  let userId: number | null = null
  const userRaw = params.get('user')
  if (userRaw) {
    try {
      const user = JSON.parse(userRaw) as { id?: number }
      if (typeof user.id === 'number') userId = user.id
    } catch {
      /* ignore */
    }
  }
  return { userId }
}

/**
 * Extract initData from request. Tries Authorization header (tma <initData>),
 * then x-init-data header, then body.initData field.
 */
export function readInitData(req: {
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}): string | null {
  const auth = req.headers['authorization']
  if (typeof auth === 'string') {
    const m = auth.match(/^tma\s+(.+)$/i)
    if (m) return m[1]
  }
  const xInit = req.headers['x-init-data']
  if (typeof xInit === 'string') return xInit
  if (Array.isArray(xInit) && xInit[0]) return xInit[0]
  if (req.body && typeof req.body === 'object' && 'initData' in req.body) {
    const v = (req.body as { initData?: unknown }).initData
    if (typeof v === 'string') return v
  }
  return null
}

/**
 * Auth-bypass открывается только для локального Vite-дев-сервера и только
 * по явному флагу ALLOW_UNAUTH=1. Любой деплой на Vercel (prod/preview/any)
 * всегда валидирует HMAC — иначе preview-домены превращались бы в открытые
 * ручки к платным AI API для всего интернета.
 */
export function isDevBypass(): boolean {
  if (process.env.VERCEL) return false
  return process.env.ALLOW_UNAUTH === '1'
}
