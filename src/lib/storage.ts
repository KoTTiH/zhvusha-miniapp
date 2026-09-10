import { cloudStorage } from '@tma.js/sdk-react'
import { resolveColor } from './colors'
import { isInsideTelegram, telegramUserId } from './tma'
import type { DayKey, Note } from '../types/note'

const DAY_PREFIX = 'd_'
const API_BASE = (import.meta.env.VITE_AI_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

type RemoteDayResponse = { notes?: unknown; found?: boolean }
type RemoteManyResponse = {
  notesByDay?: Record<string, unknown>
  foundDays?: unknown
}
type RemoteListResponse = { days?: unknown; knownDays?: unknown }

function lsPrefix(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:d:` : 'zhvusha:anon:d:'
}

export interface NoteStorage {
  loadDay(day: DayKey): Promise<Note[]>
  loadMany(days: DayKey[]): Promise<Record<DayKey, Note[]>>
  saveDay(day: DayKey, notes: Note[]): Promise<void>
  listDaysWithNotes(): Promise<DayKey[]>
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
  const res = await fetch(`${API_BASE}/api/note-storage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getInitData() ? { 'x-init-data': getInitData() } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`note-storage ${res.status}: ${text.slice(0, 120)}`)
  }
  return await res.json() as T
}

function fallbackBackend(): NoteStorage {
  return canUseCloudStorage() ? cloudStorageBackend : localStorageBackend
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

function parseNotesValue(value: unknown): Note[] {
  return parseNotes(jsonOf(value))
}

async function remoteSaveDayQuiet(day: DayKey, notes: Note[]): Promise<void> {
  try {
    await remotePost({ op: 'saveDay', day, notes })
  } catch (e) {
    logRemoteFallback(`lazy saveDay(${day})`, e)
  }
}

export type StorageKind = 'postgres' | 'telegram' | 'local'

export function getStorageKind(): StorageKind {
  if (canUseRemoteStorage()) return 'postgres'
  return canUseCloudStorage() ? 'telegram' : 'local'
}

const remoteStorageBackend: NoteStorage = {
  async loadDay(day) {
    try {
      const remote = await remotePost<RemoteDayResponse>({ op: 'loadDay', day })
      const notes = parseNotesValue(remote.notes)
      if (remote.found) return notes
      const fallback = await fallbackBackend().loadDay(day)
      if (fallback.length > 0) await remoteSaveDayQuiet(day, fallback)
      return fallback
    } catch (e) {
      logRemoteFallback(`loadDay(${day})`, e)
      return fallbackBackend().loadDay(day)
    }
  },
  async loadMany(days) {
    if (days.length === 0) return {}
    try {
      const remote = await remotePost<RemoteManyResponse>({ op: 'loadMany', days })
      const found = new Set(asStringArray(remote.foundDays))
      const remoteMap = remote.notesByDay ?? {}
      const out: Record<DayKey, Note[]> = {}
      const missing: DayKey[] = []
      for (const day of days) {
        out[day] = parseNotesValue(remoteMap[day])
        if (!found.has(day)) missing.push(day)
      }
      if (missing.length > 0) {
        const fallback = await fallbackBackend().loadMany(missing)
        for (const day of missing) {
          const notes = fallback[day] ?? []
          out[day] = notes
          if (notes.length > 0) await remoteSaveDayQuiet(day, notes)
        }
      }
      return out
    } catch (e) {
      logRemoteFallback('loadMany', e)
      return fallbackBackend().loadMany(days)
    }
  },
  async saveDay(day, notes) {
    try {
      await remotePost({ op: 'saveDay', day, notes })
      if (notes.length === 0) await fallbackBackend().saveDay(day, [])
    } catch (e) {
      logRemoteFallback(`saveDay(${day})`, e)
      await fallbackBackend().saveDay(day, notes)
    }
  },
  async listDaysWithNotes() {
    try {
      const remote = await remotePost<RemoteListResponse>({ op: 'listDaysWithNotes' })
      const days = asStringArray(remote.days)
      const known = new Set(asStringArray(remote.knownDays))
      const fallback = (await fallbackBackend().listDaysWithNotes())
        .filter((day) => !known.has(day))
      return Array.from(new Set([...days, ...fallback]))
    } catch (e) {
      logRemoteFallback('listDaysWithNotes', e)
      return fallbackBackend().listDaysWithNotes()
    }
  },
}

const cloudStorageBackend: NoteStorage = {
  async loadDay(day) {
    const raw = await cloudStorage.getItem(DAY_PREFIX + day)
    return parseNotes(typeof raw === 'string' ? raw : '')
  },
  async loadMany(days) {
    if (days.length === 0) return {}
    const values = await Promise.all(
      days.map((d) => cloudStorage.getItem(DAY_PREFIX + d)),
    )
    const out: Record<DayKey, Note[]> = {}
    days.forEach((day, i) => {
      const raw = values[i]
      out[day] = parseNotes(typeof raw === 'string' ? raw : '')
    })
    return out
  },
  async saveDay(day, notes) {
    const key = DAY_PREFIX + day
    if (notes.length === 0) {
      await cloudStorage.deleteItem(key)
      return
    }
    await cloudStorage.setItem(key, JSON.stringify(notes))
  },
  async listDaysWithNotes() {
    const keys = await cloudStorage.getKeys()
    return keys
      .filter((k) => k.startsWith(DAY_PREFIX))
      .map((k) => k.slice(DAY_PREFIX.length))
  },
}

const localStorageBackend: NoteStorage = {
  async loadDay(day) {
    return parseNotes(window.localStorage.getItem(lsPrefix() + day) ?? '')
  },
  async loadMany(days) {
    const out: Record<DayKey, Note[]> = {}
    for (const day of days) {
      out[day] = parseNotes(window.localStorage.getItem(lsPrefix() + day) ?? '')
    }
    return out
  },
  async saveDay(day, notes) {
    const key = lsPrefix() + day
    if (notes.length === 0) {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify(notes))
  },
  async listDaysWithNotes() {
    const out: DayKey[] = []
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i)
      if (k && k.startsWith(lsPrefix())) out.push(k.slice(lsPrefix().length))
    }
    return out
  },
}

function parseNotes(raw: string): Note[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeNote).filter((n): n is Note => n !== null)
  } catch {
    return []
  }
}

function normalizeNote(x: unknown): Note | null {
  if (!x || typeof x !== 'object') return null
  const n = x as Record<string, unknown>
  if (typeof n.id !== 'string' || typeof n.text !== 'string') return null
  if (typeof n.createdAt !== 'number' || typeof n.updatedAt !== 'number') return null
  // Поля stat и noXp в старых заметках молча игнорируются —
  // статов и XP в новой модели нет.
  return {
    id: n.id,
    text: n.text,
    color: resolveColor(typeof n.color === 'string' ? n.color : undefined),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }
}

export function pickStorage(): NoteStorage {
  if (canUseRemoteStorage()) return remoteStorageBackend
  return canUseCloudStorage() ? cloudStorageBackend : localStorageBackend
}

export function purgeLegacySharedKeys(): number {
  if (typeof window === 'undefined') return 0
  const LEGACY = 'zhvusha:d:'
  const toRemove: string[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i)
    if (k && k.startsWith(LEGACY)) toRemove.push(k)
  }
  for (const k of toRemove) window.localStorage.removeItem(k)
  return toRemove.length
}

export function newNoteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
