import { createHmac, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { creditsByTributeProductId } from './_lib/credit-packages.js'
import { creditPurchaseOnce } from './_lib/tokens.js'

type TributeWebhook = {
  name?: string
  created_at?: string
  sent_at?: string
  payload?: Record<string, unknown>
}

async function rawBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === 'string') return req.body
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body)

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function verifySignature(body: string, signature: string | undefined, apiKey: string): boolean {
  if (!signature) return false
  const received = signature.trim().replace(/^sha256=/i, '')
  const expected = createHmac('sha256', apiKey).update(body).digest('hex')
  const a = Buffer.from(received, 'hex')
  const b = Buffer.from(expected, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

function num(v: unknown): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const apiKey = process.env.TRIBUTE_API_KEY
  if (!apiKey) {
    console.error('[tribute] TRIBUTE_API_KEY is not set')
    res.status(500).json({ error: 'not configured' })
    return
  }

  const body = await rawBody(req)
  const signature = Array.isArray(req.headers['trbt-signature'])
    ? req.headers['trbt-signature'][0]
    : req.headers['trbt-signature']
  if (!verifySignature(body, signature, apiKey)) {
    res.status(401).json({ error: 'invalid signature' })
    return
  }

  let event: TributeWebhook
  try {
    event = JSON.parse(body) as TributeWebhook
  } catch {
    res.status(400).json({ error: 'invalid JSON' })
    return
  }

  if (event.name !== 'new_digital_product') {
    // Refund/revocation будет отдельным шагом: для MVP покупка должна быть
    // идемпотентной, а неподдержанные события нельзя ретраить бесконечно.
    res.status(200).json({ status: 'ok', ignored: true })
    return
  }

  const payload = event.payload ?? {}
  const productId = num(payload.product_id)
  const telegramUserId = num(payload.telegram_user_id)
  const purchaseId = str(payload.purchase_id) ?? str(payload.order_id) ?? null
  if (!productId || !telegramUserId || !purchaseId) {
    res.status(400).json({ error: 'missing payment payload' })
    return
  }

  const credits = creditsByTributeProductId(productId)
  if (!credits) {
    res.status(400).json({ error: 'unknown product' })
    return
  }

  const amountMinor = num(payload.amount) ?? 0
  const currency = (str(payload.currency) ?? 'RUB').toUpperCase()
  const result = await creditPurchaseOnce({
    userId: telegramUserId,
    provider: 'tribute',
    externalId: purchaseId,
    amountMinor,
    currency,
    credits,
    meta: {
      productId,
      productName: str(payload.product_name),
      tributeUserId: str(payload.trb_user_id),
      telegramUsername: str(payload.telegram_username),
    },
  })

  res.status(200).json({ status: 'ok', credited: result.credited, balance: result.balance })
}
