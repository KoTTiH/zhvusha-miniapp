import { create } from 'zustand'
import {
  DEFAULT_COLORS,
  DEFAULT_NOTE_COLOR,
  loadColors,
  type NoteColor,
  saveColors,
} from '../lib/colors'
import { dayKey } from '../lib/dates'
import { newNoteId, pickStorage } from '../lib/storage'
import { telegramUserId } from '../lib/tma'
import type { CalendarMode, DayKey, Note } from '../types/note'

const LEGACY_VIEW_MODE_KEY = 'zhvusha:view_mode'

function calendarModeKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:cal_mode` : 'zhvusha:anon:cal_mode'
}

function loadCalendarMode(): CalendarMode {
  if (typeof window === 'undefined') return 'kcal'
  try {
    window.localStorage.removeItem(LEGACY_VIEW_MODE_KEY)
  } catch {
    /* ignore */
  }
  try {
    const raw = window.localStorage.getItem(calendarModeKey())
    return raw === 'notes' ? 'notes' : 'kcal'
  } catch {
    return 'kcal'
  }
}

function saveCalendarMode(mode: CalendarMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(calendarModeKey(), mode)
  } catch {
    /* ignore */
  }
}

type NotesState = {
  notesByDay: Record<DayKey, Note[]>
  daysWithNotes: Set<DayKey>
  loadingDays: Set<DayKey>
  hydrated: boolean
  selectedDay: DayKey | null
  openedDay: DayKey | null
  openedDayTarget: DayOpenTarget | null
  calendarMode: CalendarMode
  colors: NoteColor[]
  hydrate: () => Promise<void>
  loadDay: (day: DayKey) => Promise<void>
  loadRange: (days: DayKey[]) => Promise<void>
  selectDay: (day: DayKey | null) => void
  openDay: (day: DayKey, target?: DayOpenTarget | null) => void
  closeDay: () => void
  setCalendarMode: (mode: CalendarMode) => void
  addColor: (hex: NoteColor) => void
  removeColor: (hex: NoteColor) => void
  reorderColors: (from: number, to: number) => void
  resetColors: () => void
  addNote: (
    day: DayKey,
    text: string,
    color: NoteColor,
  ) => Promise<string | null>
  updateNote: (day: DayKey, id: string, text: string, color: NoteColor) => Promise<void>
  deleteNote: (day: DayKey, id: string) => Promise<void>
  reorderNotes: (day: DayKey, from: number, to: number) => Promise<void>
  setNotesOrder: (day: DayKey, orderedIds: string[]) => Promise<void>
}

export type DayOpenTarget = 'log'

function storage() {
  return pickStorage()
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

async function persist(day: DayKey, notes: Note[]): Promise<void> {
  await storage().saveDay(day, notes)
}

export const useNotesStore = create<NotesState>((set, get) => ({
  notesByDay: {},
  daysWithNotes: new Set<DayKey>(),
  loadingDays: new Set<DayKey>(),
  hydrated: false,
  selectedDay: dayKey(new Date()),
  openedDay: null,
  openedDayTarget: null,
  calendarMode: loadCalendarMode(),
  colors: loadColors(),

  async hydrate() {
    if (get().hydrated) return
    try {
      const days = await storage().listDaysWithNotes()
      set({ daysWithNotes: new Set(days), hydrated: true })
    } catch {
      set({ hydrated: true })
    }
  },

  async loadDay(day) {
    const { notesByDay, loadingDays } = get()
    if (notesByDay[day] || loadingDays.has(day)) return
    set({ loadingDays: withSet(loadingDays, 'add', day) })
    try {
      const notes = await storage().loadDay(day)
      set((s) => ({
        notesByDay: { ...s.notesByDay, [day]: notes },
        loadingDays: withSet(s.loadingDays, 'delete', day),
        daysWithNotes: notes.length > 0
          ? withSet(s.daysWithNotes, 'add', day)
          : s.daysWithNotes,
      }))
    } catch {
      set((s) => ({ loadingDays: withSet(s.loadingDays, 'delete', day) }))
    }
  },

  async loadRange(days) {
    const { notesByDay, loadingDays } = get()
    const missing = days.filter((d) => !(d in notesByDay) && !loadingDays.has(d))
    if (missing.length === 0) return
    set({ loadingDays: withSetMany(loadingDays, 'add', missing) })
    try {
      const loaded = await storage().loadMany(missing)
      set((s) => {
        const completeLoaded: Record<DayKey, Note[]> = {}
        for (const day of missing) completeLoaded[day] = loaded[day] ?? []
        const mergedNotes = { ...s.notesByDay, ...completeLoaded }
        const mergedDays = new Set(s.daysWithNotes)
        for (const [day, notes] of Object.entries(completeLoaded)) {
          if (notes.length > 0) mergedDays.add(day)
          else mergedDays.delete(day)
        }
        return {
          notesByDay: mergedNotes,
          daysWithNotes: mergedDays,
          loadingDays: withSetMany(s.loadingDays, 'delete', missing),
        }
      })
    } catch {
      set((s) => ({ loadingDays: withSetMany(s.loadingDays, 'delete', missing) }))
    }
  },

  selectDay(day) {
    set({ selectedDay: day })
    if (day) void get().loadDay(day)
  },

  openDay(day, target = null) {
    set({ openedDay: day, openedDayTarget: target, selectedDay: day })
    void get().loadDay(day)
  },

  closeDay() {
    set({ openedDay: null, openedDayTarget: null })
  },

  setCalendarMode(mode) {
    set({ calendarMode: mode })
    saveCalendarMode(mode)
  },

  addColor(hex) {
    const normalized = hex.toLowerCase()
    const current = get().colors
    if (current.includes(normalized)) return
    const next = [...current, normalized]
    set({ colors: next })
    saveColors(next)
  },

  removeColor(hex) {
    const normalized = hex.toLowerCase()
    const next = get().colors.filter((c) => c !== normalized)
    set({ colors: next })
    saveColors(next)
  },

  reorderColors(from, to) {
    const list = get().colors
    if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return
    const next = list.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    set({ colors: next })
    saveColors(next)
  },

  resetColors() {
    const next = [...DEFAULT_COLORS]
    set({ colors: next })
    saveColors(next)
  },

  async addNote(day, text, color) {
    const trimmed = text.trim()
    if (!trimmed) return null
    const now = Date.now()
    const note: Note = {
      id: newNoteId(),
      text: trimmed,
      color: color || DEFAULT_NOTE_COLOR,
      createdAt: now,
      updatedAt: now,
    }
    const current = get().notesByDay[day] ?? []
    const next = [...current, note]
    set((s) => ({
      notesByDay: { ...s.notesByDay, [day]: next },
      daysWithNotes: withSet(s.daysWithNotes, 'add', day),
    }))
    await persist(day, next)
    return note.id
  },

  async updateNote(day, id, text, color) {
    const trimmed = text.trim()
    const current = get().notesByDay[day] ?? []
    if (!trimmed) {
      await get().deleteNote(day, id)
      return
    }
    const next = current.map((n) =>
      n.id === id ? { ...n, text: trimmed, color, updatedAt: Date.now() } : n,
    )
    set((s) => ({ notesByDay: { ...s.notesByDay, [day]: next } }))
    await persist(day, next)
  },

  async deleteNote(day, id) {
    const current = get().notesByDay[day] ?? []
    const next = current.filter((n) => n.id !== id)
    set((s) => ({
      notesByDay: { ...s.notesByDay, [day]: next },
      daysWithNotes: next.length === 0
        ? withSet(s.daysWithNotes, 'delete', day)
        : s.daysWithNotes,
    }))
    await persist(day, next)
  },

  async reorderNotes(day, from, to) {
    const current = get().notesByDay[day] ?? []
    if (
      from < 0 ||
      from >= current.length ||
      to < 0 ||
      to >= current.length ||
      from === to
    ) {
      return
    }
    const next = current.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    set((s) => ({ notesByDay: { ...s.notesByDay, [day]: next } }))
    await persist(day, next)
  },

  async setNotesOrder(day, orderedIds) {
    const current = get().notesByDay[day] ?? []
    if (current.length !== orderedIds.length) return
    const byId = new Map(current.map((n) => [n.id, n]))
    const next: Note[] = []
    for (const id of orderedIds) {
      const n = byId.get(id)
      if (!n) return
      next.push(n)
    }
    set((s) => ({ notesByDay: { ...s.notesByDay, [day]: next } }))
    await persist(day, next)
  },
}))
