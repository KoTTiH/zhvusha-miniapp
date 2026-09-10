import { loadColors, resolveColor, saveColors } from './colors'
import { pickCalorieStorage } from './calorieStorage'
import { pickStorage, getStorageKind, type StorageKind } from './storage'
import {
  loadAccent,
  loadCalorieDeviationColor,
  loadCalorieDeviationEnabled,
  loadCalorieDeviationSavedColors,
  loadFoodColor,
  loadFoodColorEnabled,
  loadFoodSavedColors,
  normalizeThemeHex,
  saveAccent,
  saveCalorieDeviationColor,
  saveCalorieDeviationEnabled,
  saveCalorieDeviationSavedColors,
  saveFoodColor,
  saveFoodColorEnabled,
  saveFoodSavedColors,
} from './themeStorage'
import {
  loadWaterColorMode,
  loadWaterGoalMl,
  loadWaterQuickAmounts,
  saveWaterColorMode,
  saveWaterGoalMl,
  saveWaterQuickAmounts,
  type WaterColorMode,
} from './water'
import { useCaloriesStore } from '../store/calories'
import { useNotesStore } from '../store/notes'
import { useThemeStore } from '../store/theme'
import { useWidgetsStore } from '../store/widgets'
import type {
  DayMeta,
  Food,
  FoodEntry,
  Goal,
  Meal,
  MealType,
  NutritionEstimate,
  NutritionEstimateSource,
  NutritionPortionBasis,
  QuickAddData,
  RecentList,
  Serving,
  TdeeProfile,
  UsualBundlePreference,
  UsualBundlePreferenceItem,
  WaterEntry,
} from '../types/calorie'
import type { DayKey, Note } from '../types/note'
import { WIDGET_IDS, type WidgetId, type WidgetInstance } from '../types/widget'

export type ZhvushaExportDay = {
  foodEntries: FoodEntry[]
  water: WaterEntry[]
  notes: Note[]
  dayMeta: DayMeta | null
}

export type ZhvushaExport = {
  app: 'zhvusha-miniapp'
  version: 1
  exportedAt: string
  fingerprint: string
  storageKind: StorageKind
  scope: 'current-user'
  counts: {
    days: number
    foodEntries: number
    waterEntries: number
    notes: number
    lazyDays: number
    foods: number
    meals: number
    recent: number
    widgets: number
  }
  data: {
    days: Record<DayKey, ZhvushaExportDay>
    foods: Food[]
    meals: Meal[]
    recent: RecentList
    goal: Goal
    settings: {
      calendarMode: ReturnType<typeof useNotesStore.getState>['calendarMode']
      noteColors: string[]
      theme: {
        accent: string
        calorieDeviationEnabled: boolean
        calorieDeviationColor: string
        calorieDeviationSavedColors: string[]
        foodColorEnabled: boolean
        foodColor: string
        foodSavedColors: string[]
      }
      water: {
        goalMl: number
        colorMode: ReturnType<typeof loadWaterColorMode>
        quickAmounts: [number, number]
      }
      widgets: WidgetInstance[]
    }
  }
}

export type ZhvushaImportSummary = {
  fingerprint: string
  days: number
  foodEntries: number
  waterEntries: number
  notes: number
  dayMeta: number
  foods: number
  meals: number
  recent: number
  settingsApplied: boolean
  widgets: number
}

export type ZhvushaImportPreview = {
  exportedAt: string
  fingerprint: string
  storageKind: StorageKind
  days: number
  foodEntries: number
  waterEntries: number
  notes: number
  dayMeta: number
  foods: number
  meals: number
  recent: number
  widgets: number
}

type DataImportParseResult =
  | { ok: true; data: ZhvushaExport }
  | { ok: false; message: string }

type DataImportPreviewResult =
  | { ok: true; data: ZhvushaExport; preview: ZhvushaImportPreview }
  | { ok: false; message: string }

export async function buildDataExport(): Promise<ZhvushaExport> {
  const calorieStorage = pickCalorieStorage()
  const noteStorage = pickStorage()

  const [
    foodDays,
    waterDays,
    metaDays,
    noteDays,
    foods,
    meals,
    recent,
    goal,
  ] = await Promise.all([
    calorieStorage.listDaysWithEntries(),
    calorieStorage.listDaysWithWater(),
    calorieStorage.listDaysWithDayMeta(),
    noteStorage.listDaysWithNotes(),
    calorieStorage.listFoods(),
    calorieStorage.listMeals(),
    calorieStorage.loadRecent(),
    calorieStorage.loadGoal(),
  ])

  const days = sortDays(uniqueDays([...foodDays, ...waterDays, ...metaDays, ...noteDays]))
  const [entriesByDay, waterByDay, metaByDay, notesByDay] = await Promise.all([
    calorieStorage.loadDays(days),
    calorieStorage.loadWaterDays(days),
    calorieStorage.loadDayMetaRange(days),
    noteStorage.loadMany(days),
  ])

  const dayMap: Record<DayKey, ZhvushaExportDay> = {}
  for (const day of days) {
    dayMap[day] = {
      foodEntries: entriesByDay[day] ?? [],
      water: waterByDay[day] ?? [],
      notes: notesByDay[day] ?? [],
      dayMeta: metaByDay[day] ?? null,
    }
  }

  const widgets = useWidgetsStore.getState().widgets.map((widget) => ({ ...widget }))
  const calendarMode = useNotesStore.getState().calendarMode

  const draft: Omit<ZhvushaExport, 'fingerprint'> = {
    app: 'zhvusha-miniapp',
    version: 1,
    exportedAt: new Date().toISOString(),
    storageKind: getStorageKind(),
    scope: 'current-user',
    counts: {
      days: days.length,
      foodEntries: days.reduce((sum, day) => sum + dayMap[day].foodEntries.length, 0),
      waterEntries: days.reduce((sum, day) => sum + dayMap[day].water.length, 0),
      notes: days.reduce((sum, day) => sum + dayMap[day].notes.length, 0),
      lazyDays: days.reduce((sum, day) => sum + Number(dayMap[day].dayMeta?.lazy === true), 0),
      foods: foods.length,
      meals: meals.length,
      recent: recent.entries.length,
      widgets: widgets.length,
    },
    data: {
      days: dayMap,
      foods,
      meals,
      recent,
      goal,
      settings: {
        calendarMode,
        noteColors: loadColors(),
        theme: {
          accent: loadAccent(),
          calorieDeviationEnabled: loadCalorieDeviationEnabled(),
          calorieDeviationColor: loadCalorieDeviationColor(),
          calorieDeviationSavedColors: loadCalorieDeviationSavedColors(),
          foodColorEnabled: loadFoodColorEnabled(),
          foodColor: loadFoodColor(),
          foodSavedColors: loadFoodSavedColors(),
        },
        water: {
          goalMl: loadWaterGoalMl(),
          colorMode: loadWaterColorMode(),
          quickAmounts: loadWaterQuickAmounts(),
        },
        widgets,
      },
    },
  }
  return { ...draft, fingerprint: exportFingerprint(draft) }
}

export function serializeDataExport(data: ZhvushaExport): string {
  return `${JSON.stringify(data, null, 2)}\n`
}

export function exportFingerprint(data: Omit<ZhvushaExport, 'fingerprint'> | ZhvushaExport): string {
  return fnv32Hex(stableStringify(stripFingerprint(data)))
}

function stripFingerprint(data: Omit<ZhvushaExport, 'fingerprint'> | ZhvushaExport): unknown {
  const copy: Partial<ZhvushaExport> = { ...(data as ZhvushaExport) }
  delete copy.fingerprint
  return copy
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const raw = value as Record<string, unknown>
  const keys = Object.keys(raw).filter((key) => raw[key] !== undefined).sort()
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(raw[key])}`).join(',')}}`
}

function fnv32Hex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function dataExportFilename(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10)
  return `zhvusha-export-${stamp}.json`
}

export function downloadDataExport(data: ZhvushaExport, json = serializeDataExport(data)): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return false
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json;charset=utf-8' }))
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = dataExportFilename(new Date(data.exportedAt))
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
    return true
  } finally {
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export async function copyDataExportToClipboard(json: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(json)
    return true
  } catch {
    return false
  }
}

export function parseDataImport(json: string): DataImportParseResult {
  try {
    const parsed = JSON.parse(json) as unknown
    const data = normalizeDataExport(parsed)
    if (!data) return { ok: false, message: 'это не экспорт Жвуши' }
    return { ok: true, data }
  } catch {
    return { ok: false, message: 'JSON не читается' }
  }
}

export function previewDataImport(json: string): DataImportPreviewResult {
  const parsed = parseDataImport(json)
  if (!parsed.ok) return parsed
  return {
    ok: true,
    data: parsed.data,
    preview: summarizeDataImport(parsed.data),
  }
}

export function summarizeDataImport(data: ZhvushaExport): ZhvushaImportPreview {
  const days = sortDays(Object.keys(data.data.days).filter(isDayKey))
  return {
    exportedAt: data.exportedAt,
    fingerprint: data.fingerprint,
    storageKind: data.storageKind,
    days: days.length,
    foodEntries: days.reduce((sum, day) => sum + data.data.days[day].foodEntries.length, 0),
    waterEntries: days.reduce((sum, day) => sum + data.data.days[day].water.length, 0),
    notes: days.reduce((sum, day) => sum + data.data.days[day].notes.length, 0),
    dayMeta: days.reduce((sum, day) => sum + Number(data.data.days[day].dayMeta !== null), 0),
    foods: data.data.foods.length,
    meals: data.data.meals.length,
    recent: data.data.recent.entries.length,
    widgets: data.data.settings.widgets.length,
  }
}

export async function importDataExport(json: string): Promise<ZhvushaImportSummary> {
  const parsed = parseDataImport(json)
  if (!parsed.ok) throw new Error(parsed.message)

  const data = parsed.data
  const calorieStorage = pickCalorieStorage()
  const noteStorage = pickStorage()
  const days = sortDays(Object.keys(data.data.days).filter(isDayKey))
  const summary: ZhvushaImportSummary = {
    fingerprint: data.fingerprint,
    days: days.length,
    foodEntries: 0,
    waterEntries: 0,
    notes: 0,
    dayMeta: 0,
    foods: 0,
    meals: 0,
    recent: 0,
    settingsApplied: false,
    widgets: 0,
  }

  const [currentEntries, currentWater, currentMeta, currentNotes] = await Promise.all([
    calorieStorage.loadDays(days),
    calorieStorage.loadWaterDays(days),
    calorieStorage.loadDayMetaRange(days),
    noteStorage.loadMany(days),
  ])

  const importedEntriesByDay: Record<DayKey, FoodEntry[]> = {}
  const importedWaterByDay: Record<DayKey, WaterEntry[]> = {}
  const importedMetaByDay: Record<DayKey, DayMeta | null> = {}
  const importedNotesByDay: Record<DayKey, Note[]> = {}

  await Promise.all(days.map(async (day) => {
    const imported = data.data.days[day]

    if (imported.foodEntries.length > 0) {
      const mergedFoodEntries = mergeById(
        currentEntries[day] ?? [],
        imported.foodEntries,
        entryTime,
      )
      importedEntriesByDay[day] = mergedFoodEntries
      summary.foodEntries += imported.foodEntries.length
      await calorieStorage.saveDay(day, mergedFoodEntries)
    }

    if (imported.water.length > 0) {
      const mergedWater = mergeById(currentWater[day] ?? [], imported.water, entryTime)
      importedWaterByDay[day] = mergedWater
      summary.waterEntries += imported.water.length
      await calorieStorage.saveWaterDay(day, mergedWater)
    }

    if (imported.notes.length > 0) {
      const mergedNotes = mergeById(currentNotes[day] ?? [], imported.notes, noteTime)
      importedNotesByDay[day] = mergedNotes
      summary.notes += imported.notes.length
      await noteStorage.saveDay(day, mergedNotes)
    }

    if (imported.dayMeta) {
      const current = currentMeta[day] ?? null
      const next = !current || imported.dayMeta.updatedAt >= current.updatedAt
        ? imported.dayMeta
        : current
      importedMetaByDay[day] = next
      summary.dayMeta += 1
      await calorieStorage.saveDayMeta(day, next)
    }
  }))

  const [currentFoods, currentMeals, currentRecent] = await Promise.all([
    calorieStorage.listFoods(),
    calorieStorage.listMeals(),
    calorieStorage.loadRecent(),
  ])

  const foodsToSave = mergeEntitiesToSave(currentFoods, data.data.foods)
  const mealsToSave = mergeEntitiesToSave(currentMeals, data.data.meals)
  await Promise.all([
    ...foodsToSave.map((food) => calorieStorage.saveFood(food)),
    ...mealsToSave.map((meal) => calorieStorage.saveMeal(meal)),
  ])
  summary.foods = data.data.foods.length
  summary.meals = data.data.meals.length

  const mergedRecent = mergeRecent(currentRecent, data.data.recent)
  summary.recent = data.data.recent.entries.length
  await calorieStorage.saveRecent(mergedRecent)

  await calorieStorage.saveGoal(data.data.goal)
  applyImportedSettings(data)
  summary.settingsApplied = true
  summary.widgets = data.data.settings.widgets.length

  syncStoresAfterImport({
    data,
    importedEntriesByDay,
    importedWaterByDay,
    importedMetaByDay,
    importedNotesByDay,
    mergedRecent,
    foodsToSave,
    mealsToSave,
  })

  return summary
}

function uniqueDays(days: DayKey[]): DayKey[] {
  return Array.from(new Set(days.filter(isDayKey)))
}

function sortDays(days: DayKey[]): DayKey[] {
  return [...days].sort((a, b) => a.localeCompare(b))
}

function isDayKey(day: string): day is DayKey {
  return /^\d{4}-\d{2}-\d{2}$/.test(day)
}

function normalizeDataExport(input: unknown): ZhvushaExport | null {
  const root = asRecord(input)
  if (!root || root.app !== 'zhvusha-miniapp' || root.version !== 1) return null
  const data = asRecord(root.data)
  if (!data) return null
  const daysRaw = asRecord(data.days)
  if (!daysRaw) return null
  const days: Record<DayKey, ZhvushaExportDay> = {}
  for (const [day, rawDay] of Object.entries(daysRaw)) {
    if (!isDayKey(day)) continue
    const normalizedDay = normalizeExportDay(rawDay, day)
    if (normalizedDay) days[day] = normalizedDay
  }
  const goal = normalizeGoal(data.goal)
  if (!goal) return null
  const settings = normalizeSettings(data.settings)
  if (!settings) return null
  const normalized: Omit<ZhvushaExport, 'fingerprint'> = {
    app: 'zhvusha-miniapp',
    version: 1,
    exportedAt: typeof root.exportedAt === 'string' ? root.exportedAt : new Date(0).toISOString(),
    storageKind: normalizeStorageKind(root.storageKind),
    scope: 'current-user',
    counts: normalizeCounts(root.counts),
    data: {
      days,
      foods: asArray(data.foods).map(normalizeFood).filter((food): food is Food => food !== null),
      meals: asArray(data.meals).map(normalizeMeal).filter((meal): meal is Meal => meal !== null),
      recent: normalizeRecent(data.recent),
      goal,
      settings,
    },
  }
  const existingFingerprint = normalizeFingerprint(root.fingerprint)
  return {
    ...normalized,
    fingerprint: existingFingerprint ?? exportFingerprint(normalized),
  }
}

function normalizeFingerprint(input: unknown): string | null {
  return typeof input === 'string' && /^[0-9a-f]{8}$/.test(input)
    ? input
    : null
}

function normalizeExportDay(input: unknown, day: DayKey): ZhvushaExportDay | null {
  const raw = asRecord(input)
  if (!raw) return null
  return {
    foodEntries: asArray(raw.foodEntries)
      .map((item) => normalizeFoodEntry(item, day))
      .filter((item): item is FoodEntry => item !== null),
    water: asArray(raw.water)
      .map((item) => normalizeWaterEntry(item, day))
      .filter((item): item is WaterEntry => item !== null),
    notes: asArray(raw.notes)
      .map(normalizeNote)
      .filter((item): item is Note => item !== null),
    dayMeta: normalizeDayMeta(raw.dayMeta, day),
  }
}

function normalizeSettings(input: unknown): ZhvushaExport['data']['settings'] | null {
  const raw = asRecord(input)
  if (!raw) return null
  const theme = asRecord(raw.theme) ?? {}
  const water = asRecord(raw.water) ?? {}
  return {
    calendarMode: raw.calendarMode === 'notes' ? 'notes' : 'kcal',
    noteColors: normalizeNoteColors(raw.noteColors),
    theme: {
      accent: normalizeThemeHexValue(theme.accent) ?? loadAccent(),
      calorieDeviationEnabled: theme.calorieDeviationEnabled === false ? false : true,
      calorieDeviationColor: normalizeThemeHexValue(theme.calorieDeviationColor) ?? loadCalorieDeviationColor(),
      calorieDeviationSavedColors: normalizeThemeColors(theme.calorieDeviationSavedColors),
      foodColorEnabled: theme.foodColorEnabled === false ? false : true,
      foodColor: normalizeThemeHexValue(theme.foodColor) ?? loadFoodColor(),
      foodSavedColors: normalizeThemeColors(theme.foodSavedColors),
    },
    water: {
      goalMl: normalizeAmount(water.goalMl) ?? loadWaterGoalMl(),
      colorMode: water.colorMode === 'system' ? 'system' : 'fixed',
      quickAmounts: normalizeWaterQuickAmounts(water.quickAmounts),
    },
    widgets: asArray(raw.widgets)
      .map(normalizeWidget)
      .filter((widget): widget is WidgetInstance => widget !== null),
  }
}

function normalizeCounts(input: unknown): ZhvushaExport['counts'] {
  const raw = asRecord(input) ?? {}
  return {
    days: normalizeCount(raw.days),
    foodEntries: normalizeCount(raw.foodEntries),
    waterEntries: normalizeCount(raw.waterEntries),
    notes: normalizeCount(raw.notes),
    lazyDays: normalizeCount(raw.lazyDays),
    foods: normalizeCount(raw.foods),
    meals: normalizeCount(raw.meals),
    recent: normalizeCount(raw.recent),
    widgets: normalizeCount(raw.widgets),
  }
}

function normalizeStorageKind(input: unknown): StorageKind {
  return input === 'postgres' || input === 'telegram' || input === 'local' ? input : 'local'
}

function normalizeServing(input: unknown): Serving | null {
  const raw = asRecord(input)
  if (!raw) return null
  const id = asString(raw.id)
  const label = asString(raw.label)
  const kcal = asFiniteNumber(raw.kcal)
  const carbs = asFiniteNumber(raw.carbs)
  const fat = asFiniteNumber(raw.fat)
  const protein = asFiniteNumber(raw.protein)
  if (!id || !label || kcal === null || carbs === null || fat === null || protein === null) return null
  return {
    id,
    label,
    ...(asFiniteNumber(raw.grams) !== null ? { grams: asFiniteNumber(raw.grams) as number } : {}),
    kcal,
    carbs,
    fat,
    protein,
    ...(asFiniteNumber(raw.fiber) !== null ? { fiber: asFiniteNumber(raw.fiber) as number } : {}),
    ...(asFiniteNumber(raw.alcohol) !== null ? { alcohol: asFiniteNumber(raw.alcohol) as number } : {}),
  }
}

function normalizeFood(input: unknown): Food | null {
  const raw = asRecord(input)
  if (!raw) return null
  const id = asString(raw.id)
  const name = asString(raw.name)
  const servings = asArray(raw.servings)
    .map(normalizeServing)
    .filter((serving): serving is Serving => serving !== null)
  const createdAt = asFiniteNumber(raw.createdAt)
  const updatedAt = asFiniteNumber(raw.updatedAt)
  if (!id || !name || servings.length === 0 || createdAt === null || updatedAt === null) return null
  const estimate = normalizeEstimate(raw.estimate)
  return {
    id,
    name,
    ...(asString(raw.brand) ? { brand: asString(raw.brand) as string } : {}),
    ...(asString(raw.barcode) ? { barcode: asString(raw.barcode) as string } : {}),
    servings,
    ...(estimate ? { estimate } : {}),
    favourite: Boolean(raw.favourite),
    archived: Boolean(raw.archived),
    createdAt,
    updatedAt,
  }
}

function normalizeMeal(input: unknown): Meal | null {
  const raw = asRecord(input)
  if (!raw) return null
  const id = asString(raw.id)
  const name = asString(raw.name)
  const createdAt = asFiniteNumber(raw.createdAt)
  const updatedAt = asFiniteNumber(raw.updatedAt)
  const items = asArray(raw.items).map((item) => {
    const entry = asRecord(item)
    const foodId = entry ? asString(entry.foodId) : null
    const servingId = entry ? asString(entry.servingId) : null
    const quantity = entry ? asFiniteNumber(entry.quantity) : null
    if (!foodId || !servingId || quantity === null) return null
    return { foodId, servingId, quantity }
  }).filter((item): item is Meal['items'][number] => item !== null)
  if (!id || !name || createdAt === null || updatedAt === null) return null
  return { id, name, items, favourite: Boolean(raw.favourite), createdAt, updatedAt }
}

function normalizeQuickAdd(input: unknown): QuickAddData | null {
  const raw = asRecord(input)
  if (!raw) return null
  const name = asString(raw.name)
  const kcal = asFiniteNumber(raw.kcal)
  if (!name || kcal === null) return null
  const estimate = normalizeEstimate(raw.estimate)
  return {
    name,
    kcal,
    ...(asFiniteNumber(raw.carbs) !== null ? { carbs: asFiniteNumber(raw.carbs) as number } : {}),
    ...(asFiniteNumber(raw.fat) !== null ? { fat: asFiniteNumber(raw.fat) as number } : {}),
    ...(asFiniteNumber(raw.protein) !== null ? { protein: asFiniteNumber(raw.protein) as number } : {}),
    ...(asFiniteNumber(raw.fiber) !== null ? { fiber: asFiniteNumber(raw.fiber) as number } : {}),
    ...(asFiniteNumber(raw.alcohol) !== null ? { alcohol: asFiniteNumber(raw.alcohol) as number } : {}),
    ...(estimate ? { estimate } : {}),
  }
}

const MEAL_TYPES: ReadonlySet<MealType> = new Set(['b', 'l', 'd', 's'])

function normalizeFoodEntry(input: unknown, day: DayKey): FoodEntry | null {
  const raw = asRecord(input)
  if (!raw) return null
  const id = asString(raw.id)
  const quantity = asFiniteNumber(raw.quantity)
  const createdAt = asFiniteNumber(raw.createdAt)
  if (!id || quantity === null || createdAt === null) return null
  const entry: FoodEntry = { id, date: day, quantity, createdAt }
  if (typeof raw.meal === 'string' && MEAL_TYPES.has(raw.meal as MealType)) {
    entry.meal = raw.meal as MealType
  }
  const foodId = asString(raw.foodId)
  const servingId = asString(raw.servingId)
  if (foodId && servingId) {
    entry.foodId = foodId
    entry.servingId = servingId
  }
  const quickAdd = normalizeQuickAdd(raw.quickAdd)
  if (quickAdd) entry.quickAdd = quickAdd
  if (!entry.foodId && !entry.quickAdd) return null
  return entry
}

function normalizeWaterEntry(input: unknown, day: DayKey): WaterEntry | null {
  const raw = asRecord(input)
  if (!raw) return null
  const id = asString(raw.id)
  const ml = normalizeAmount(raw.ml)
  const createdAt = asFiniteNumber(raw.createdAt)
  if (!id || ml === null || createdAt === null) return null
  return { id, date: day, ml, createdAt }
}

function normalizeNote(input: unknown): Note | null {
  const raw = asRecord(input)
  if (!raw) return null
  const id = asString(raw.id)
  const text = asString(raw.text)?.trim()
  const createdAt = asFiniteNumber(raw.createdAt)
  const updatedAt = asFiniteNumber(raw.updatedAt)
  if (!id || !text || createdAt === null || updatedAt === null) return null
  return { id, text, color: resolveColor(asString(raw.color)), createdAt, updatedAt }
}

function normalizeDayMeta(input: unknown, day: DayKey): DayMeta | null {
  const raw = asRecord(input)
  if (!raw) return null
  const updatedAt = asFiniteNumber(raw.updatedAt)
  if (updatedAt === null) return null
  const foodStatus = raw.foodStatus === 'no_food' || raw.foodStatus === 'not_logged'
    ? raw.foodStatus
    : undefined
  return { day, lazy: Boolean(raw.lazy), ...(foodStatus ? { foodStatus } : {}), updatedAt }
}

function normalizeGoal(input: unknown): Goal | null {
  const raw = asRecord(input)
  if (!raw) return null
  const kcal = asFiniteNumber(raw.kcal)
  const carbsPct = asFiniteNumber(raw.carbsPct)
  const fatPct = asFiniteNumber(raw.fatPct)
  const proteinPct = asFiniteNumber(raw.proteinPct)
  const updatedAt = asFiniteNumber(raw.updatedAt)
  if (kcal === null || carbsPct === null || fatPct === null || proteinPct === null || updatedAt === null) {
    return null
  }
  const profile = normalizeTdeeProfile(raw.profile)
  return { kcal, carbsPct, fatPct, proteinPct, updatedAt, ...(profile ? { profile } : {}) }
}

function normalizeTdeeProfile(input: unknown): TdeeProfile | null {
  const raw = asRecord(input)
  if (!raw || (raw.sex !== 'm' && raw.sex !== 'f')) return null
  const age = asFiniteNumber(raw.age)
  const weight = asFiniteNumber(raw.weight)
  const height = asFiniteNumber(raw.height)
  const activity = asFiniteNumber(raw.activity)
  const modifier = asFiniteNumber(raw.modifier)
  if (age === null || weight === null || height === null || activity === null || modifier === null) return null
  return { sex: raw.sex, age, weight, height, activity, modifier }
}

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

function normalizeEstimate(input: unknown): NutritionEstimate | undefined {
  const raw = asRecord(input)
  if (!raw || typeof raw.source !== 'string') return undefined
  if (!ESTIMATE_SOURCE_SET.has(raw.source as NutritionEstimateSource)) return undefined
  const confidence = asFiniteNumber(raw.confidence)
  const portionBasis = typeof raw.portionBasis === 'string' &&
    PORTION_BASIS_SET.has(raw.portionBasis as NutritionPortionBasis)
    ? raw.portionBasis as NutritionPortionBasis
    : undefined
  const originalPortionBasis = typeof raw.originalPortionBasis === 'string' &&
    PORTION_BASIS_SET.has(raw.originalPortionBasis as NutritionPortionBasis)
    ? raw.originalPortionBasis as NutritionPortionBasis
    : undefined
  return {
    source: raw.source as NutritionEstimateSource,
    ...(confidence !== null ? { confidence: Math.max(0, Math.min(1, confidence)) } : {}),
    ...(asString(raw.confidenceReason) ? { confidenceReason: asString(raw.confidenceReason) as string } : {}),
    ...(portionBasis ? { portionBasis } : {}),
    ...(asString(raw.basisLabel) ? { basisLabel: asString(raw.basisLabel) as string } : {}),
    ...(originalPortionBasis ? { originalPortionBasis } : {}),
    ...(asString(raw.originalBasisLabel) ? { originalBasisLabel: asString(raw.originalBasisLabel) as string } : {}),
    ...(asString(raw.dataSource) ? { dataSource: asString(raw.dataSource) as string } : {}),
  }
}

function normalizeRecent(input: unknown): RecentList {
  const raw = asRecord(input)
  if (!raw) return { entries: [] }
  const entries = asArray(raw.entries)
    .map(normalizeRecentItem)
    .filter((item): item is RecentList['entries'][number] => item !== null)
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, 30)
  const usualBundlePrefs = asArray(raw.usualBundlePrefs)
    .map(normalizeUsualBundlePreference)
    .filter((item): item is UsualBundlePreference => item !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20)
  return {
    entries,
    ...(usualBundlePrefs.length > 0 ? { usualBundlePrefs } : {}),
  }
}

function normalizeRecentItem(input: unknown): RecentList['entries'][number] | null {
  const raw = asRecord(input)
  if (!raw) return null
  const lastUsedAt = asFiniteNumber(raw.lastUsedAt)
  const usageCount = asFiniteNumber(raw.usageCount)
  if (lastUsedAt === null || usageCount === null) return null
  const foodId = asString(raw.foodId)
  const quickAdd = normalizeQuickAdd(raw.quickAdd)
  if (!foodId && !quickAdd) return null
  return {
    ...(foodId ? { foodId } : {}),
    ...(quickAdd ? { quickAdd } : {}),
    lastUsedAt,
    usageCount,
  }
}

function normalizeUsualBundlePreference(input: unknown): UsualBundlePreference | null {
  const raw = asRecord(input)
  if (!raw) return null
  const key = asString(raw.key)
  const updatedAt = asFiniteNumber(raw.updatedAt)
  if (!key || updatedAt === null) return null
  const items = asArray(raw.items)
    .map(normalizeUsualBundlePreferenceItem)
    .filter((item): item is UsualBundlePreferenceItem => item !== null)
  if (items.length === 0) return null
  return { key, updatedAt, items }
}

function normalizeUsualBundlePreferenceItem(input: unknown): UsualBundlePreferenceItem | null {
  const raw = asRecord(input)
  if (!raw) return null
  const key = asString(raw.key)
  const factor = asFiniteNumber(raw.factor)
  if (!key || factor === null) return null
  return { key, factor, included: Boolean(raw.included) }
}

function normalizeWidget(input: unknown): WidgetInstance | null {
  const raw = asRecord(input)
  if (!raw) return null
  const id = asString(raw.id)
  const type = asString(raw.type)
  if (!id || !type || !WIDGET_IDS.includes(type as WidgetId)) return null
  return { id, type: type as WidgetId }
}

function normalizeNoteColors(input: unknown): string[] {
  const colors = asArray(input).map((color) => resolveColor(asString(color))).filter(Boolean)
  return Array.from(new Set(colors))
}

function normalizeThemeColors(input: unknown): string[] {
  return asArray(input)
    .map(normalizeThemeHexValue)
    .filter((color): color is string => color !== null)
}

function normalizeThemeHexValue(input: unknown): string | null {
  return typeof input === 'string' ? normalizeThemeHex(input) : null
}

function normalizeWaterQuickAmounts(input: unknown): [number, number] {
  const raw = asArray(input)
  const first = normalizeAmount(raw[0])
  const second = normalizeAmount(raw[1])
  return first && second ? [first, second] : loadWaterQuickAmounts()
}

function normalizeAmount(input: unknown): number | null {
  const n = Math.round(Number(input))
  if (!Number.isFinite(n) || n <= 0 || n > 5000) return null
  return n
}

function normalizeCount(input: unknown): number {
  const n = Math.round(Number(input))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function mergeById<T extends { id: string }>(
  current: T[],
  imported: T[],
  timestamp: (item: T) => number,
): T[] {
  const byId = new Map(current.map((item) => [item.id, item]))
  for (const item of imported) {
    const existing = byId.get(item.id)
    if (!existing || timestamp(item) >= timestamp(existing)) byId.set(item.id, item)
  }
  return Array.from(byId.values()).sort((a, b) => timestamp(a) - timestamp(b))
}

function mergeEntitiesToSave<T extends { id: string; updatedAt: number }>(current: T[], imported: T[]): T[] {
  const byId = new Map(current.map((item) => [item.id, item]))
  const out: T[] = []
  for (const item of imported) {
    const existing = byId.get(item.id)
    if (!existing || item.updatedAt >= existing.updatedAt) out.push(item)
  }
  return out
}

function mergeRecent(current: RecentList, imported: RecentList): RecentList {
  const byKey = new Map<string, RecentList['entries'][number]>()
  for (const item of [...current.entries, ...imported.entries]) {
    const key = recentKey(item)
    if (!key) continue
    const existing = byKey.get(key)
    if (!existing || item.lastUsedAt >= existing.lastUsedAt) byKey.set(key, item)
  }
  const prefsByKey = new Map<string, UsualBundlePreference>()
  for (const pref of [...(current.usualBundlePrefs ?? []), ...(imported.usualBundlePrefs ?? [])]) {
    const existing = prefsByKey.get(pref.key)
    if (!existing || pref.updatedAt >= existing.updatedAt) prefsByKey.set(pref.key, pref)
  }
  const usualBundlePrefs = Array.from(prefsByKey.values())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 20)
  return {
    entries: Array.from(byKey.values())
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .slice(0, 30),
    ...(usualBundlePrefs.length > 0 ? { usualBundlePrefs } : {}),
  }
}

function recentKey(item: RecentList['entries'][number]): string | null {
  if (item.foodId) return `f:${item.foodId}`
  if (item.quickAdd?.name) return `q:${item.quickAdd.name.toLowerCase()}`
  return null
}

function entryTime(entry: { createdAt: number }): number {
  return entry.createdAt
}

function noteTime(note: Note): number {
  return note.updatedAt
}

function applyImportedSettings(data: ZhvushaExport): void {
  const { settings } = data.data
  useNotesStore.getState().setCalendarMode(settings.calendarMode)
  if (settings.noteColors.length > 0) {
    saveColors(settings.noteColors)
    useNotesStore.setState({ colors: settings.noteColors })
  }

  saveWaterGoalMl(settings.water.goalMl)
  saveWaterColorMode(settings.water.colorMode as WaterColorMode)
  saveWaterQuickAmounts(settings.water.quickAmounts)

  const themeStore = useThemeStore.getState()
  themeStore.setAccent(settings.theme.accent)
  themeStore.setCalorieDeviationEnabled(settings.theme.calorieDeviationEnabled)
  themeStore.setCalorieDeviationColor(settings.theme.calorieDeviationColor)
  saveCalorieDeviationSavedColors(settings.theme.calorieDeviationSavedColors)
  themeStore.setFoodColorEnabled(settings.theme.foodColorEnabled)
  themeStore.setFoodColor(settings.theme.foodColor)
  saveFoodSavedColors(settings.theme.foodSavedColors)
  saveAccent(settings.theme.accent)
  saveCalorieDeviationEnabled(settings.theme.calorieDeviationEnabled)
  saveCalorieDeviationColor(settings.theme.calorieDeviationColor)
  saveFoodColorEnabled(settings.theme.foodColorEnabled)
  saveFoodColor(settings.theme.foodColor)
  useThemeStore.setState({
    calorieDeviationSavedColors: settings.theme.calorieDeviationSavedColors,
    foodSavedColors: settings.theme.foodSavedColors,
  })

  useWidgetsStore.getState().replaceAll(settings.widgets)
}

function syncStoresAfterImport({
  data,
  importedEntriesByDay,
  importedWaterByDay,
  importedMetaByDay,
  importedNotesByDay,
  mergedRecent,
  foodsToSave,
  mealsToSave,
}: {
  data: ZhvushaExport
  importedEntriesByDay: Record<DayKey, FoodEntry[]>
  importedWaterByDay: Record<DayKey, WaterEntry[]>
  importedMetaByDay: Record<DayKey, DayMeta | null>
  importedNotesByDay: Record<DayKey, Note[]>
  mergedRecent: RecentList
  foodsToSave: Food[]
  mealsToSave: Meal[]
}): void {
  const importedFoodDays = Object.entries(importedEntriesByDay)
  const importedNoteDays = Object.entries(importedNotesByDay)
  useCaloriesStore.setState((state) => {
    const foods = { ...state.foods }
    for (const food of foodsToSave) foods[food.id] = food
    const meals = { ...state.meals }
    for (const meal of mealsToSave) meals[meal.id] = meal
    const daysWithEntries = new Set(state.daysWithEntries)
    for (const [day, entries] of importedFoodDays) {
      if (entries.length > 0) daysWithEntries.add(day)
    }
    return {
      entriesByDay: { ...state.entriesByDay, ...importedEntriesByDay },
      waterByDay: { ...state.waterByDay, ...importedWaterByDay },
      dayMetaByDay: { ...state.dayMetaByDay, ...importedMetaByDay },
      daysWithEntries,
      foods,
      meals,
      recent: mergedRecent,
      goal: data.data.goal,
    }
  })
  useNotesStore.setState((state) => {
    const daysWithNotes = new Set(state.daysWithNotes)
    for (const [day, notes] of importedNoteDays) {
      if (notes.length > 0) daysWithNotes.add(day)
    }
    return {
      notesByDay: { ...state.notesByDay, ...importedNotesByDay },
      daysWithNotes,
    }
  })
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
