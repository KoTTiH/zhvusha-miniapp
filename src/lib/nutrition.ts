import type {
  Food,
  FoodEntry,
  Goal,
  MacroTotals,
  MealType,
  ResolvedEntry,
  Serving,
} from '../types/calorie'

export const KCAL_PER_G = { carbs: 4, fat: 9, protein: 4, fiber: 2, alcohol: 7 } as const
export const ETHANOL_DENSITY_G_PER_ML = 0.789

export function drinkToAlcoholG(ml: number, abvPercent: number): number {
  if (!Number.isFinite(ml) || !Number.isFinite(abvPercent)) return 0
  if (ml <= 0 || abvPercent <= 0) return 0
  return ml * (abvPercent / 100) * ETHANOL_DENSITY_G_PER_ML
}

export function mealByTime(date: Date = new Date()): MealType {
  const h = date.getHours()
  if (h >= 4 && h < 11) return 'b'
  if (h >= 11 && h < 16) return 'l'
  if (h >= 16 && h < 22) return 'd'
  return 's'
}

export function resolveEntry(
  entry: FoodEntry,
  foods: Record<string, Food | undefined>,
): ResolvedEntry {
  if (entry.quickAdd && !entry.foodId) {
    const qa = entry.quickAdd
    const q = entry.quantity || 1
    return {
      entry,
      name: qa.name || 'Быстрая запись',
      servingLabel: '',
      kcal: qa.kcal * q,
      carbs: (qa.carbs ?? 0) * q,
      fat: (qa.fat ?? 0) * q,
      protein: (qa.protein ?? 0) * q,
      fiber: (qa.fiber ?? 0) * q,
      alcohol: (qa.alcohol ?? 0) * q,
      isQuick: true,
      missing: false,
      ...(qa.estimate ? { estimate: qa.estimate } : {}),
    }
  }
  if (entry.foodId && entry.servingId) {
    const food = foods[entry.foodId]
    const serving = food?.servings.find((s) => s.id === entry.servingId)
    if (food && serving) {
      const q = entry.quantity || 1
      return {
        entry,
        name: food.name,
        servingLabel: serving.label,
        kcal: serving.kcal * q,
        carbs: serving.carbs * q,
        fat: serving.fat * q,
        protein: serving.protein * q,
        fiber: (serving.fiber ?? 0) * q,
        alcohol: (serving.alcohol ?? 0) * q,
        isQuick: false,
        missing: false,
        ...(food.estimate ? { estimate: food.estimate } : {}),
      }
    }
  }
  return {
    entry,
    name: entry.quickAdd?.name ?? 'Удалённый продукт',
    servingLabel: '',
    kcal: 0,
    carbs: 0,
    fat: 0,
    protein: 0,
    fiber: 0,
    alcohol: 0,
    isQuick: false,
    missing: true,
  }
}

export function entryTotal(resolved: ResolvedEntry): MacroTotals {
  return {
    kcal: resolved.kcal,
    carbs: resolved.carbs,
    fat: resolved.fat,
    protein: resolved.protein,
    fiber: resolved.fiber,
    alcohol: resolved.alcohol,
  }
}

export function sumTotals(list: Iterable<MacroTotals>): MacroTotals {
  const acc: MacroTotals = { kcal: 0, carbs: 0, fat: 0, protein: 0, fiber: 0, alcohol: 0 }
  for (const t of list) {
    acc.kcal += t.kcal
    acc.carbs += t.carbs
    acc.fat += t.fat
    acc.protein += t.protein
    acc.fiber += t.fiber
    acc.alcohol += t.alcohol
  }
  return acc
}

export function computeDayKcal(
  entries: FoodEntry[] | undefined,
  foods: Record<string, Food | undefined>,
): number {
  if (!entries || entries.length === 0) return 0
  let total = 0
  for (const e of entries) {
    const r = resolveEntry(e, foods)
    total += r.kcal
  }
  return total
}

export function expectedKcalFromMacros(serving: {
  carbs: number
  fat: number
  protein: number
  fiber?: number
  alcohol?: number
}): number {
  const fiber = serving.fiber ?? 0
  const alcohol = serving.alcohol ?? 0
  return (
    (serving.carbs - fiber) * KCAL_PER_G.carbs +
    fiber * KCAL_PER_G.fiber +
    serving.fat * KCAL_PER_G.fat +
    serving.protein * KCAL_PER_G.protein +
    alcohol * KCAL_PER_G.alcohol
  )
}

export function goalToGrams(goal: Goal): { carbsG: number; fatG: number; proteinG: number } {
  return {
    carbsG: Math.round((goal.kcal * goal.carbsPct / 100) / KCAL_PER_G.carbs),
    fatG: Math.round((goal.kcal * goal.fatPct / 100) / KCAL_PER_G.fat),
    proteinG: Math.round((goal.kcal * goal.proteinPct / 100) / KCAL_PER_G.protein),
  }
}

export function gramsToPct(
  kcal: number,
  grams: { carbs: number; fat: number; protein: number },
): { carbsPct: number; fatPct: number; proteinPct: number } {
  if (kcal <= 0) return { carbsPct: 0, fatPct: 0, proteinPct: 0 }
  return {
    carbsPct: Math.round((grams.carbs * KCAL_PER_G.carbs / kcal) * 100),
    fatPct: Math.round((grams.fat * KCAL_PER_G.fat / kcal) * 100),
    proteinPct: Math.round((grams.protein * KCAL_PER_G.protein / kcal) * 100),
  }
}

export function normalizePct(
  carbsPct: number,
  fatPct: number,
  proteinPct: number,
): { carbsPct: number; fatPct: number; proteinPct: number } {
  const sum = carbsPct + fatPct + proteinPct
  if (sum === 100 || sum <= 0) return { carbsPct, fatPct, proteinPct }
  const k = 100 / sum
  const c = Math.round(carbsPct * k)
  const f = Math.round(fatPct * k)
  const p = 100 - c - f
  return { carbsPct: c, fatPct: f, proteinPct: p }
}

export function servingDisplay(serving: Serving, quantity: number): string {
  const q = quantity === 1 ? '' : `${trimNum(quantity)}× `
  return `${q}${serving.label}`
}

export function trimNum(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 100) / 100)
}

export function roundKcal(n: number): number {
  return Math.round(n)
}

export function roundG(n: number): number {
  return Math.round(n * 10) / 10
}
