import { cloudStorage } from '@tma.js/sdk-react'
import { isInsideTelegram, telegramUserId } from './tma'
import type { DayKey } from '../types/note'
import {
  type BrandDataStatus,
  type DayMeta,
  DEFAULT_GOAL,
  type Food,
  type FoodEntry,
  type FoodLogStatus,
  type Goal,
  type Meal,
  type MealType,
  type NutritionEstimate,
  type NutritionEstimateSource,
  type NutritionPortionBasis,
  type QuickAddData,
  type RecentItem,
  type RecentList,
  type Serving,
  type UsualBundlePreference,
  type UsualBundlePreferenceItem,
  type WaterEntry,
} from '../types/calorie'

type KeyKind = 'day' | 'food' | 'meal' | 'recent' | 'goal' | 'water' | 'dayMeta'

const CLOUD_PREFIX: Record<KeyKind, string> = {
  day: 'cd_',
  food: 'cf_',
  meal: 'cm_',
  recent: 'cr',
  goal: 'cg',
  water: 'cw_',
  dayMeta: 'cx_',
}

const API_BASE = (import.meta.env.VITE_AI_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

type RemoteDayResponse = { entries?: unknown; found?: boolean }
type RemoteDaysResponse = {
  entriesByDay?: Record<string, unknown>
  foundDays?: unknown
}
type RemoteListDaysResponse = { days?: unknown; knownDays?: unknown }
type RemoteFoodResponse = { food?: unknown; found?: boolean }
type RemoteFoodsResponse = { foods?: unknown; deletedIds?: unknown }
type RemoteMealResponse = { meal?: unknown; found?: boolean }
type RemoteMealsResponse = { meals?: unknown; deletedIds?: unknown }
type RemoteRecentResponse = { recent?: unknown; found?: boolean }
type RemoteGoalResponse = { goal?: unknown; found?: boolean }
type RemoteWaterResponse = { water?: unknown; found?: boolean }
type RemoteWaterDaysResponse = {
  waterByDay?: Record<string, unknown>
  foundDays?: unknown
}
type RemoteDayMetaResponse = { meta?: unknown; found?: boolean }
type RemoteDayMetaRangeResponse = {
  metaByDay?: Record<string, unknown>
  foundDays?: unknown
}

function lsUserPrefix(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:` : 'zhvusha:anon:'
}

function cloudKey(kind: KeyKind, suffix?: string): string {
  const base = CLOUD_PREFIX[kind]
  return suffix ? base + suffix : base
}

function localKey(kind: KeyKind, suffix?: string): string {
  return lsUserPrefix() + cloudKey(kind, suffix)
}

function canUseCloudStorage(): boolean {
  try {
    return cloudStorage.getItem.isAvailable()
      && cloudStorage.setItem.isAvailable()
      && cloudStorage.deleteItem.isAvailable()
      && cloudStorage.getKeys.isAvailable()
  } catch {
    return false
  }
}

function getInitData(): string {
  if (typeof window === 'undefined') return ''
  return window.Telegram?.WebApp?.initData ?? ''
}

function canUseRemoteStorage(): boolean {
  return isInsideTelegram()
}

async function remotePost<T extends Record<string, unknown>>(
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${API_BASE}/api/calorie-storage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getInitData() ? { 'x-init-data': getInitData() } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`calorie-storage ${res.status}: ${text.slice(0, 120)}`)
  }
  return await res.json() as T
}

function fallbackBackend(): CalorieStorage {
  return canUseCloudStorage() ? cloudBackend : localBackend
}

function logRemoteFallback(tag: string, error: unknown): void {
  const message = error instanceof Error ? error.message : 'unknown'
  console.warn(`[postgresStorage] ${tag} failed, falling back:`, message)
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function jsonOf(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function parseEntriesValue(value: unknown): FoodEntry[] {
  return parseEntries(jsonOf(value))
}

function parseFoodValue(value: unknown): Food | null {
  return parseFood(jsonOf(value))
}

function parseMealValue(value: unknown): Meal | null {
  return parseMeal(jsonOf(value))
}

function parseRecentValue(value: unknown): RecentList {
  return parseRecent(jsonOf(value))
}

function parseGoalValue(value: unknown): Goal {
  return parseGoal(jsonOf(value))
}

function parseWaterValue(value: unknown): WaterEntry[] {
  return parseWaterEntries(jsonOf(value))
}

function parseDayMetaValue(value: unknown, day: DayKey): DayMeta | null {
  return parseDayMeta(jsonOf(value), day)
}

async function remoteSaveDayQuiet(day: DayKey, entries: FoodEntry[]): Promise<void> {
  try {
    await remotePost({ op: 'saveDay', day, entries })
  } catch (e) {
    logRemoteFallback(`lazy saveDay(${day})`, e)
  }
}

async function remoteSaveFoodQuiet(food: Food): Promise<void> {
  try {
    await remotePost({ op: 'saveFood', food })
  } catch (e) {
    logRemoteFallback(`lazy saveFood(${food.id})`, e)
  }
}

async function remoteSaveMealQuiet(meal: Meal): Promise<void> {
  try {
    await remotePost({ op: 'saveMeal', meal })
  } catch (e) {
    logRemoteFallback(`lazy saveMeal(${meal.id})`, e)
  }
}

async function remoteSaveRecentQuiet(recent: RecentList): Promise<void> {
  try {
    await remotePost({ op: 'saveRecent', recent })
  } catch (e) {
    logRemoteFallback('lazy saveRecent', e)
  }
}

async function remoteSaveGoalQuiet(goal: Goal): Promise<void> {
  try {
    await remotePost({ op: 'saveGoal', goal })
  } catch (e) {
    logRemoteFallback('lazy saveGoal', e)
  }
}

async function remoteSaveWaterDayQuiet(day: DayKey, water: WaterEntry[]): Promise<void> {
  try {
    await remotePost({ op: 'saveWaterDay', day, water })
  } catch (e) {
    logRemoteFallback(`lazy saveWaterDay(${day})`, e)
  }
}

async function remoteSaveDayMetaQuiet(day: DayKey, meta: DayMeta): Promise<void> {
  try {
    await remotePost({ op: 'saveDayMeta', day, meta })
  } catch (e) {
    logRemoteFallback(`lazy saveDayMeta(${day})`, e)
  }
}

export interface CalorieStorage {
  loadDay(day: DayKey): Promise<FoodEntry[]>
  loadDays(days: DayKey[]): Promise<Record<DayKey, FoodEntry[]>>
  saveDay(day: DayKey, entries: FoodEntry[]): Promise<void>
  listDaysWithEntries(): Promise<DayKey[]>

  loadFood(id: string): Promise<Food | null>
  saveFood(food: Food): Promise<void>
  deleteFood(id: string): Promise<void>
  listFoods(): Promise<Food[]>

  loadMeal(id: string): Promise<Meal | null>
  saveMeal(meal: Meal): Promise<void>
  deleteMeal(id: string): Promise<void>
  listMeals(): Promise<Meal[]>

  loadRecent(): Promise<RecentList>
  saveRecent(recent: RecentList): Promise<void>

  loadGoal(): Promise<Goal>
  saveGoal(goal: Goal): Promise<void>

  loadWaterDay(day: DayKey): Promise<WaterEntry[]>
  loadWaterDays(days: DayKey[]): Promise<Record<DayKey, WaterEntry[]>>
  saveWaterDay(day: DayKey, water: WaterEntry[]): Promise<void>
  listDaysWithWater(): Promise<DayKey[]>

  loadDayMeta(day: DayKey): Promise<DayMeta | null>
  loadDayMetaRange(days: DayKey[]): Promise<Record<DayKey, DayMeta | null>>
  saveDayMeta(day: DayKey, meta: DayMeta): Promise<void>
  listDaysWithDayMeta(): Promise<DayKey[]>
}

/**
 * Запись в Telegram CloudStorage может упасть по ряду причин: лимит 4 KB
 * на значение, 1024 ключа на юзера, rate-limit при частых setItem (AI-анализ
 * пишет пачку сразу), сетевые ошибки. Чтобы данные не терялись — падение
 * cloud-стораджа тихо откатываем в localStorage, который тех лимитов не имеет.
 */
async function cloudOrLocal<T>(
  attemptCloud: () => Promise<T>,
  localFallback: () => Promise<T> | T,
  tag: string,
): Promise<T> {
  try {
    return await attemptCloud()
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown'
    console.warn(`[cloudStorage] ${tag} failed, falling back to localStorage:`, message)
    return await localFallback()
  }
}

/**
 * Удалить локальный fallback-ключ после успешной записи в cloud, чтобы при
 * следующем чтении cloud был истиной и local не всплыл как stale-копия.
 */
function clearLocalFallback(kind: KeyKind, suffix?: string): void {
  try {
    window.localStorage.removeItem(localKey(kind, suffix))
  } catch {
    /* no-op */
  }
}

const remoteBackend: CalorieStorage = {
  async loadDay(day) {
    try {
      const remote = await remotePost<RemoteDayResponse>({ op: 'loadDay', day })
      const entries = parseEntriesValue(remote.entries)
      if (remote.found) return entries
      const fallback = await fallbackBackend().loadDay(day)
      if (fallback.length > 0) await remoteSaveDayQuiet(day, fallback)
      return fallback
    } catch (e) {
      logRemoteFallback(`loadDay(${day})`, e)
      return fallbackBackend().loadDay(day)
    }
  },
  async loadDays(days) {
    if (days.length === 0) return {}
    try {
      const remote = await remotePost<RemoteDaysResponse>({ op: 'loadDays', days })
      const found = new Set(asStringArray(remote.foundDays))
      const remoteMap = remote.entriesByDay ?? {}
      const out: Record<DayKey, FoodEntry[]> = {}
      const missing: DayKey[] = []
      for (const day of days) {
        out[day] = parseEntriesValue(remoteMap[day])
        if (!found.has(day)) missing.push(day)
      }
      if (missing.length > 0) {
        const fallback = await fallbackBackend().loadDays(missing)
        for (const day of missing) {
          const entries = fallback[day] ?? []
          out[day] = entries
          if (entries.length > 0) await remoteSaveDayQuiet(day, entries)
        }
      }
      return out
    } catch (e) {
      logRemoteFallback('loadDays', e)
      return fallbackBackend().loadDays(days)
    }
  },
  async saveDay(day, entries) {
    try {
      await remotePost({ op: 'saveDay', day, entries })
      if (entries.length === 0) await fallbackBackend().saveDay(day, [])
    } catch (e) {
      logRemoteFallback(`saveDay(${day})`, e)
      await fallbackBackend().saveDay(day, entries)
    }
  },
  async listDaysWithEntries() {
    try {
      const remote = await remotePost<RemoteListDaysResponse>({ op: 'listDaysWithEntries' })
      const days = asStringArray(remote.days)
      const known = new Set(asStringArray(remote.knownDays))
      const fallback = (await fallbackBackend().listDaysWithEntries())
        .filter((day) => !known.has(day))
      return Array.from(new Set([...days, ...fallback]))
    } catch (e) {
      logRemoteFallback('listDaysWithEntries', e)
      return fallbackBackend().listDaysWithEntries()
    }
  },

  async loadFood(id) {
    try {
      const remote = await remotePost<RemoteFoodResponse>({ op: 'loadFood', id })
      if (remote.found) return parseFoodValue(remote.food)
      const fallback = await fallbackBackend().loadFood(id)
      if (fallback) await remoteSaveFoodQuiet(fallback)
      return fallback
    } catch (e) {
      logRemoteFallback(`loadFood(${id})`, e)
      return fallbackBackend().loadFood(id)
    }
  },
  async saveFood(food) {
    try {
      await remotePost({ op: 'saveFood', food })
    } catch (e) {
      logRemoteFallback(`saveFood(${food.id})`, e)
      await fallbackBackend().saveFood(food)
    }
  },
  async deleteFood(id) {
    try {
      await remotePost({ op: 'deleteFood', id })
      await fallbackBackend().deleteFood(id)
    } catch (e) {
      logRemoteFallback(`deleteFood(${id})`, e)
      await fallbackBackend().deleteFood(id)
    }
  },
  async listFoods() {
    try {
      const remote = await remotePost<RemoteFoodsResponse>({ op: 'listFoods' })
      const remoteFoods = Array.isArray(remote.foods)
        ? remote.foods.map(parseFoodValue).filter((f): f is Food => f !== null)
        : []
      const deletedIds = new Set(asStringArray(remote.deletedIds))
      const localFoods = (await fallbackBackend().listFoods()).filter((f) => !deletedIds.has(f.id))
      const remoteById = new Map(remoteFoods.map((f) => [f.id, f]))
      for (const food of localFoods) {
        const current = remoteById.get(food.id)
        if (!current || food.updatedAt > current.updatedAt) await remoteSaveFoodQuiet(food)
      }
      return mergeById(remoteFoods, localFoods)
    } catch (e) {
      logRemoteFallback('listFoods', e)
      return fallbackBackend().listFoods()
    }
  },

  async loadMeal(id) {
    try {
      const remote = await remotePost<RemoteMealResponse>({ op: 'loadMeal', id })
      if (remote.found) return parseMealValue(remote.meal)
      const fallback = await fallbackBackend().loadMeal(id)
      if (fallback) await remoteSaveMealQuiet(fallback)
      return fallback
    } catch (e) {
      logRemoteFallback(`loadMeal(${id})`, e)
      return fallbackBackend().loadMeal(id)
    }
  },
  async saveMeal(meal) {
    try {
      await remotePost({ op: 'saveMeal', meal })
    } catch (e) {
      logRemoteFallback(`saveMeal(${meal.id})`, e)
      await fallbackBackend().saveMeal(meal)
    }
  },
  async deleteMeal(id) {
    try {
      await remotePost({ op: 'deleteMeal', id })
      await fallbackBackend().deleteMeal(id)
    } catch (e) {
      logRemoteFallback(`deleteMeal(${id})`, e)
      await fallbackBackend().deleteMeal(id)
    }
  },
  async listMeals() {
    try {
      const remote = await remotePost<RemoteMealsResponse>({ op: 'listMeals' })
      const remoteMeals = Array.isArray(remote.meals)
        ? remote.meals.map(parseMealValue).filter((m): m is Meal => m !== null)
        : []
      const deletedIds = new Set(asStringArray(remote.deletedIds))
      const localMeals = (await fallbackBackend().listMeals()).filter((m) => !deletedIds.has(m.id))
      const remoteById = new Map(remoteMeals.map((m) => [m.id, m]))
      for (const meal of localMeals) {
        const current = remoteById.get(meal.id)
        if (!current || meal.updatedAt > current.updatedAt) await remoteSaveMealQuiet(meal)
      }
      return mergeById(remoteMeals, localMeals)
    } catch (e) {
      logRemoteFallback('listMeals', e)
      return fallbackBackend().listMeals()
    }
  },

  async loadRecent() {
    try {
      const remote = await remotePost<RemoteRecentResponse>({ op: 'loadRecent' })
      const recent = parseRecentValue(remote.recent)
      if (remote.found) return recent
      const fallback = await fallbackBackend().loadRecent()
      if (fallback.entries.length > 0) await remoteSaveRecentQuiet(fallback)
      return fallback
    } catch (e) {
      logRemoteFallback('loadRecent', e)
      return fallbackBackend().loadRecent()
    }
  },
  async saveRecent(recent) {
    try {
      await remotePost({ op: 'saveRecent', recent })
    } catch (e) {
      logRemoteFallback('saveRecent', e)
      await fallbackBackend().saveRecent(recent)
    }
  },

  async loadGoal() {
    try {
      const remote = await remotePost<RemoteGoalResponse>({ op: 'loadGoal' })
      if (remote.found) return parseGoalValue(remote.goal)
      const fallback = await fallbackBackend().loadGoal()
      await remoteSaveGoalQuiet(fallback)
      return fallback
    } catch (e) {
      logRemoteFallback('loadGoal', e)
      return fallbackBackend().loadGoal()
    }
  },
  async saveGoal(goal) {
    try {
      await remotePost({ op: 'saveGoal', goal })
    } catch (e) {
      logRemoteFallback('saveGoal', e)
      await fallbackBackend().saveGoal(goal)
    }
  },

  async loadWaterDay(day) {
    try {
      const remote = await remotePost<RemoteWaterResponse>({ op: 'loadWaterDay', day })
      const water = parseWaterValue(remote.water)
      if (remote.found) return water
      const fallback = await fallbackBackend().loadWaterDay(day)
      if (fallback.length > 0) await remoteSaveWaterDayQuiet(day, fallback)
      return fallback
    } catch (e) {
      logRemoteFallback(`loadWaterDay(${day})`, e)
      return fallbackBackend().loadWaterDay(day)
    }
  },
  async loadWaterDays(days) {
    if (days.length === 0) return {}
    try {
      const remote = await remotePost<RemoteWaterDaysResponse>({ op: 'loadWaterDays', days })
      const found = new Set(asStringArray(remote.foundDays))
      const remoteMap = remote.waterByDay ?? {}
      const out: Record<DayKey, WaterEntry[]> = {}
      const missing: DayKey[] = []
      for (const day of days) {
        out[day] = parseWaterValue(remoteMap[day])
        if (!found.has(day)) missing.push(day)
      }
      if (missing.length > 0) {
        const fallback = await fallbackBackend().loadWaterDays(missing)
        for (const day of missing) {
          const water = fallback[day] ?? []
          out[day] = water
          if (water.length > 0) await remoteSaveWaterDayQuiet(day, water)
        }
      }
      return out
    } catch (e) {
      logRemoteFallback('loadWaterDays', e)
      return fallbackBackend().loadWaterDays(days)
    }
  },
  async saveWaterDay(day, water) {
    try {
      await remotePost({ op: 'saveWaterDay', day, water })
      if (water.length === 0) await fallbackBackend().saveWaterDay(day, [])
    } catch (e) {
      logRemoteFallback(`saveWaterDay(${day})`, e)
      await fallbackBackend().saveWaterDay(day, water)
    }
  },
  async listDaysWithWater() {
    try {
      const remote = await remotePost<RemoteListDaysResponse>({ op: 'listDaysWithWater' })
      const days = asStringArray(remote.days)
      const known = new Set(asStringArray(remote.knownDays))
      const fallback = (await fallbackBackend().listDaysWithWater())
        .filter((day) => !known.has(day))
      return Array.from(new Set([...days, ...fallback]))
    } catch (e) {
      logRemoteFallback('listDaysWithWater', e)
      return fallbackBackend().listDaysWithWater()
    }
  },

  async loadDayMeta(day) {
    try {
      const remote = await remotePost<RemoteDayMetaResponse>({ op: 'loadDayMeta', day })
      const meta = parseDayMetaValue(remote.meta, day)
      if (remote.found) return meta
      const fallback = await fallbackBackend().loadDayMeta(day)
      if (fallback) await remoteSaveDayMetaQuiet(day, fallback)
      return fallback
    } catch (e) {
      logRemoteFallback(`loadDayMeta(${day})`, e)
      return fallbackBackend().loadDayMeta(day)
    }
  },
  async loadDayMetaRange(days) {
    if (days.length === 0) return {}
    try {
      const remote = await remotePost<RemoteDayMetaRangeResponse>({ op: 'loadDayMetaRange', days })
      const found = new Set(asStringArray(remote.foundDays))
      const remoteMap = remote.metaByDay ?? {}
      const out: Record<DayKey, DayMeta | null> = {}
      const missing: DayKey[] = []
      for (const day of days) {
        out[day] = parseDayMetaValue(remoteMap[day], day)
        if (!found.has(day)) missing.push(day)
      }
      if (missing.length > 0) {
        const fallback = await fallbackBackend().loadDayMetaRange(missing)
        for (const day of missing) {
          const meta = fallback[day] ?? null
          out[day] = meta
          if (meta) await remoteSaveDayMetaQuiet(day, meta)
        }
      }
      return out
    } catch (e) {
      logRemoteFallback('loadDayMetaRange', e)
      return fallbackBackend().loadDayMetaRange(days)
    }
  },
  async saveDayMeta(day, meta) {
    try {
      await remotePost({ op: 'saveDayMeta', day, meta })
    } catch (e) {
      logRemoteFallback(`saveDayMeta(${day})`, e)
      await fallbackBackend().saveDayMeta(day, meta)
    }
  },
  async listDaysWithDayMeta() {
    try {
      const remote = await remotePost<RemoteListDaysResponse>({ op: 'listDaysWithDayMeta' })
      const days = asStringArray(remote.days)
      const known = new Set(asStringArray(remote.knownDays))
      const fallback = (await fallbackBackend().listDaysWithDayMeta())
        .filter((day) => !known.has(day))
      return Array.from(new Set([...days, ...fallback]))
    } catch (e) {
      logRemoteFallback('listDaysWithDayMeta', e)
      return fallbackBackend().listDaysWithDayMeta()
    }
  },
}

const cloudBackend: CalorieStorage = {
  async loadDay(day) {
    const raw = await cloudStorage.getItem(cloudKey('day', day))
    const cloud = parseEntries(strOrEmpty(raw))
    if (cloud.length > 0) return cloud
    // Пусто в cloud — возможно предыдущий saveDay упал в local-fallback. Читаем.
    return localBackend.loadDay(day)
  },
  async loadDays(days) {
    if (days.length === 0) return {}
    const values = await Promise.all(days.map((d) => cloudStorage.getItem(cloudKey('day', d))))
    const out: Record<DayKey, FoodEntry[]> = {}
    const missing: DayKey[] = []
    days.forEach((day, i) => {
      const parsed = parseEntries(strOrEmpty(values[i]))
      if (parsed.length > 0) out[day] = parsed
      else missing.push(day)
    })
    if (missing.length > 0) {
      const localMap = await localBackend.loadDays(missing)
      for (const d of missing) out[d] = localMap[d] ?? []
    }
    return out
  },
  async saveDay(day, entries) {
    const key = cloudKey('day', day)
    return cloudOrLocal(
      async () => {
        if (entries.length === 0) {
          await cloudStorage.deleteItem(key)
        } else {
          await cloudStorage.setItem(key, JSON.stringify({ v: 1, e: entries }))
        }
        clearLocalFallback('day', day)
      },
      () => localBackend.saveDay(day, entries),
      `saveDay(${day})`,
    )
  },
  async listDaysWithEntries() {
    const keys = await cloudStorage.getKeys()
    const cloud = keys
      .filter((k) => k.startsWith(CLOUD_PREFIX.day))
      .map((k) => k.slice(CLOUD_PREFIX.day.length))
    // Дни, которые упали в local-fallback — тоже показываем в календаре.
    const local = await localBackend.listDaysWithEntries()
    return Array.from(new Set([...cloud, ...local]))
  },

  async loadFood(id) {
    const raw = await cloudStorage.getItem(cloudKey('food', id))
    const cloud = parseFood(strOrEmpty(raw))
    if (cloud) return cloud
    return localBackend.loadFood(id)
  },
  async saveFood(food) {
    return cloudOrLocal(
      async () => {
        await cloudStorage.setItem(cloudKey('food', food.id), JSON.stringify(food))
        clearLocalFallback('food', food.id)
      },
      () => localBackend.saveFood(food),
      `saveFood(${food.id})`,
    )
  },
  async deleteFood(id) {
    await cloudStorage.deleteItem(cloudKey('food', id))
    clearLocalFallback('food', id)
  },
  async listFoods() {
    const keys = await cloudStorage.getKeys()
    const foodKeys = keys.filter((k) => k.startsWith(CLOUD_PREFIX.food))
    const cloud = foodKeys.length === 0
      ? []
      : (await Promise.all(foodKeys.map((k) => cloudStorage.getItem(k))))
          .map((v) => parseFood(strOrEmpty(v)))
          .filter((f): f is Food => f !== null)
    const local = await localBackend.listFoods()
    return mergeById(cloud, local)
  },

  async loadMeal(id) {
    const raw = await cloudStorage.getItem(cloudKey('meal', id))
    const cloud = parseMeal(strOrEmpty(raw))
    if (cloud) return cloud
    return localBackend.loadMeal(id)
  },
  async saveMeal(meal) {
    return cloudOrLocal(
      async () => {
        await cloudStorage.setItem(cloudKey('meal', meal.id), JSON.stringify(meal))
        clearLocalFallback('meal', meal.id)
      },
      () => localBackend.saveMeal(meal),
      `saveMeal(${meal.id})`,
    )
  },
  async deleteMeal(id) {
    await cloudStorage.deleteItem(cloudKey('meal', id))
    clearLocalFallback('meal', id)
  },
  async listMeals() {
    const keys = await cloudStorage.getKeys()
    const mealKeys = keys.filter((k) => k.startsWith(CLOUD_PREFIX.meal))
    const cloud = mealKeys.length === 0
      ? []
      : (await Promise.all(mealKeys.map((k) => cloudStorage.getItem(k))))
          .map((v) => parseMeal(strOrEmpty(v)))
          .filter((m): m is Meal => m !== null)
    const local = await localBackend.listMeals()
    return mergeById(cloud, local)
  },

  async loadRecent() {
    const raw = await cloudStorage.getItem(cloudKey('recent'))
    const cloud = parseRecent(strOrEmpty(raw))
    if (cloud.entries.length > 0) return cloud
    return localBackend.loadRecent()
  },
  async saveRecent(recent) {
    return cloudOrLocal(
      async () => {
        await cloudStorage.setItem(cloudKey('recent'), JSON.stringify(recent))
        clearLocalFallback('recent')
      },
      () => localBackend.saveRecent(recent),
      'saveRecent',
    )
  },

  async loadGoal() {
    const raw = await cloudStorage.getItem(cloudKey('goal'))
    if (raw) return parseGoal(strOrEmpty(raw))
    // Fallback только если в cloud реально ничего нет (включая пустой объект).
    const local = window.localStorage.getItem(localKey('goal'))
    if (local) return parseGoal(local)
    return parseGoal('')
  },
  async saveGoal(goal) {
    return cloudOrLocal(
      async () => {
        await cloudStorage.setItem(cloudKey('goal'), JSON.stringify(goal))
        clearLocalFallback('goal')
      },
      () => localBackend.saveGoal(goal),
      'saveGoal',
    )
  },

  async loadWaterDay(day) {
    const raw = await cloudStorage.getItem(cloudKey('water', day))
    const cloud = parseWaterEntries(strOrEmpty(raw))
    if (cloud.length > 0) return cloud
    return localBackend.loadWaterDay(day)
  },
  async loadWaterDays(days) {
    if (days.length === 0) return {}
    const values = await Promise.all(days.map((d) => cloudStorage.getItem(cloudKey('water', d))))
    const out: Record<DayKey, WaterEntry[]> = {}
    const missing: DayKey[] = []
    days.forEach((day, i) => {
      const parsed = parseWaterEntries(strOrEmpty(values[i]))
      if (parsed.length > 0) out[day] = parsed
      else missing.push(day)
    })
    if (missing.length > 0) {
      const localMap = await localBackend.loadWaterDays(missing)
      for (const d of missing) out[d] = localMap[d] ?? []
    }
    return out
  },
  async saveWaterDay(day, water) {
    const key = cloudKey('water', day)
    return cloudOrLocal(
      async () => {
        if (water.length === 0) {
          await cloudStorage.deleteItem(key)
        } else {
          await cloudStorage.setItem(key, JSON.stringify({ v: 1, e: water }))
        }
        clearLocalFallback('water', day)
      },
      () => localBackend.saveWaterDay(day, water),
      `saveWaterDay(${day})`,
    )
  },
  async listDaysWithWater() {
    const keys = await cloudStorage.getKeys()
    const cloud = keys
      .filter((k) => k.startsWith(CLOUD_PREFIX.water))
      .map((k) => k.slice(CLOUD_PREFIX.water.length))
    const local = await localBackend.listDaysWithWater()
    return Array.from(new Set([...cloud, ...local]))
  },

  async loadDayMeta(day) {
    const raw = await cloudStorage.getItem(cloudKey('dayMeta', day))
    const cloud = parseDayMeta(strOrEmpty(raw), day)
    if (cloud) return cloud
    return localBackend.loadDayMeta(day)
  },
  async loadDayMetaRange(days) {
    if (days.length === 0) return {}
    const values = await Promise.all(days.map((d) => cloudStorage.getItem(cloudKey('dayMeta', d))))
    const out: Record<DayKey, DayMeta | null> = {}
    const missing: DayKey[] = []
    days.forEach((day, i) => {
      const parsed = parseDayMeta(strOrEmpty(values[i]), day)
      if (parsed) out[day] = parsed
      else missing.push(day)
    })
    if (missing.length > 0) {
      const localMap = await localBackend.loadDayMetaRange(missing)
      for (const d of missing) out[d] = localMap[d] ?? null
    }
    return out
  },
  async saveDayMeta(day, meta) {
    return cloudOrLocal(
      async () => {
        await cloudStorage.setItem(cloudKey('dayMeta', day), JSON.stringify(meta))
        clearLocalFallback('dayMeta', day)
      },
      () => localBackend.saveDayMeta(day, meta),
      `saveDayMeta(${day})`,
    )
  },
  async listDaysWithDayMeta() {
    const keys = await cloudStorage.getKeys()
    const cloud = keys
      .filter((k) => k.startsWith(CLOUD_PREFIX.dayMeta))
      .map((k) => k.slice(CLOUD_PREFIX.dayMeta.length))
    const local = await localBackend.listDaysWithDayMeta()
    return Array.from(new Set([...cloud, ...local]))
  },
}

/**
 * Объединяет списки из cloud и local по `id`: свежее `updatedAt` побеждает.
 * Нужно, потому что `saveFood`/`saveMeal` при ошибке cloud пишут в local,
 * и до следующего успешного save обе копии могут сосуществовать.
 */
function mergeById<T extends { id: string; updatedAt: number }>(cloud: T[], local: T[]): T[] {
  const byId = new Map<string, T>()
  for (const item of cloud) byId.set(item.id, item)
  for (const item of local) {
    const existing = byId.get(item.id)
    if (!existing || item.updatedAt > existing.updatedAt) byId.set(item.id, item)
  }
  return Array.from(byId.values())
}

const localBackend: CalorieStorage = {
  async loadDay(day) {
    return parseEntries(window.localStorage.getItem(localKey('day', day)) ?? '')
  },
  async loadDays(days) {
    const out: Record<DayKey, FoodEntry[]> = {}
    for (const d of days) {
      out[d] = parseEntries(window.localStorage.getItem(localKey('day', d)) ?? '')
    }
    return out
  },
  async saveDay(day, entries) {
    const key = localKey('day', day)
    if (entries.length === 0) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify({ v: 1, e: entries }))
  },
  async listDaysWithEntries() {
    const prefix = localKey('day')
    const out: DayKey[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length))
    }
    return out
  },

  async loadFood(id) {
    return parseFood(window.localStorage.getItem(localKey('food', id)) ?? '')
  },
  async saveFood(food) {
    window.localStorage.setItem(localKey('food', food.id), JSON.stringify(food))
  },
  async deleteFood(id) {
    window.localStorage.removeItem(localKey('food', id))
  },
  async listFoods() {
    const prefix = localKey('food')
    const out: Food[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) {
        const food = parseFood(window.localStorage.getItem(k) ?? '')
        if (food) out.push(food)
      }
    }
    return out
  },

  async loadMeal(id) {
    return parseMeal(window.localStorage.getItem(localKey('meal', id)) ?? '')
  },
  async saveMeal(meal) {
    window.localStorage.setItem(localKey('meal', meal.id), JSON.stringify(meal))
  },
  async deleteMeal(id) {
    window.localStorage.removeItem(localKey('meal', id))
  },
  async listMeals() {
    const prefix = localKey('meal')
    const out: Meal[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) {
        const meal = parseMeal(window.localStorage.getItem(k) ?? '')
        if (meal) out.push(meal)
      }
    }
    return out
  },

  async loadRecent() {
    return parseRecent(window.localStorage.getItem(localKey('recent')) ?? '')
  },
  async saveRecent(recent) {
    window.localStorage.setItem(localKey('recent'), JSON.stringify(recent))
  },

  async loadGoal() {
    return parseGoal(window.localStorage.getItem(localKey('goal')) ?? '')
  },
  async saveGoal(goal) {
    window.localStorage.setItem(localKey('goal'), JSON.stringify(goal))
  },

  async loadWaterDay(day) {
    return parseWaterEntries(window.localStorage.getItem(localKey('water', day)) ?? '')
  },
  async loadWaterDays(days) {
    const out: Record<DayKey, WaterEntry[]> = {}
    for (const d of days) {
      out[d] = parseWaterEntries(window.localStorage.getItem(localKey('water', d)) ?? '')
    }
    return out
  },
  async saveWaterDay(day, water) {
    const key = localKey('water', day)
    if (water.length === 0) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify({ v: 1, e: water }))
  },
  async listDaysWithWater() {
    const prefix = localKey('water')
    const out: DayKey[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length))
    }
    return out
  },

  async loadDayMeta(day) {
    return parseDayMeta(window.localStorage.getItem(localKey('dayMeta', day)) ?? '', day)
  },
  async loadDayMetaRange(days) {
    const out: Record<DayKey, DayMeta | null> = {}
    for (const d of days) {
      out[d] = parseDayMeta(window.localStorage.getItem(localKey('dayMeta', d)) ?? '', d)
    }
    return out
  },
  async saveDayMeta(day, meta) {
    window.localStorage.setItem(localKey('dayMeta', day), JSON.stringify(meta))
  },
  async listDaysWithDayMeta() {
    const prefix = localKey('dayMeta')
    const out: DayKey[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(prefix)) out.push(k.slice(prefix.length))
    }
    return out
  },
}

function strOrEmpty(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function parseEntries(raw: string): FoodEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { e?: unknown }).e))
        ? (parsed as { e: unknown[] }).e
        : null
    if (!arr) return []
    return arr.map(normalizeEntry).filter((e): e is FoodEntry => e !== null)
  } catch {
    return []
  }
}

function parseWaterEntries(raw: string): WaterEntry[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const arr = Array.isArray(parsed)
      ? parsed
      : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { e?: unknown }).e))
        ? (parsed as { e: unknown[] }).e
        : null
    if (!arr) return []
    return arr.map(normalizeWaterEntry).filter((e): e is WaterEntry => e !== null)
  } catch {
    return []
  }
}

const MEAL_SET: ReadonlySet<MealType> = new Set<MealType>(['b', 'l', 'd', 's'])
const ESTIMATE_SOURCE_SET: ReadonlySet<NutritionEstimateSource> =
  new Set<NutritionEstimateSource>(['ai', 'barcode', 'manual', 'library'])
const PORTION_BASIS_SET: ReadonlySet<NutritionPortionBasis> = new Set<NutritionPortionBasis>([
  'stated_weight',
  'visual_anchor',
  'label',
  'typical_portion',
  'user_edit',
  'unknown',
])
const BRAND_DATA_STATUS_SET: ReadonlySet<BrandDataStatus> =
  new Set<BrandDataStatus>(['not_provided', 'exact', 'estimated'])
const FOOD_LOG_STATUS_SET: ReadonlySet<FoodLogStatus> =
  new Set<FoodLogStatus>(['unknown', 'no_food', 'not_logged'])

function normalizeEntry(x: unknown): FoodEntry | null {
  if (!x || typeof x !== 'object') return null
  const e = x as Record<string, unknown>
  if (typeof e.id !== 'string' || typeof e.date !== 'string') return null
  if (typeof e.quantity !== 'number' || typeof e.createdAt !== 'number') return null
  const entry: FoodEntry = {
    id: e.id,
    date: e.date,
    quantity: e.quantity,
    createdAt: e.createdAt,
  }
  if (typeof e.meal === 'string' && MEAL_SET.has(e.meal as MealType)) {
    entry.meal = e.meal as MealType
  }
  if (typeof e.foodId === 'string' && typeof e.servingId === 'string') {
    entry.foodId = e.foodId
    entry.servingId = e.servingId
  }
  const qa = normalizeQuickAdd(e.quickAdd)
  if (qa) entry.quickAdd = qa
  if (!entry.foodId && !entry.quickAdd) return null
  return entry
}

function normalizeWaterEntry(x: unknown): WaterEntry | null {
  if (!x || typeof x !== 'object') return null
  const e = x as Record<string, unknown>
  if (typeof e.id !== 'string' || typeof e.date !== 'string') return null
  if (typeof e.ml !== 'number' || typeof e.createdAt !== 'number') return null
  const ml = Math.round(e.ml)
  if (!Number.isFinite(ml) || ml <= 0) return null
  return {
    id: e.id,
    date: e.date,
    ml,
    createdAt: e.createdAt,
  }
}

function normalizeQuickAdd(x: unknown): QuickAddData | null {
  if (!x || typeof x !== 'object') return null
  const q = x as Record<string, unknown>
  if (typeof q.name !== 'string' || typeof q.kcal !== 'number') return null
  const out: QuickAddData = { name: q.name, kcal: q.kcal }
  if (typeof q.carbs === 'number') out.carbs = q.carbs
  if (typeof q.fat === 'number') out.fat = q.fat
  if (typeof q.protein === 'number') out.protein = q.protein
  if (typeof q.fiber === 'number') out.fiber = q.fiber
  if (typeof q.alcohol === 'number') out.alcohol = q.alcohol
  const estimate = normalizeEstimate(q.estimate)
  if (estimate) out.estimate = estimate
  return out
}

function parseFood(raw: string): Food | null {
  if (!raw) return null
  try {
    const x = JSON.parse(raw) as Record<string, unknown>
    if (typeof x.id !== 'string' || typeof x.name !== 'string') return null
    if (!Array.isArray(x.servings)) return null
    const servings = x.servings.map(normalizeServing).filter((s): s is Serving => s !== null)
    if (servings.length === 0) return null
    const estimate = normalizeEstimate(x.estimate)
    return {
      id: x.id,
      name: x.name,
      brand: typeof x.brand === 'string' ? x.brand : undefined,
      barcode: typeof x.barcode === 'string' ? x.barcode : undefined,
      servings,
      ...(estimate ? { estimate } : {}),
      favourite: Boolean(x.favourite),
      archived: Boolean(x.archived),
      createdAt: typeof x.createdAt === 'number' ? x.createdAt : 0,
      updatedAt: typeof x.updatedAt === 'number' ? x.updatedAt : 0,
    }
  } catch {
    return null
  }
}

function normalizeEstimate(x: unknown): NutritionEstimate | undefined {
  if (!x || typeof x !== 'object') return undefined
  const r = x as Record<string, unknown>
  if (typeof r.source !== 'string' || !ESTIMATE_SOURCE_SET.has(r.source as NutritionEstimateSource)) {
    return undefined
  }
  const estimate: NutritionEstimate = {
    source: r.source as NutritionEstimateSource,
  }
  if (typeof r.confidence === 'number' && Number.isFinite(r.confidence)) {
    estimate.confidence = Math.max(0, Math.min(1, r.confidence))
  }
  const reason = cleanEstimateText(r.confidenceReason, 160)
  if (reason) estimate.confidenceReason = reason
  if (
    typeof r.portionBasis === 'string' &&
    PORTION_BASIS_SET.has(r.portionBasis as NutritionPortionBasis)
  ) {
    estimate.portionBasis = r.portionBasis as NutritionPortionBasis
  }
  const basisLabel = cleanEstimateText(r.basisLabel, 80)
  if (basisLabel) estimate.basisLabel = basisLabel
  if (
    typeof r.originalPortionBasis === 'string' &&
    PORTION_BASIS_SET.has(r.originalPortionBasis as NutritionPortionBasis)
  ) {
    estimate.originalPortionBasis = r.originalPortionBasis as NutritionPortionBasis
  }
  const originalBasisLabel = cleanEstimateText(r.originalBasisLabel, 80)
  if (originalBasisLabel) estimate.originalBasisLabel = originalBasisLabel
  const dataSource = cleanEstimateText(r.dataSource, 80)
  if (dataSource) estimate.dataSource = dataSource
  if (
    typeof r.brandDataStatus === 'string' &&
    BRAND_DATA_STATUS_SET.has(r.brandDataStatus as BrandDataStatus)
  ) {
    estimate.brandDataStatus = r.brandDataStatus as BrandDataStatus
  }
  const brandDataLabel = cleanEstimateText(r.brandDataLabel, 120)
  if (brandDataLabel) estimate.brandDataLabel = brandDataLabel
  return estimate
}

function cleanEstimateText(x: unknown, limit: number): string | undefined {
  if (typeof x !== 'string') return undefined
  const text = x.trim().replace(/\s+/g, ' ').slice(0, limit)
  return text || undefined
}

function normalizeServing(x: unknown): Serving | null {
  if (!x || typeof x !== 'object') return null
  const s = x as Record<string, unknown>
  if (typeof s.id !== 'string' || typeof s.label !== 'string') return null
  if (typeof s.kcal !== 'number') return null
  return {
    id: s.id,
    label: s.label,
    grams: typeof s.grams === 'number' ? s.grams : undefined,
    kcal: s.kcal,
    carbs: typeof s.carbs === 'number' ? s.carbs : 0,
    fat: typeof s.fat === 'number' ? s.fat : 0,
    protein: typeof s.protein === 'number' ? s.protein : 0,
    fiber: typeof s.fiber === 'number' ? s.fiber : undefined,
    alcohol: typeof s.alcohol === 'number' ? s.alcohol : undefined,
  }
}

function parseMeal(raw: string): Meal | null {
  if (!raw) return null
  try {
    const x = JSON.parse(raw) as Record<string, unknown>
    if (typeof x.id !== 'string' || typeof x.name !== 'string') return null
    if (!Array.isArray(x.items)) return null
    const items = x.items
      .map((it) => {
        if (!it || typeof it !== 'object') return null
        const r = it as Record<string, unknown>
        if (typeof r.foodId !== 'string' || typeof r.servingId !== 'string') return null
        if (typeof r.quantity !== 'number') return null
        return { foodId: r.foodId, servingId: r.servingId, quantity: r.quantity }
      })
      .filter((i): i is Meal['items'][number] => i !== null)
    return {
      id: x.id,
      name: x.name,
      items,
      favourite: Boolean(x.favourite),
      createdAt: typeof x.createdAt === 'number' ? x.createdAt : 0,
      updatedAt: typeof x.updatedAt === 'number' ? x.updatedAt : 0,
    }
  } catch {
    return null
  }
}

function parseRecent(raw: string): RecentList {
  if (!raw) return { entries: [] }
  try {
    const x = JSON.parse(raw) as Record<string, unknown>
    if (!Array.isArray(x.entries)) return { entries: [] }
    const entries = x.entries
      .map((it): RecentItem | null => {
        if (!it || typeof it !== 'object') return null
        const r = it as Record<string, unknown>
        if (typeof r.lastUsedAt !== 'number' || typeof r.usageCount !== 'number') return null
        const item: RecentItem = { lastUsedAt: r.lastUsedAt, usageCount: r.usageCount }
        if (typeof r.foodId === 'string') item.foodId = r.foodId
        const qa = normalizeQuickAdd(r.quickAdd)
        if (qa) item.quickAdd = qa
        if (!item.foodId && !item.quickAdd) return null
        return item
      })
      .filter((i): i is RecentItem => i !== null)
    const usualBundlePrefs = normalizeUsualBundlePrefs(x.usualBundlePrefs)
    return {
      entries,
      ...(usualBundlePrefs.length > 0 ? { usualBundlePrefs } : {}),
    }
  } catch {
    return { entries: [] }
  }
}

function normalizeUsualBundlePrefs(x: unknown): UsualBundlePreference[] {
  if (!Array.isArray(x)) return []
  return x
    .map(normalizeUsualBundlePreference)
    .filter((pref): pref is UsualBundlePreference => pref !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20)
}

function normalizeUsualBundlePreference(x: unknown): UsualBundlePreference | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  if (typeof r.key !== 'string' || typeof r.updatedAt !== 'number') return null
  if (!Array.isArray(r.items)) return null
  const items = r.items
    .map(normalizeUsualBundlePreferenceItem)
    .filter((item): item is UsualBundlePreferenceItem => item !== null)
  if (items.length === 0) return null
  return {
    key: r.key,
    updatedAt: r.updatedAt,
    items,
  }
}

function normalizeUsualBundlePreferenceItem(x: unknown): UsualBundlePreferenceItem | null {
  if (!x || typeof x !== 'object') return null
  const r = x as Record<string, unknown>
  if (typeof r.key !== 'string' || typeof r.factor !== 'number') return null
  if (!Number.isFinite(r.factor) || r.factor < 0) return null
  return {
    key: r.key,
    factor: Math.round(r.factor * 10) / 10,
    included: Boolean(r.included),
  }
}

function parseGoal(raw: string): Goal {
  if (!raw) return { ...DEFAULT_GOAL }
  try {
    const x = JSON.parse(raw) as Record<string, unknown>
    const kcal = typeof x.kcal === 'number' ? x.kcal : DEFAULT_GOAL.kcal
    const carbsPct = typeof x.carbsPct === 'number' ? x.carbsPct : DEFAULT_GOAL.carbsPct
    const fatPct = typeof x.fatPct === 'number' ? x.fatPct : DEFAULT_GOAL.fatPct
    const proteinPct = typeof x.proteinPct === 'number' ? x.proteinPct : DEFAULT_GOAL.proteinPct
    const profile = parseTdeeProfile(x.profile)
    return {
      kcal,
      carbsPct,
      fatPct,
      proteinPct,
      updatedAt: typeof x.updatedAt === 'number' ? x.updatedAt : 0,
      ...(profile ? { profile } : {}),
    }
  } catch {
    return { ...DEFAULT_GOAL }
  }
}

function parseDayMeta(raw: string, day: DayKey): DayMeta | null {
  if (!raw) return null
  try {
    const x = JSON.parse(raw) as Record<string, unknown>
    const rawDay = typeof x.day === 'string' ? x.day : day
    const updatedAt = typeof x.updatedAt === 'number' ? x.updatedAt : 0
    if (!rawDay) return null
    const foodStatus = typeof x.foodStatus === 'string' && FOOD_LOG_STATUS_SET.has(x.foodStatus as FoodLogStatus)
      ? x.foodStatus as FoodLogStatus
      : 'unknown'
    return {
      day: rawDay,
      lazy: Boolean(x.lazy),
      ...(foodStatus !== 'unknown' ? { foodStatus } : {}),
      updatedAt,
    }
  } catch {
    return null
  }
}

function parseTdeeProfile(x: unknown): Goal['profile'] | undefined {
  if (!x || typeof x !== 'object') return undefined
  const p = x as Record<string, unknown>
  if (p.sex !== 'm' && p.sex !== 'f') return undefined
  if (typeof p.age !== 'number' || typeof p.weight !== 'number') return undefined
  if (typeof p.height !== 'number' || typeof p.activity !== 'number') return undefined
  if (typeof p.modifier !== 'number') return undefined
  return {
    sex: p.sex,
    age: p.age,
    weight: p.weight,
    height: p.height,
    activity: p.activity,
    modifier: p.modifier,
  }
}

export function pickCalorieStorage(): CalorieStorage {
  if (canUseRemoteStorage()) return remoteBackend
  return canUseCloudStorage() ? cloudBackend : localBackend
}

export function newCalorieId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
