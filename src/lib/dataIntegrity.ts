import { pickCalorieStorage } from './calorieStorage'
import type { Food, FoodEntry, Meal } from '../types/calorie'
import type { DayKey } from '../types/note'

export type DataIntegrityIssueKind =
  | 'entry-missing-food'
  | 'entry-missing-serving'
  | 'meal-missing-food'
  | 'meal-missing-serving'

export type DataIntegrityIssue = {
  id: string
  kind: DataIntegrityIssueKind
  title: string
  detail: string
  day?: DayKey
  mealId?: string
}

export type DataIntegrityGroup = {
  kind: DataIntegrityIssueKind
  label: string
  scope: string
  count: number
  nextStep: string
}

export type DataIntegrityReport = {
  checkedAt: string
  days: number
  foodEntries: number
  meals: number
  mealItems: number
  brokenFoodEntries: number
  brokenMealItems: number
  groups: DataIntegrityGroup[]
  issues: DataIntegrityIssue[]
}

const GROUP_DEFINITIONS: Omit<DataIntegrityGroup, 'count'>[] = [
  {
    kind: 'entry-missing-food',
    label: 'продукт не найден',
    scope: 'дневник',
    nextStep: 'открой день и замени запись или оставь её как исторический факт',
  },
  {
    kind: 'entry-missing-serving',
    label: 'порция не найдена',
    scope: 'дневник',
    nextStep: 'открой день и выбери актуальную порцию для записи',
  },
  {
    kind: 'meal-missing-food',
    label: 'продукт не найден',
    scope: 'шаблон',
    nextStep: 'открой шаблон блюда и замени позицию',
  },
  {
    kind: 'meal-missing-serving',
    label: 'порция не найдена',
    scope: 'шаблон',
    nextStep: 'открой шаблон блюда и выбери актуальную порцию',
  },
]

export async function runDataIntegrityCheck(): Promise<DataIntegrityReport> {
  const storage = pickCalorieStorage()
  const [days, foods, meals] = await Promise.all([
    storage.listDaysWithEntries(),
    storage.listFoods(),
    storage.listMeals(),
  ])
  const sortedDays = [...days].sort((a, b) => a.localeCompare(b))
  const entriesByDay = await storage.loadDays(sortedDays)
  const foodsById = new Map(foods.map((food) => [food.id, food]))
  const issues: DataIntegrityIssue[] = []
  let foodEntries = 0
  let mealItems = 0
  let brokenFoodEntries = 0
  let brokenMealItems = 0

  for (const day of sortedDays) {
    const entries = entriesByDay[day] ?? []
    foodEntries += entries.length
    for (const entry of entries) {
      const issue = entryIssue(day, entry, foodsById)
      if (!issue) continue
      issues.push(issue)
      brokenFoodEntries += 1
    }
  }

  for (const meal of meals) {
    mealItems += meal.items.length
    for (const [index, item] of meal.items.entries()) {
      const issue = mealItemIssue(meal, index, item, foodsById)
      if (!issue) continue
      issues.push(issue)
      brokenMealItems += 1
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    days: sortedDays.length,
    foodEntries,
    meals: meals.length,
    mealItems,
    brokenFoodEntries,
    brokenMealItems,
    groups: groupIssues(issues),
    issues,
  }
}

function groupIssues(issues: DataIntegrityIssue[]): DataIntegrityGroup[] {
  const counts = new Map<DataIntegrityIssueKind, number>()
  for (const issue of issues) {
    counts.set(issue.kind, (counts.get(issue.kind) ?? 0) + 1)
  }
  return GROUP_DEFINITIONS
    .map((group) => ({
      ...group,
      count: counts.get(group.kind) ?? 0,
    }))
    .filter((group) => group.count > 0)
}

function entryIssue(
  day: DayKey,
  entry: FoodEntry,
  foodsById: Map<string, Food>,
): DataIntegrityIssue | null {
  if (!entry.foodId || !entry.servingId) return null
  const food = foodsById.get(entry.foodId)
  if (!food) {
    return {
      id: `entry-missing-food:${day}:${entry.id}`,
      kind: 'entry-missing-food',
      title: 'запись без продукта',
      detail: `${formatDay(day)} · продукт удалён`,
      day,
    }
  }
  if (!food.servings.some((serving) => serving.id === entry.servingId)) {
    return {
      id: `entry-missing-serving:${day}:${entry.id}`,
      kind: 'entry-missing-serving',
      title: 'запись без порции',
      detail: `${formatDay(day)} · ${food.name}`,
      day,
    }
  }
  return null
}

function mealItemIssue(
  meal: Meal,
  index: number,
  item: Meal['items'][number],
  foodsById: Map<string, Food>,
): DataIntegrityIssue | null {
  const food = foodsById.get(item.foodId)
  if (!food) {
    return {
      id: `meal-missing-food:${meal.id}:${index}`,
      kind: 'meal-missing-food',
      title: 'блюдо без продукта',
      detail: meal.name,
      mealId: meal.id,
    }
  }
  if (!food.servings.some((serving) => serving.id === item.servingId)) {
    return {
      id: `meal-missing-serving:${meal.id}:${index}`,
      kind: 'meal-missing-serving',
      title: 'блюдо без порции',
      detail: `${meal.name} · ${food.name}`,
      mealId: meal.id,
    }
  }
  return null
}

function formatDay(day: DayKey): string {
  const [, month, date] = day.split('-')
  return `${date}.${month}`
}
