export type AiCreditPackage = {
  id: 'ai30' | 'ai100' | 'ai300'
  title: string
  credits: number
  priceLabel: string
  tributeProductId: number | null
  paymentUrl: string | null
}

function intEnv(name: string): number | null {
  const raw = process.env[name]
  if (!raw) return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function urlEnv(name: string): string | null {
  const raw = process.env[name]?.trim()
  return raw ? raw : null
}

export function aiCreditPackages(): AiCreditPackage[] {
  return [
    {
      id: 'ai30',
      title: '30 AI-кредитов',
      credits: 30,
      priceLabel: '199 ₽',
      tributeProductId: intEnv('TRIBUTE_PRODUCT_30_ID'),
      paymentUrl: urlEnv('TRIBUTE_PRODUCT_30_URL'),
    },
    {
      id: 'ai100',
      title: '100 AI-кредитов',
      credits: 100,
      priceLabel: '599 ₽',
      tributeProductId: intEnv('TRIBUTE_PRODUCT_100_ID'),
      paymentUrl: urlEnv('TRIBUTE_PRODUCT_100_URL'),
    },
    {
      id: 'ai300',
      title: '300 AI-кредитов',
      credits: 300,
      priceLabel: '1490 ₽',
      tributeProductId: intEnv('TRIBUTE_PRODUCT_300_ID'),
      paymentUrl: urlEnv('TRIBUTE_PRODUCT_300_URL'),
    },
  ]
}

export function creditsByTributeProductId(productId: number): number | null {
  return aiCreditPackages().find((p) => p.tributeProductId === productId)?.credits ?? null
}
