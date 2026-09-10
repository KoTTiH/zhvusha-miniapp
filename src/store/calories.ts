import { create } from 'zustand'
import { newCalorieId, pickCalorieStorage } from '../lib/calorieStorage'
import { normalizePct } from '../lib/nutrition'
import type { DayKey } from '../types/note'
import {
  type DayMeta,
  DEFAULT_GOAL,
  type Food,
  type FoodEntry,
  type FoodLogStatus,
  type Goal,
  type Meal,
  type MealItem,
  type QuickAddData,
  RECENT_LIMIT,
  type RecentItem,
  type RecentList,
  type Serving,
  type UsualBundlePreference,
  type WaterEntry,
} from '../types/calorie'

type CaloriesState = {
  hydrated: boolean
  daysWithEntries: Set<DayKey>
  entriesByDay: Record<DayKey, FoodEntry[]>
  waterByDay: Record<DayKey, WaterEntry[]>
  dayMetaByDay: Record<DayKey, DayMeta | null>
  loadingDays: Set<DayKey>
  loadingWaterDays: Set<DayKey>
  loadingMetaDays: Set<DayKey>
  foods: Record<string, Food>
  meals: Record<string, Meal>
  recent: RecentList
  goal: Goal

  editorFoodId: string | null
  editorFoodPrefill: Partial<Food> | null
  editorMealId: string | null
  editorGoalOpen: boolean
  addSheet: { day: DayKey; openedAt: number; initialTab?: 'food' | 'note' } | null
  pickerContext: { forMealId: string | null } | null
  scanner: { mode: 'addEntry' | 'editorFill'; day?: DayKey } | null
  scanResult: { food: Food; day: DayKey } | null
  toast: { message: string; undo?: () => void; token: number } | null

  hydrate: () => Promise<void>
  loadDay: (day: DayKey) => Promise<void>
  loadRange: (days: DayKey[]) => Promise<void>
  loadWaterDay: (day: DayKey) => Promise<void>
  loadWaterRange: (days: DayKey[]) => Promise<void>
  loadDayMeta: (day: DayKey) => Promise<void>
  loadDayMetaRange: (days: DayKey[]) => Promise<void>

  addEntry: (
    day: DayKey,
    source:
      | { kind: 'food'; foodId: string; servingId: string; quantity?: number }
      | { kind: 'quick'; data: QuickAddData; quantity?: number }
      | { kind: 'mealTemplate'; mealId: string },
  ) => Promise<void>
  addQuickEntriesBulk: (day: DayKey, items: QuickAddData[]) => Promise<void>
  updateEntry: (
    day: DayKey,
    id: string,
    patch: { quantity?: number; createdAt?: number; quickAdd?: QuickAddData },
  ) => Promise<void>
  deleteEntry: (day: DayKey, id: string) => Promise<void>
  deleteEntryWithUndo: (day: DayKey, id: string) => Promise<void>
  duplicateEntry: (day: DayKey, id: string) => Promise<void>
  copyDay: (fromDay: DayKey, toDay: DayKey) => Promise<void>
  addWater: (day: DayKey, ml: number) => Promise<void>
  deleteWater: (day: DayKey, id: string) => Promise<void>
  setDayLazy: (day: DayKey, lazy?: boolean) => Promise<void>
  setFoodLogStatus: (day: DayKey, status: FoodLogStatus) => Promise<void>

  upsertFood: (food: Food) => Promise<void>
  archiveFood: (id: string) => Promise<void>
  unarchiveFood: (id: string) => Promise<void>
  hardDeleteFood: (id: string) => Promise<boolean>
  toggleFoodFavourite: (id: string) => Promise<void>

  upsertMeal: (meal: Meal) => Promise<void>
  deleteMeal: (id: string) => Promise<void>
  toggleMealFavourite: (id: string) => Promise<void>

  setGoal: (goal: Goal) => Promise<void>
  removeRecent: (item: RecentItem) => Promise<void>
  restoreRecent: (item: RecentItem) => Promise<void>
  replaceRecent: (from: RecentItem, to: RecentItem) => Promise<void>
  rememberUsualBundlePreference: (preference: UsualBundlePreference) => Promise<void>
  forgetUsualBundlePreference: (key: string) => Promise<void>

  openFoodEditor: (id: string | null) => void
  openFoodEditorWith: (prefill: Partial<Food>) => void
  closeFoodEditor: () => void
  openMealEditor: (id: string | null) => void
  closeMealEditor: () => void
  openGoalEditor: () => void
  closeGoalEditor: () => void
  openAddSheet: (day: DayKey, initialTab?: 'food' | 'note') => void
  closeAddSheet: () => void
  openFoodPicker: (forMealId: string | null) => void
  closeFoodPicker: () => void
  openScanner: (mode: 'addEntry' | 'editorFill', day?: DayKey) => void
  closeScanner: () => void
  showScanResult: (food: Food, day: DayKey) => void
  closeScanResult: () => void
  findFoodByBarcode: (code: string) => Food | undefined
  showToast: (message: string, undo?: () => void) => void
  dismissToast: () => void
}

function storage() {
  return pickCalorieStorage()
}

function withSet(prev: Set<DayKey>, op: 'add' | 'delete', key: DayKey): Set<DayKey> {
  const next = new Set(prev)
  if (op === 'add') next.add(key)
  else next.delete(key)
  return next
}

function withSetMany(prev: Set<DayKey>, op: 'add' | 'delete', keys: DayKey[]): Set<DayKey> {
  const next = new Set(prev)
  for (const key of keys) {
    if (op === 'add') next.add(key)
    else next.delete(key)
  }
  return next
}

function snapshotFromFood(food: Food, serving: Serving): QuickAddData {
  return {
    name: food.name,
    kcal: serving.kcal,
    carbs: serving.carbs,
    fat: serving.fat,
    protein: serving.protein,
    ...(food.estimate ? { estimate: food.estimate } : {}),
  }
}

function touchRecent(
  recent: RecentList,
  key: { foodId?: string; quickAdd?: QuickAddData },
  now: number,
): RecentList {
  const entries = recent.entries.slice()
  const sameIdx = entries.findIndex((e) => {
    if (key.foodId && e.foodId === key.foodId) return true
    if (key.quickAdd && e.quickAdd && e.quickAdd.name === key.quickAdd.name && !e.foodId) return true
    return false
  })
  if (sameIdx >= 0) {
    const existing = entries[sameIdx]
    entries.splice(sameIdx, 1)
    entries.unshift({
      foodId: existing.foodId,
      quickAdd: key.quickAdd ?? existing.quickAdd,
      lastUsedAt: now,
      usageCount: existing.usageCount + 1,
    })
  } else {
    entries.unshift({
      foodId: key.foodId,
      quickAdd: key.quickAdd,
      lastUsedAt: now,
      usageCount: 1,
    })
  }
  return { ...recent, entries: entries.slice(0, RECENT_LIMIT) }
}

function sameRecentItem(left: RecentItem, right: RecentItem): boolean {
  if (left.foodId && right.foodId) return left.foodId === right.foodId
  if (left.quickAdd && right.quickAdd && !left.foodId && !right.foodId) {
    return left.quickAdd.name === right.quickAdd.name
  }
  return false
}

function withRestoredRecentItem(recent: RecentList, item: RecentItem): RecentList {
  const entries = recent.entries.filter((entry) => !sameRecentItem(entry, item))
  return {
    ...recent,
    entries: [item, ...entries].slice(0, RECENT_LIMIT),
  }
}

function withReplacedRecentItem(recent: RecentList, from: RecentItem, to: RecentItem): RecentList {
  const entries = recent.entries
    .filter((entry) => !sameRecentItem(entry, from) && !sameRecentItem(entry, to))
  return {
    ...recent,
    entries: [to, ...entries].slice(0, RECENT_LIMIT),
  }
}

function dayMetaWithPatch(
  day: DayKey,
  current: DayMeta | null | undefined,
  patch: { lazy?: boolean; foodStatus?: FoodLogStatus },
): DayMeta {
  const foodStatus = patch.foodStatus ?? current?.foodStatus ?? 'unknown'
  return {
    day,
    lazy: patch.lazy ?? (current?.lazy === true),
    ...(foodStatus !== 'unknown' ? { foodStatus } : {}),
    updatedAt: Date.now(),
  }
}

function dayMetaWithoutFoodStatus(day: DayKey, current: DayMeta | null | undefined): DayMeta | null {
  if (!current?.foodStatus) return null
  return dayMetaWithPatch(day, current, { foodStatus: 'unknown' })
}

function withUsualBundlePreference(
  recent: RecentList,
  preference: UsualBundlePreference,
): RecentList {
  const other = (recent.usualBundlePrefs ?? []).filter((item) => item.key !== preference.key)
  return {
    ...recent,
    usualBundlePrefs: [preference, ...other]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 20),
  }
}

function withoutUsualBundlePreference(recent: RecentList, key: string): RecentList {
  const usualBundlePrefs = (recent.usualBundlePrefs ?? []).filter((item) => item.key !== key)
  const next: RecentList = { ...recent, usualBundlePrefs }
  if (usualBundlePrefs.length === 0) delete next.usualBundlePrefs
  return next
}

function expandMealTemplate(
  meal: Meal,
  foods: Record<string, Food>,
  day: DayKey,
  now: number,
): FoodEntry[] {
  return meal.items
    .filter((it) => foods[it.foodId]?.servings.some((s) => s.id === it.servingId))
    .map((it, i) => ({
      id: newCalorieId('e'),
      date: day,
      quantity: it.quantity,
      createdAt: now + i,
      foodId: it.foodId,
      servingId: it.servingId,
    }))
}

export const useCaloriesStore = create<CaloriesState>((set, get) => ({
  hydrated: false,
  daysWithEntries: new Set<DayKey>(),
  entriesByDay: {},
  waterByDay: {},
  dayMetaByDay: {},
  loadingDays: new Set<DayKey>(),
  loadingWaterDays: new Set<DayKey>(),
  loadingMetaDays: new Set<DayKey>(),
  foods: {},
  meals: {},
  recent: { entries: [] },
  goal: { ...DEFAULT_GOAL },

  editorFoodId: null,
  editorFoodPrefill: null,
  editorMealId: null,
  editorGoalOpen: false,
  addSheet: null,
  pickerContext: null,
  scanner: null,
  scanResult: null,
  toast: null,

  async hydrate() {
    if (get().hydrated) return
    try {
      const s = storage()
      const [days, goal, recent, foods, meals] = await Promise.all([
        s.listDaysWithEntries(),
        s.loadGoal(),
        s.loadRecent(),
        s.listFoods(),
        s.listMeals(),
      ])
      const foodMap: Record<string, Food> = {}
      for (const f of foods) foodMap[f.id] = f
      const mealMap: Record<string, Meal> = {}
      for (const m of meals) mealMap[m.id] = m
      set({
        daysWithEntries: new Set(days),
        goal,
        recent,
        foods: foodMap,
        meals: mealMap,
        hydrated: true,
      })
    } catch {
      set({ hydrated: true })
    }
  },

  async loadDay(day) {
    const { entriesByDay, loadingDays } = get()
    if (entriesByDay[day] || loadingDays.has(day)) return
    set({ loadingDays: withSet(loadingDays, 'add', day) })
    try {
      const entries = await storage().loadDay(day)
      set((st) => ({
        entriesByDay: { ...st.entriesByDay, [day]: entries },
        loadingDays: withSet(st.loadingDays, 'delete', day),
        daysWithEntries: entries.length > 0
          ? withSet(st.daysWithEntries, 'add', day)
          : st.daysWithEntries,
      }))
    } catch {
      set((st) => ({ loadingDays: withSet(st.loadingDays, 'delete', day) }))
    }
  },

  async loadRange(days) {
    const { entriesByDay, loadingDays } = get()
    const missing = days.filter((d) => !(d in entriesByDay) && !loadingDays.has(d))
    if (missing.length === 0) return
    set({ loadingDays: withSetMany(loadingDays, 'add', missing) })
    try {
      const loaded = await storage().loadDays(missing)
      set((st) => {
        const completeLoaded: Record<DayKey, FoodEntry[]> = {}
        for (const day of missing) completeLoaded[day] = loaded[day] ?? []
        const mergedEntries = { ...st.entriesByDay, ...completeLoaded }
        const mergedDays = new Set(st.daysWithEntries)
        for (const [day, entries] of Object.entries(completeLoaded)) {
          if (entries.length > 0) mergedDays.add(day)
          else mergedDays.delete(day)
        }
        return {
          entriesByDay: mergedEntries,
          daysWithEntries: mergedDays,
          loadingDays: withSetMany(st.loadingDays, 'delete', missing),
        }
      })
    } catch {
      set((st) => ({ loadingDays: withSetMany(st.loadingDays, 'delete', missing) }))
    }
  },

  async loadWaterDay(day) {
    const { waterByDay, loadingWaterDays } = get()
    if (waterByDay[day] || loadingWaterDays.has(day)) return
    set({ loadingWaterDays: withSet(loadingWaterDays, 'add', day) })
    try {
      const water = await storage().loadWaterDay(day)
      set((st) => ({
        waterByDay: { ...st.waterByDay, [day]: water },
        loadingWaterDays: withSet(st.loadingWaterDays, 'delete', day),
      }))
    } catch {
      set((st) => ({ loadingWaterDays: withSet(st.loadingWaterDays, 'delete', day) }))
    }
  },

  async loadWaterRange(days) {
    const { waterByDay, loadingWaterDays } = get()
    const missing = days.filter((d) => !(d in waterByDay) && !loadingWaterDays.has(d))
    if (missing.length === 0) return
    set({ loadingWaterDays: withSetMany(loadingWaterDays, 'add', missing) })
    try {
      const loaded = await storage().loadWaterDays(missing)
      const completeLoaded: Record<DayKey, WaterEntry[]> = {}
      for (const day of missing) completeLoaded[day] = loaded[day] ?? []
      set((st) => ({
        waterByDay: { ...st.waterByDay, ...completeLoaded },
        loadingWaterDays: withSetMany(st.loadingWaterDays, 'delete', missing),
      }))
    } catch {
      set((st) => ({ loadingWaterDays: withSetMany(st.loadingWaterDays, 'delete', missing) }))
    }
  },

  async loadDayMeta(day) {
    const { dayMetaByDay, loadingMetaDays } = get()
    if (day in dayMetaByDay || loadingMetaDays.has(day)) return
    set({ loadingMetaDays: withSet(loadingMetaDays, 'add', day) })
    try {
      const meta = await storage().loadDayMeta(day)
      set((st) => ({
        dayMetaByDay: { ...st.dayMetaByDay, [day]: meta },
        loadingMetaDays: withSet(st.loadingMetaDays, 'delete', day),
      }))
    } catch {
      set((st) => ({ loadingMetaDays: withSet(st.loadingMetaDays, 'delete', day) }))
    }
  },

  async loadDayMetaRange(days) {
    const { dayMetaByDay, loadingMetaDays } = get()
    const missing = days.filter((d) => !(d in dayMetaByDay) && !loadingMetaDays.has(d))
    if (missing.length === 0) return
    set({ loadingMetaDays: withSetMany(loadingMetaDays, 'add', missing) })
    try {
      const loaded = await storage().loadDayMetaRange(missing)
      const completeLoaded: Record<DayKey, DayMeta | null> = {}
      for (const day of missing) completeLoaded[day] = loaded[day] ?? null
      set((st) => ({
        dayMetaByDay: { ...st.dayMetaByDay, ...completeLoaded },
        loadingMetaDays: withSetMany(st.loadingMetaDays, 'delete', missing),
      }))
    } catch {
      set((st) => ({ loadingMetaDays: withSetMany(st.loadingMetaDays, 'delete', missing) }))
    }
  },

  async addEntry(day, source) {
    const now = Date.now()
    const current = get().entriesByDay[day] ?? []
    let newEntries: FoodEntry[] = []
    let recentKey: { foodId?: string; quickAdd?: QuickAddData } | null = null

    if (source.kind === 'quick') {
      const qty = source.quantity ?? 1
      const entry: FoodEntry = {
        id: newCalorieId('e'),
        date: day,
        quantity: qty,
        createdAt: now,
        quickAdd: source.data,
      }
      newEntries = [entry]
      recentKey = { quickAdd: source.data }
    } else if (source.kind === 'food') {
      const food = get().foods[source.foodId]
      if (!food) return
      const serving = food.servings.find((s) => s.id === source.servingId)
      if (!serving) return
      const qty = source.quantity ?? 1
      const entry: FoodEntry = {
        id: newCalorieId('e'),
        date: day,
        quantity: qty,
        createdAt: now,
        foodId: food.id,
        servingId: serving.id,
      }
      newEntries = [entry]
      recentKey = { foodId: food.id, quickAdd: snapshotFromFood(food, serving) }
    } else if (source.kind === 'mealTemplate') {
      const mealTpl = get().meals[source.mealId]
      if (!mealTpl) return
      newEntries = expandMealTemplate(mealTpl, get().foods, day, now)
      if (newEntries.length === 0) return
    }

    const next = [...current, ...newEntries]
    const nextRecent = recentKey ? touchRecent(get().recent, recentKey, now) : get().recent
    const nextMeta = dayMetaWithoutFoodStatus(day, get().dayMetaByDay[day])
    set((st) => ({
      entriesByDay: { ...st.entriesByDay, [day]: next },
      daysWithEntries: withSet(st.daysWithEntries, 'add', day),
      recent: nextRecent,
      ...(nextMeta ? { dayMetaByDay: { ...st.dayMetaByDay, [day]: nextMeta } } : {}),
    }))
    await Promise.all([
      storage().saveDay(day, next),
      recentKey ? storage().saveRecent(nextRecent) : Promise.resolve(),
      nextMeta ? storage().saveDayMeta(day, nextMeta) : Promise.resolve(),
    ])
  },

  /**
   * Пакетное добавление quick-записей за день. Критично для AI-анализа
   * нескольких блюд: один setItem в CloudStorage вместо N (Telegram
   * rate-лимитит частые setItem и ронял «не всё записалось»).
   */
  async addQuickEntriesBulk(day, items) {
    if (items.length === 0) return
    const now = Date.now()
    const current = get().entriesByDay[day] ?? []
    const newEntries: FoodEntry[] = items.map((data, i) => ({
      id: newCalorieId('e'),
      date: day,
      quantity: 1,
      createdAt: now + i,
      quickAdd: data,
    }))
    const next = [...current, ...newEntries]
    // В recent кладём несколько последних AI-блюд, но сохраняем список одним
    // setItem. Так пачка из 5-10 блюд потом повторяется в один тап без серии
    // CloudStorage-записей.
    const recentItems = items.slice(-Math.min(5, items.length))
    let nextRecent = get().recent
    for (const item of recentItems) {
      nextRecent = touchRecent(nextRecent, { quickAdd: item }, now)
    }
    const nextMeta = dayMetaWithoutFoodStatus(day, get().dayMetaByDay[day])
    set((st) => ({
      entriesByDay: { ...st.entriesByDay, [day]: next },
      daysWithEntries: withSet(st.daysWithEntries, 'add', day),
      recent: nextRecent,
      ...(nextMeta ? { dayMetaByDay: { ...st.dayMetaByDay, [day]: nextMeta } } : {}),
    }))
    await Promise.all([
      storage().saveDay(day, next),
      storage().saveRecent(nextRecent),
      nextMeta ? storage().saveDayMeta(day, nextMeta) : Promise.resolve(),
    ])
  },

  async updateEntry(day, id, patch) {
    const current = get().entriesByDay[day] ?? []
    const next = current.map((e) =>
      e.id === id
        ? {
            ...e,
            quantity: patch.quantity ?? e.quantity,
            createdAt: patch.createdAt ?? e.createdAt,
            quickAdd: patch.quickAdd ?? e.quickAdd,
          }
        : e,
    )
    set((st) => ({ entriesByDay: { ...st.entriesByDay, [day]: next } }))
    await storage().saveDay(day, next)
  },

  async deleteEntry(day, id) {
    const current = get().entriesByDay[day] ?? []
    const next = current.filter((e) => e.id !== id)
    set((st) => ({
      entriesByDay: { ...st.entriesByDay, [day]: next },
      daysWithEntries: next.length === 0
        ? withSet(st.daysWithEntries, 'delete', day)
        : st.daysWithEntries,
    }))
    await storage().saveDay(day, next)
  },

  async deleteEntryWithUndo(day, id) {
    const snapshot = (get().entriesByDay[day] ?? []).slice()
    await get().deleteEntry(day, id)
    get().showToast('Запись удалена', async () => {
      set((st) => ({
        entriesByDay: { ...st.entriesByDay, [day]: snapshot },
        daysWithEntries: snapshot.length > 0
          ? withSet(st.daysWithEntries, 'add', day)
          : st.daysWithEntries,
      }))
      await storage().saveDay(day, snapshot)
    })
  },

  async duplicateEntry(day, id) {
    const current = get().entriesByDay[day] ?? []
    const src = current.find((e) => e.id === id)
    if (!src) return
    const now = Date.now()
    const copy: FoodEntry = {
      ...src,
      id: newCalorieId('e'),
      createdAt: now,
    }
    const next = [...current, copy]
    const nextMeta = dayMetaWithoutFoodStatus(day, get().dayMetaByDay[day])
    set((st) => ({
      entriesByDay: { ...st.entriesByDay, [day]: next },
      daysWithEntries: withSet(st.daysWithEntries, 'add', day),
      ...(nextMeta ? { dayMetaByDay: { ...st.dayMetaByDay, [day]: nextMeta } } : {}),
    }))
    await Promise.all([
      storage().saveDay(day, next),
      nextMeta ? storage().saveDayMeta(day, nextMeta) : Promise.resolve(),
    ])
  },

  async copyDay(fromDay, toDay) {
    await get().loadDay(fromDay)
    await get().loadDay(toDay)
    const src = get().entriesByDay[fromDay] ?? []
    if (src.length === 0) return
    const now = Date.now()
    const copies: FoodEntry[] = src.map((e, i) => ({
      ...e,
      id: newCalorieId('e'),
      date: toDay,
      createdAt: now + i,
    }))
    const existing = get().entriesByDay[toDay] ?? []
    const next = [...existing, ...copies]
    const nextMeta = dayMetaWithoutFoodStatus(toDay, get().dayMetaByDay[toDay])
    set((st) => ({
      entriesByDay: { ...st.entriesByDay, [toDay]: next },
      daysWithEntries: withSet(st.daysWithEntries, 'add', toDay),
      ...(nextMeta ? { dayMetaByDay: { ...st.dayMetaByDay, [toDay]: nextMeta } } : {}),
    }))
    await Promise.all([
      storage().saveDay(toDay, next),
      nextMeta ? storage().saveDayMeta(toDay, nextMeta) : Promise.resolve(),
    ])
  },

  async addWater(day, ml) {
    const normalized = Math.max(0, Math.round(ml))
    if (!Number.isFinite(normalized) || normalized <= 0) return
    const now = Date.now()
    const current = get().waterByDay[day] ?? []
    const entry: WaterEntry = {
      id: newCalorieId('w'),
      date: day,
      ml: Math.min(5000, normalized),
      createdAt: now,
    }
    const next = [...current, entry]
    set((st) => ({ waterByDay: { ...st.waterByDay, [day]: next } }))
    await storage().saveWaterDay(day, next)
  },

  async deleteWater(day, id) {
    const current = get().waterByDay[day] ?? []
    const next = current.filter((e) => e.id !== id)
    set((st) => ({ waterByDay: { ...st.waterByDay, [day]: next } }))
    await storage().saveWaterDay(day, next)
  },

  async setDayLazy(day, lazy = true) {
    const meta = dayMetaWithPatch(day, get().dayMetaByDay[day], { lazy })
    set((st) => ({ dayMetaByDay: { ...st.dayMetaByDay, [day]: meta } }))
    await storage().saveDayMeta(day, meta)
  },

  async setFoodLogStatus(day, status) {
    const meta = dayMetaWithPatch(day, get().dayMetaByDay[day], { foodStatus: status })
    set((st) => ({ dayMetaByDay: { ...st.dayMetaByDay, [day]: meta } }))
    await storage().saveDayMeta(day, meta)
  },

  async upsertFood(food) {
    const next = { ...get().foods, [food.id]: food }
    set({ foods: next })
    await storage().saveFood(food)
  },

  async archiveFood(id) {
    const existing = get().foods[id]
    if (!existing) return
    const updated: Food = { ...existing, archived: true, updatedAt: Date.now() }
    const next = { ...get().foods, [id]: updated }
    set({ foods: next })
    await storage().saveFood(updated)
  },

  async unarchiveFood(id) {
    const existing = get().foods[id]
    if (!existing) return
    const updated: Food = { ...existing, archived: false, updatedAt: Date.now() }
    const next = { ...get().foods, [id]: updated }
    set({ foods: next })
    await storage().saveFood(updated)
  },

  async hardDeleteFood(id) {
    const foodToDelete = get().foods[id]
    if (!foodToDelete) return false

    const allDays = Array.from(get().daysWithEntries)
    const missingDays = allDays.filter((d) => !(d in get().entriesByDay))
    if (missingDays.length > 0) {
      const loaded = await storage().loadDays(missingDays)
      set((st) => ({ entriesByDay: { ...st.entriesByDay, ...loaded } }))
    }

    const entriesByDay = get().entriesByDay
    const nextEntriesByDay: Record<DayKey, FoodEntry[]> = { ...entriesByDay }
    const daysToSave: { day: DayKey; entries: FoodEntry[] }[] = []

    for (const [day, entries] of Object.entries(entriesByDay)) {
      let changed = false
      const next = entries.map((e) => {
        if (e.foodId !== id) return e
        changed = true
        const serving = foodToDelete.servings.find((s) => s.id === e.servingId)
        const frozen: QuickAddData = serving
          ? {
              name: foodToDelete.name,
              kcal: serving.kcal,
              carbs: serving.carbs,
              fat: serving.fat,
              protein: serving.protein,
              ...(serving.fiber !== undefined ? { fiber: serving.fiber } : {}),
              ...(serving.alcohol !== undefined ? { alcohol: serving.alcohol } : {}),
              ...(foodToDelete.estimate ? { estimate: foodToDelete.estimate } : {}),
            }
          : { name: foodToDelete.name, kcal: 0 }
        const { foodId: _f, servingId: _s, ...rest } = e
        void _f
        void _s
        return { ...rest, quickAdd: frozen }
      })
      if (changed) {
        nextEntriesByDay[day] = next
        daysToSave.push({ day, entries: next })
      }
    }

    const nextMeals: Record<string, Meal> = { ...get().meals }
    const mealsToSave: Meal[] = []
    for (const [mid, meal] of Object.entries(get().meals)) {
      const filtered = meal.items.filter((it) => it.foodId !== id)
      if (filtered.length !== meal.items.length) {
        const updated = { ...meal, items: filtered, updatedAt: Date.now() }
        nextMeals[mid] = updated
        mealsToSave.push(updated)
      }
    }

    const nextRecent: RecentList = {
      ...get().recent,
      entries: get().recent.entries.filter((e) => e.foodId !== id),
    }

    const { [id]: _removed, ...restFoods } = get().foods
    void _removed

    set({
      foods: restFoods,
      entriesByDay: nextEntriesByDay,
      meals: nextMeals,
      recent: nextRecent,
    })

    await Promise.all([
      storage().deleteFood(id),
      ...daysToSave.map(({ day, entries }) => storage().saveDay(day, entries)),
      ...mealsToSave.map((m) => storage().saveMeal(m)),
      storage().saveRecent(nextRecent),
    ])

    return true
  },

  async toggleFoodFavourite(id) {
    const existing = get().foods[id]
    if (!existing) return
    const updated: Food = { ...existing, favourite: !existing.favourite, updatedAt: Date.now() }
    const next = { ...get().foods, [id]: updated }
    set({ foods: next })
    await storage().saveFood(updated)
  },

  async upsertMeal(meal) {
    const next = { ...get().meals, [meal.id]: meal }
    set({ meals: next })
    await storage().saveMeal(meal)
  },

  async deleteMeal(id) {
    const { [id]: _removed, ...rest } = get().meals
    void _removed
    set({ meals: rest })
    await storage().deleteMeal(id)
  },

  async toggleMealFavourite(id) {
    const existing = get().meals[id]
    if (!existing) return
    const updated: Meal = { ...existing, favourite: !existing.favourite, updatedAt: Date.now() }
    const next = { ...get().meals, [id]: updated }
    set({ meals: next })
    await storage().saveMeal(updated)
  },

  async setGoal(goal) {
    const pct = normalizePct(goal.carbsPct, goal.fatPct, goal.proteinPct)
    const normalized: Goal = {
      kcal: Math.max(0, Math.round(goal.kcal)),
      ...pct,
      updatedAt: Date.now(),
      ...(goal.profile ? { profile: goal.profile } : {}),
    }
    set({ goal: normalized })
    await storage().saveGoal(normalized)
  },

  async removeRecent(item) {
    const nextEntries = get().recent.entries.filter((e) => !sameRecentItem(e, item))
    const next: RecentList = { ...get().recent, entries: nextEntries }
    set({ recent: next })
    await storage().saveRecent(next)
  },

  async restoreRecent(item) {
    const next = withRestoredRecentItem(get().recent, item)
    set({ recent: next })
    await storage().saveRecent(next)
  },

  async replaceRecent(from, to) {
    const next = withReplacedRecentItem(get().recent, from, to)
    set({ recent: next })
    await storage().saveRecent(next)
  },

  async rememberUsualBundlePreference(preference) {
    const next = withUsualBundlePreference(get().recent, preference)
    set({ recent: next })
    await storage().saveRecent(next)
  },

  async forgetUsualBundlePreference(key) {
    const next = withoutUsualBundlePreference(get().recent, key)
    set({ recent: next })
    await storage().saveRecent(next)
  },

  openFoodEditor(id) {
    set({ editorFoodId: id ?? '__new__', editorFoodPrefill: null })
  },
  openFoodEditorWith(prefill) {
    set({ editorFoodId: '__new__', editorFoodPrefill: prefill })
  },
  closeFoodEditor() {
    set({ editorFoodId: null, editorFoodPrefill: null })
  },
  openMealEditor(id) {
    set({ editorMealId: id ?? '__new__' })
  },
  closeMealEditor() {
    set({ editorMealId: null })
  },
  openGoalEditor() {
    set({ editorGoalOpen: true })
  },
  closeGoalEditor() {
    set({ editorGoalOpen: false })
  },

  openAddSheet(day, initialTab) {
    set({ addSheet: { day, openedAt: Date.now(), initialTab } })
  },
  closeAddSheet() {
    set({ addSheet: null })
  },

  openFoodPicker(forMealId) {
    set({ pickerContext: { forMealId } })
  },
  closeFoodPicker() {
    set({ pickerContext: null })
  },

  openScanner(mode, day) {
    set({ scanner: { mode, day } })
  },
  closeScanner() {
    set({ scanner: null })
  },
  showScanResult(food, day) {
    set({ scanResult: { food, day } })
  },
  closeScanResult() {
    set({ scanResult: null })
  },
  findFoodByBarcode(code) {
    if (!code) return undefined
    const foods = get().foods
    for (const id in foods) {
      const f = foods[id]
      if (f.barcode && f.barcode === code && !f.archived) return f
    }
    return undefined
  },

  showToast(message, undo) {
    set({ toast: { message, undo, token: Date.now() } })
  },
  dismissToast() {
    set({ toast: null })
  },
}))

export function createEmptyFood(): Food {
  const now = Date.now()
  return {
    id: newCalorieId('f'),
    name: '',
    servings: [createEmptyServing()],
    favourite: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function createEmptyServing(): Serving {
  return {
    id: newCalorieId('s'),
    label: '1 порц.',
    kcal: 0,
    carbs: 0,
    fat: 0,
    protein: 0,
  }
}

export function createEmptyMeal(): Meal {
  const now = Date.now()
  return {
    id: newCalorieId('m'),
    name: '',
    items: [],
    favourite: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function isMealItemValid(it: MealItem, foods: Record<string, Food>): boolean {
  const f = foods[it.foodId]
  if (!f) return false
  return f.servings.some((s) => s.id === it.servingId)
}
