import { roundG } from './nutrition'

export interface OffProduct {
  barcode: string
  name: string
  brand?: string
  per100g: {
    kcal: number
    carbs: number
    fat: number
    protein: number
    fiber?: number
    kcalEstimated?: boolean
  }
}

const ENDPOINT = 'https://world.openfoodfacts.org/api/v2/product'
const FIELDS = 'product_name,brands,nutriments,code'

export async function lookupBarcode(
  code: string,
  signal?: AbortSignal,
): Promise<OffProduct | null> {
  if (!code) return null
  try {
    const url = `${ENDPOINT}/${encodeURIComponent(code)}.json?fields=${FIELDS}`
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const json: unknown = await res.json()
    return parseOffResponse(code, json)
  } catch {
    return null
  }
}

function parseOffResponse(code: string, raw: unknown): OffProduct | null {
  if (!isObject(raw)) return null
  if (raw.status !== 1) return null
  const product = raw.product
  if (!isObject(product)) return null
  const name = readString(product.product_name)
  if (!name) return null

  const brand = readString(product.brands)?.split(',')[0]?.trim() || undefined

  const nutriments = isObject(product.nutriments) ? product.nutriments : {}

  const kcal = readNumber(nutriments['energy-kcal_100g'])
  const carbs = readNumber(nutriments.carbohydrates_100g)
  const fat = readNumber(nutriments.fat_100g)
  const protein = readNumber(nutriments.proteins_100g)
  const fiber = readNumber(nutriments.fiber_100g)

  if (kcal === undefined && carbs === undefined && fat === undefined && protein === undefined) {
    return null
  }
  const kcalEstimated = kcal === undefined
  const kcalValue = kcal ?? kcalFromOpenFoodFactsMacros({
    carbs: carbs ?? 0,
    fat: fat ?? 0,
    protein: protein ?? 0,
    fiber: fiber ?? 0,
  })

  return {
    barcode: code,
    name,
    brand,
    per100g: {
      kcal: roundG(kcalValue),
      carbs: roundG(carbs ?? 0),
      fat: roundG(fat ?? 0),
      protein: roundG(protein ?? 0),
      ...(fiber !== undefined ? { fiber: roundG(fiber) } : {}),
      ...(kcalEstimated ? { kcalEstimated } : {}),
    },
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function kcalFromOpenFoodFactsMacros(macros: {
  carbs: number
  fat: number
  protein: number
  fiber: number
}): number {
  return macros.carbs * 4 + macros.fat * 9 + macros.protein * 4 + macros.fiber * 2
}

function readString(x: unknown): string | undefined {
  if (typeof x !== 'string') return undefined
  const trimmed = x.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function readNumber(x: unknown): number | undefined {
  if (typeof x !== 'number' || !Number.isFinite(x)) return undefined
  return x
}
