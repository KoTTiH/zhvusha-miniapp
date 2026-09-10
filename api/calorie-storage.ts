import { query } from './_lib/db.js'
import { createRoute } from './_lib/handler.js'

type StorageInput = Record<string, unknown>

type StorageOutput =
  | { ok: true }
  | { entries: unknown[]; found: boolean }
  | { entriesByDay: Record<string, unknown[]>; foundDays: string[] }
  | { days: string[]; knownDays: string[] }
  | { food: unknown | null; found: boolean }
  | { foods: unknown[]; deletedIds: string[] }
  | { meal: unknown | null; found: boolean }
  | { meals: unknown[]; deletedIds: string[] }
  | { recent: unknown | null; found: boolean }
  | { goal: unknown | null; found: boolean }
  | { water: unknown[]; found: boolean }
  | { waterByDay: Record<string, unknown[]>; foundDays: string[] }
  | { meta: unknown | null; found: boolean }
  | { metaByDay: Record<string, unknown | null>; foundDays: string[] }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export default createRoute<StorageInput, StorageOutput>(async ({ input, userId }) => {
  const op = readString(input, 'op')
  if (userId === null) return emptyResponse(op, input)

  switch (op) {
    case 'loadDay':
      return loadDay(userId, readDay(input))
    case 'loadDays':
      return loadDays(userId, readDays(input))
    case 'saveDay':
      return saveDay(userId, readDay(input), readArray(input, 'entries'))
    case 'listDaysWithEntries':
      return listDaysWithEntries(userId)
    case 'loadFood':
      return loadFood(userId, readString(input, 'id'))
    case 'saveFood':
      return saveFood(userId, readEntity(input, 'food'))
    case 'deleteFood':
      return deleteEntity(userId, 'user_foods', readString(input, 'id'))
    case 'listFoods':
      return listEntities(userId, 'user_foods', 'foods')
    case 'loadMeal':
      return loadMeal(userId, readString(input, 'id'))
    case 'saveMeal':
      return saveMeal(userId, readEntity(input, 'meal'))
    case 'deleteMeal':
      return deleteEntity(userId, 'user_meals', readString(input, 'id'))
    case 'listMeals':
      return listEntities(userId, 'user_meals', 'meals')
    case 'loadRecent':
      return loadRecent(userId)
    case 'saveRecent':
      return saveRecent(userId, readRecord(input, 'recent'))
    case 'loadGoal':
      return loadGoal(userId)
    case 'saveGoal':
      return saveGoal(userId, readRecord(input, 'goal'))
    case 'loadWaterDay':
      return loadWaterDay(userId, readDay(input))
    case 'loadWaterDays':
      return loadWaterDays(userId, readDays(input))
    case 'saveWaterDay':
      return saveWaterDay(userId, readDay(input), readArray(input, 'water'))
    case 'listDaysWithWater':
      return listDaysWithWater(userId)
    case 'loadDayMeta':
      return loadDayMeta(userId, readDay(input))
    case 'loadDayMetaRange':
      return loadDayMetaRange(userId, readDays(input))
    case 'saveDayMeta':
      return saveDayMeta(userId, readDay(input), readRecord(input, 'meta'))
    case 'listDaysWithDayMeta':
      return listDaysWithDayMeta(userId)
    default:
      throw new Error(`unknown calorie storage op: ${op}`)
  }
})

async function loadDay(userId: number, day: string): Promise<StorageOutput> {
  const rows = await query<{ entries: unknown }>(
    'SELECT entries FROM calorie_days WHERE user_id = $1 AND day = $2',
    [userId, day],
  )
  return {
    entries: Array.isArray(rows[0]?.entries) ? rows[0].entries : [],
    found: rows.length > 0,
  }
}

async function loadDays(userId: number, days: string[]): Promise<StorageOutput> {
  if (days.length === 0) return { entriesByDay: {}, foundDays: [] }
  const rows = await query<{ day: string; entries: unknown }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, entries
       FROM calorie_days
      WHERE user_id = $1
        AND day = ANY($2::date[])`,
    [userId, days],
  )
  const entriesByDay: Record<string, unknown[]> = {}
  for (const day of days) entriesByDay[day] = []
  const foundDays: string[] = []
  for (const row of rows) {
    entriesByDay[row.day] = Array.isArray(row.entries) ? row.entries : []
    foundDays.push(row.day)
  }
  return { entriesByDay, foundDays }
}

async function saveDay(userId: number, day: string, entries: unknown[]): Promise<StorageOutput> {
  await query(
    `INSERT INTO calorie_days (user_id, day, entries)
          VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, day) DO UPDATE
          SET entries = EXCLUDED.entries,
              updated_at = now()`,
    [userId, day, JSON.stringify(entries)],
  )
  return { ok: true }
}

async function listDaysWithEntries(userId: number): Promise<StorageOutput> {
  const rows = await query<{ day: string; active: boolean }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day,
            CASE
              WHEN jsonb_typeof(entries) = 'array' THEN jsonb_array_length(entries) > 0
              ELSE false
            END AS active
       FROM calorie_days
      WHERE user_id = $1
      ORDER BY day DESC`,
    [userId],
  )
  return {
    days: rows.filter((r) => r.active).map((r) => r.day),
    knownDays: rows.map((r) => r.day),
  }
}

async function loadFood(userId: number, id: string): Promise<StorageOutput> {
  const rows = await query<{ data: unknown; deleted_at: Date | null }>(
    'SELECT data, deleted_at FROM user_foods WHERE user_id = $1 AND id = $2',
    [userId, id],
  )
  if (rows.length === 0) return { food: null, found: false }
  return { food: rows[0].deleted_at ? null : rows[0].data, found: true }
}

async function saveFood(userId: number, food: { id: string; data: Record<string, unknown> }) {
  return saveEntity(userId, 'user_foods', food.id, food.data)
}

async function loadMeal(userId: number, id: string): Promise<StorageOutput> {
  const rows = await query<{ data: unknown; deleted_at: Date | null }>(
    'SELECT data, deleted_at FROM user_meals WHERE user_id = $1 AND id = $2',
    [userId, id],
  )
  if (rows.length === 0) return { meal: null, found: false }
  return { meal: rows[0].deleted_at ? null : rows[0].data, found: true }
}

async function saveMeal(userId: number, meal: { id: string; data: Record<string, unknown> }) {
  return saveEntity(userId, 'user_meals', meal.id, meal.data)
}

async function saveEntity(
  userId: number,
  table: 'user_foods' | 'user_meals',
  id: string,
  data: Record<string, unknown>,
): Promise<StorageOutput> {
  await query(
    `INSERT INTO ${table} (user_id, id, data, deleted_at)
          VALUES ($1, $2, $3::jsonb, NULL)
     ON CONFLICT (user_id, id) DO UPDATE
          SET data = EXCLUDED.data,
              deleted_at = NULL,
              updated_at = now()`,
    [userId, id, JSON.stringify(data)],
  )
  return { ok: true }
}

async function deleteEntity(
  userId: number,
  table: 'user_foods' | 'user_meals',
  id: string,
): Promise<StorageOutput> {
  await query(
    `INSERT INTO ${table} (user_id, id, data, deleted_at)
          VALUES ($1, $2, '{}'::jsonb, now())
     ON CONFLICT (user_id, id) DO UPDATE
          SET data = '{}'::jsonb,
              deleted_at = now(),
              updated_at = now()`,
    [userId, id],
  )
  return { ok: true }
}

async function listEntities(
  userId: number,
  table: 'user_foods' | 'user_meals',
  key: 'foods' | 'meals',
): Promise<StorageOutput> {
  const rows = await query<{ id: string; data: unknown; deleted_at: Date | null }>(
    `SELECT id, data, deleted_at
       FROM ${table}
      WHERE user_id = $1
      ORDER BY updated_at DESC`,
    [userId],
  )
  const active = rows.filter((r) => !r.deleted_at).map((r) => r.data)
  const deletedIds = rows.filter((r) => r.deleted_at).map((r) => r.id)
  return key === 'foods'
    ? { foods: active, deletedIds }
    : { meals: active, deletedIds }
}

async function loadRecent(userId: number): Promise<StorageOutput> {
  const rows = await query<{ data: unknown }>(
    'SELECT data FROM user_recent WHERE user_id = $1',
    [userId],
  )
  return { recent: rows[0]?.data ?? null, found: rows.length > 0 }
}

async function saveRecent(userId: number, recent: Record<string, unknown>): Promise<StorageOutput> {
  await query(
    `INSERT INTO user_recent (user_id, data)
          VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE
          SET data = EXCLUDED.data,
              updated_at = now()`,
    [userId, JSON.stringify(recent)],
  )
  return { ok: true }
}

async function loadGoal(userId: number): Promise<StorageOutput> {
  const rows = await query<{ data: unknown }>(
    'SELECT data FROM user_goal WHERE user_id = $1',
    [userId],
  )
  return { goal: rows[0]?.data ?? null, found: rows.length > 0 }
}

async function saveGoal(userId: number, goal: Record<string, unknown>): Promise<StorageOutput> {
  await query(
    `INSERT INTO user_goal (user_id, data)
          VALUES ($1, $2::jsonb)
     ON CONFLICT (user_id) DO UPDATE
          SET data = EXCLUDED.data,
              updated_at = now()`,
    [userId, JSON.stringify(goal)],
  )
  return { ok: true }
}

async function loadWaterDay(userId: number, day: string): Promise<StorageOutput> {
  const rows = await query<{ entries: unknown }>(
    'SELECT entries FROM water_days WHERE user_id = $1 AND day = $2',
    [userId, day],
  )
  return {
    water: Array.isArray(rows[0]?.entries) ? rows[0].entries : [],
    found: rows.length > 0,
  }
}

async function loadWaterDays(userId: number, days: string[]): Promise<StorageOutput> {
  if (days.length === 0) return { waterByDay: {}, foundDays: [] }
  const rows = await query<{ day: string; entries: unknown }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, entries
       FROM water_days
      WHERE user_id = $1
        AND day = ANY($2::date[])`,
    [userId, days],
  )
  const waterByDay: Record<string, unknown[]> = {}
  for (const day of days) waterByDay[day] = []
  const foundDays: string[] = []
  for (const row of rows) {
    waterByDay[row.day] = Array.isArray(row.entries) ? row.entries : []
    foundDays.push(row.day)
  }
  return { waterByDay, foundDays }
}

async function saveWaterDay(
  userId: number,
  day: string,
  water: unknown[],
): Promise<StorageOutput> {
  await query(
    `INSERT INTO water_days (user_id, day, entries)
          VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, day) DO UPDATE
          SET entries = EXCLUDED.entries,
              updated_at = now()`,
    [userId, day, JSON.stringify(water)],
  )
  return { ok: true }
}

async function listDaysWithWater(userId: number): Promise<StorageOutput> {
  const rows = await query<{ day: string; active: boolean }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day,
            CASE
              WHEN jsonb_typeof(entries) = 'array' THEN jsonb_array_length(entries) > 0
              ELSE false
            END AS active
       FROM water_days
      WHERE user_id = $1
      ORDER BY day DESC`,
    [userId],
  )
  return {
    days: rows.filter((r) => r.active).map((r) => r.day),
    knownDays: rows.map((r) => r.day),
  }
}

async function loadDayMeta(userId: number, day: string): Promise<StorageOutput> {
  const rows = await query<{ data: unknown }>(
    'SELECT data FROM day_meta WHERE user_id = $1 AND day = $2',
    [userId, day],
  )
  return { meta: rows[0]?.data ?? null, found: rows.length > 0 }
}

async function loadDayMetaRange(userId: number, days: string[]): Promise<StorageOutput> {
  if (days.length === 0) return { metaByDay: {}, foundDays: [] }
  const rows = await query<{ day: string; data: unknown }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, data
       FROM day_meta
      WHERE user_id = $1
        AND day = ANY($2::date[])`,
    [userId, days],
  )
  const metaByDay: Record<string, unknown | null> = {}
  for (const day of days) metaByDay[day] = null
  const foundDays: string[] = []
  for (const row of rows) {
    metaByDay[row.day] = row.data ?? null
    foundDays.push(row.day)
  }
  return { metaByDay, foundDays }
}

async function saveDayMeta(
  userId: number,
  day: string,
  meta: Record<string, unknown>,
): Promise<StorageOutput> {
  await query(
    `INSERT INTO day_meta (user_id, day, data)
          VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, day) DO UPDATE
          SET data = EXCLUDED.data,
              updated_at = now()`,
    [userId, day, JSON.stringify(meta)],
  )
  return { ok: true }
}

async function listDaysWithDayMeta(userId: number): Promise<StorageOutput> {
  const rows = await query<{ day: string }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day
       FROM day_meta
      WHERE user_id = $1
      ORDER BY day DESC`,
    [userId],
  )
  const days = rows.map((r) => r.day)
  return { days, knownDays: days }
}

function readString(input: StorageInput, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`invalid ${key}`)
  }
  return value
}

function readDay(input: StorageInput): string {
  const day = readString(input, 'day')
  if (!DAY_RE.test(day)) throw new Error('invalid day')
  return day
}

function readDays(input: StorageInput): string[] {
  const value = input.days
  if (!Array.isArray(value)) throw new Error('invalid days')
  const days = value.map((d) => {
    if (typeof d !== 'string' || !DAY_RE.test(d)) throw new Error('invalid days')
    return d
  })
  return Array.from(new Set(days))
}

function readArray(input: StorageInput, key: string): unknown[] {
  const value = input[key]
  if (!Array.isArray(value)) throw new Error(`invalid ${key}`)
  return value
}

function readRecord(input: StorageInput, key: string): Record<string, unknown> {
  const value = input[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid ${key}`)
  }
  return value as Record<string, unknown>
}

function readEntity(
  input: StorageInput,
  key: 'food' | 'meal',
): { id: string; data: Record<string, unknown> } {
  const data = readRecord(input, key)
  const id = data.id
  if (typeof id !== 'string' || id.length === 0) throw new Error(`invalid ${key}.id`)
  return { id, data }
}

function emptyResponse(op: string, input: StorageInput): StorageOutput {
  switch (op) {
    case 'loadDay':
      return { entries: [], found: false }
    case 'loadDays':
      return { entriesByDay: emptyDays(input), foundDays: [] }
    case 'saveDay':
    case 'saveFood':
    case 'deleteFood':
    case 'saveMeal':
    case 'deleteMeal':
    case 'saveRecent':
    case 'saveGoal':
    case 'saveWaterDay':
    case 'saveDayMeta':
      return { ok: true }
    case 'listDaysWithEntries':
    case 'listDaysWithWater':
    case 'listDaysWithDayMeta':
      return { days: [], knownDays: [] }
    case 'loadFood':
      return { food: null, found: false }
    case 'listFoods':
      return { foods: [], deletedIds: [] }
    case 'loadMeal':
      return { meal: null, found: false }
    case 'listMeals':
      return { meals: [], deletedIds: [] }
    case 'loadRecent':
      return { recent: null, found: false }
    case 'loadGoal':
      return { goal: null, found: false }
    case 'loadWaterDay':
      return { water: [], found: false }
    case 'loadWaterDays':
      return { waterByDay: emptyDays(input), foundDays: [] }
    case 'loadDayMeta':
      return { meta: null, found: false }
    case 'loadDayMetaRange':
      return { metaByDay: emptyMetaDays(input), foundDays: [] }
    default:
      throw new Error(`unknown calorie storage op: ${op}`)
  }
}

function emptyDays(input: StorageInput): Record<string, unknown[]> {
  const value = input.days
  if (!Array.isArray(value)) return {}
  const out: Record<string, unknown[]> = {}
  for (const day of value) {
    if (typeof day === 'string' && DAY_RE.test(day)) out[day] = []
  }
  return out
}

function emptyMetaDays(input: StorageInput): Record<string, null> {
  const value = input.days
  if (!Array.isArray(value)) return {}
  const out: Record<string, null> = {}
  for (const day of value) {
    if (typeof day === 'string' && DAY_RE.test(day)) out[day] = null
  }
  return out
}
