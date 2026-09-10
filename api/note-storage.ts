import { query } from './_lib/db.js'
import { createRoute } from './_lib/handler.js'

type StorageInput = Record<string, unknown>

type StorageOutput =
  | { ok: true }
  | { notes: unknown[]; found: boolean }
  | { notesByDay: Record<string, unknown[]>; foundDays: string[] }
  | { days: string[]; knownDays: string[] }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export default createRoute<StorageInput, StorageOutput>(async ({ input, userId }) => {
  const op = readString(input, 'op')
  if (userId === null) return emptyResponse(op, input)

  switch (op) {
    case 'loadDay':
      return loadDay(userId, readDay(input))
    case 'loadMany':
      return loadMany(userId, readDays(input))
    case 'saveDay':
      return saveDay(userId, readDay(input), readArray(input, 'notes'))
    case 'listDaysWithNotes':
      return listDaysWithNotes(userId)
    default:
      throw new Error(`unknown note storage op: ${op}`)
  }
})

async function loadDay(userId: number, day: string): Promise<StorageOutput> {
  const rows = await query<{ notes: unknown }>(
    'SELECT notes FROM note_days WHERE user_id = $1 AND day = $2',
    [userId, day],
  )
  return {
    notes: Array.isArray(rows[0]?.notes) ? rows[0].notes : [],
    found: rows.length > 0,
  }
}

async function loadMany(userId: number, days: string[]): Promise<StorageOutput> {
  if (days.length === 0) return { notesByDay: {}, foundDays: [] }
  const rows = await query<{ day: string; notes: unknown }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, notes
       FROM note_days
      WHERE user_id = $1
        AND day = ANY($2::date[])`,
    [userId, days],
  )
  const notesByDay: Record<string, unknown[]> = {}
  for (const day of days) notesByDay[day] = []
  const foundDays: string[] = []
  for (const row of rows) {
    notesByDay[row.day] = Array.isArray(row.notes) ? row.notes : []
    foundDays.push(row.day)
  }
  return { notesByDay, foundDays }
}

async function saveDay(userId: number, day: string, notes: unknown[]): Promise<StorageOutput> {
  await query(
    `INSERT INTO note_days (user_id, day, notes)
          VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, day) DO UPDATE
          SET notes = EXCLUDED.notes,
              updated_at = now()`,
    [userId, day, JSON.stringify(notes)],
  )
  return { ok: true }
}

async function listDaysWithNotes(userId: number): Promise<StorageOutput> {
  const rows = await query<{ day: string; active: boolean }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day,
            CASE
              WHEN jsonb_typeof(notes) = 'array' THEN jsonb_array_length(notes) > 0
              ELSE false
            END AS active
       FROM note_days
      WHERE user_id = $1
      ORDER BY day DESC`,
    [userId],
  )
  return {
    days: rows.filter((r) => r.active).map((r) => r.day),
    knownDays: rows.map((r) => r.day),
  }
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

function emptyResponse(op: string, input: StorageInput): StorageOutput {
  switch (op) {
    case 'loadDay':
      return { notes: [], found: false }
    case 'loadMany':
      return { notesByDay: emptyDays(input), foundDays: [] }
    case 'saveDay':
      return { ok: true }
    case 'listDaysWithNotes':
      return { days: [], knownDays: [] }
    default:
      throw new Error(`unknown note storage op: ${op}`)
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
