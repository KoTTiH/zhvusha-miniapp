import { getISOWeek } from 'date-fns'
import { dayKey } from './dates'
import type { DayKey } from './../types/note'

export function weekProgress(today: Date = new Date()): {
  week: number
  dayOfWeek: number
} {
  const jsDay = today.getDay()
  const dayOfWeek = ((jsDay + 6) % 7) + 1
  return { week: getISOWeek(today), dayOfWeek }
}

export function lastNDays(n: number, today: Date = new Date()): DayKey[] {
  const out: DayKey[] = []
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push(dayKey(d))
  }
  return out
}
