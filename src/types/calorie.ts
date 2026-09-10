import type { DayKey } from './note'

export type MealType = 'b' | 'l' | 'd' | 's'

export const MEAL_ORDER: MealType[] = ['b', 'l', 'd', 's']

export const MEAL_LABEL_RU: Record<MealType, string> = {
  b: 'Завтрак',
  l: 'Обед',
  d: 'Ужин',
  s: 'Перекус',
}

export interface Serving {
  id: string
  label: string
  grams?: number
  kcal: number
  carbs: number
  fat: number
  protein: number
  fiber?: number
  alcohol?: number
}

export type NutritionEstimateSource = 'ai' | 'barcode' | 'manual' | 'library'

export type BrandDataStatus = 'not_provided' | 'exact' | 'estimated'

export type NutritionPortionBasis =
  | 'stated_weight'
  | 'visual_anchor'
  | 'label'
  | 'typical_portion'
  | 'user_edit'
  | 'unknown'

export interface NutritionEstimate {
  source: NutritionEstimateSource
  confidence?: number
  confidenceReason?: string
  portionBasis?: NutritionPortionBasis
  basisLabel?: string
  originalPortionBasis?: NutritionPortionBasis
  originalBasisLabel?: string
  dataSource?: string
  brandDataStatus?: BrandDataStatus
  brandDataLabel?: string
}

export interface Food {
  id: string
  name: string
  brand?: string
  barcode?: string
  servings: Serving[]
  estimate?: NutritionEstimate
  favourite: boolean
  archived: boolean
  createdAt: number
  updatedAt: number
}

export interface MealItem {
  foodId: string
  servingId: string
  quantity: number
}

export interface Meal {
  id: string
  name: string
  items: MealItem[]
  favourite: boolean
  createdAt: number
  updatedAt: number
}

export interface QuickAddData {
  name: string
  kcal: number
  carbs?: number
  fat?: number
  protein?: number
  fiber?: number
  alcohol?: number
  estimate?: NutritionEstimate
}

export interface FoodEntry {
  id: string
  date: DayKey
  quantity: number
  createdAt: number
  meal?: MealType
  foodId?: string
  servingId?: string
  quickAdd?: QuickAddData
}

export interface WaterEntry {
  id: string
  date: DayKey
  ml: number
  createdAt: number
}

export type FoodLogStatus = 'unknown' | 'no_food' | 'not_logged'

export interface DayMeta {
  day: DayKey
  lazy: boolean
  foodStatus?: FoodLogStatus
  updatedAt: number
}

export interface TdeeProfile {
  sex: 'm' | 'f'
  age: number
  weight: number
  height: number
  activity: number
  modifier: number
}

export interface Goal {
  kcal: number
  carbsPct: number
  fatPct: number
  proteinPct: number
  updatedAt: number
  profile?: TdeeProfile
}

export interface RecentItem {
  foodId?: string
  quickAdd?: QuickAddData
  lastUsedAt: number
  usageCount: number
}

export interface UsualBundlePreferenceItem {
  key: string
  factor: number
  included: boolean
}

export interface UsualBundlePreference {
  key: string
  updatedAt: number
  items: UsualBundlePreferenceItem[]
}

export interface RecentList {
  entries: RecentItem[]
  usualBundlePrefs?: UsualBundlePreference[]
}

export interface ResolvedEntry {
  entry: FoodEntry
  name: string
  servingLabel: string
  kcal: number
  carbs: number
  fat: number
  protein: number
  fiber: number
  alcohol: number
  isQuick: boolean
  missing: boolean
  estimate?: NutritionEstimate
}

export interface MacroTotals {
  kcal: number
  carbs: number
  fat: number
  protein: number
  fiber: number
  alcohol: number
}

export const DEFAULT_GOAL: Goal = {
  kcal: 2000,
  carbsPct: 50,
  fatPct: 30,
  proteinPct: 20,
  updatedAt: 0,
}

export const DEFAULT_WATER_GOAL_ML = 2000

export const EMPTY_TOTALS: MacroTotals = {
  kcal: 0,
  carbs: 0,
  fat: 0,
  protein: 0,
  fiber: 0,
  alcohol: 0,
}

export const RECENT_LIMIT = 30
