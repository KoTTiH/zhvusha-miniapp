import { aiCreditPackages } from './_lib/credit-packages.js'
import { createRoute } from './_lib/handler.js'

type Input = Record<string, never>
type Output = {
  packages: Array<{
    id: string
    title: string
    credits: number
    priceLabel: string
    paymentUrl: string | null
  }>
}

export default createRoute<Input, Output>(async () => {
  return {
    packages: aiCreditPackages().map((p) => ({
      id: p.id,
      title: p.title,
      credits: p.credits,
      priceLabel: p.priceLabel,
      paymentUrl: p.paymentUrl,
    })),
  }
})
