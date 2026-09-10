import { create } from 'zustand'
import { telegramUserId } from '../lib/tma'
import { WIDGET_IDS, type WidgetId, type WidgetInstance } from '../types/widget'

function widgetsKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:widgets` : 'zhvusha:anon:widgets'
}

function newInstanceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `w_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

function loadWidgets(): WidgetInstance[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(widgetsKey())
    if (raw === null) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const validTypes = new Set<string>(WIDGET_IDS)
    const out: WidgetInstance[] = []
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue
      const { id, type } = item as Record<string, unknown>
      if (typeof id !== 'string' || typeof type !== 'string') continue
      if (!validTypes.has(type)) continue
      out.push({ id, type: type as WidgetId })
    }
    return out
  } catch {
    return []
  }
}

function saveWidgets(list: WidgetInstance[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(widgetsKey(), JSON.stringify(list))
  } catch {
    /* quota/disabled — тихо игнорируем */
  }
}

type WidgetsState = {
  widgets: WidgetInstance[]
  editing: boolean
  hydrated: boolean
  hydrate: () => void
  add: (type: WidgetId) => void
  remove: (id: string) => void
  toggleType: (type: WidgetId) => void
  move: (id: string, direction: -1 | 1) => void
  reorder: (id: string, targetId: string, placement: 'before' | 'after') => void
  replaceAll: (widgets: WidgetInstance[]) => void
  setEditing: (editing: boolean) => void
  toggleEditing: () => void
}

export const useWidgetsStore = create<WidgetsState>((set, get) => ({
  widgets: [],
  editing: false,
  hydrated: false,

  hydrate() {
    if (get().hydrated) return
    set({ widgets: loadWidgets(), hydrated: true })
  },

  add(type) {
    if (get().widgets.some((widget) => widget.type === type)) return
    const next = [...get().widgets, { id: newInstanceId(), type }]
    set({ widgets: next })
    saveWidgets(next)
  },

  remove(id) {
    const next = get().widgets.filter((w) => w.id !== id)
    set({ widgets: next })
    saveWidgets(next)
  },

  toggleType(type) {
    const current = get().widgets
    const exists = current.some((widget) => widget.type === type)
    const next = exists
      ? current.filter((widget) => widget.type !== type)
      : [...current, { id: newInstanceId(), type }]
    set({ widgets: next })
    saveWidgets(next)
  },

  move(id, direction) {
    const next = [...get().widgets]
    const from = next.findIndex((w) => w.id === id)
    const to = from + direction
    if (from < 0 || to < 0 || to >= next.length) return
    const tmp = next[from]
    next[from] = next[to]
    next[to] = tmp
    set({ widgets: next })
    saveWidgets(next)
  },

  reorder(id, targetId, placement) {
    if (id === targetId) return
    const next = [...get().widgets]
    const from = next.findIndex((w) => w.id === id)
    if (from < 0) return
    const [item] = next.splice(from, 1)
    const targetIndex = next.findIndex((w) => w.id === targetId)
    if (targetIndex < 0) return
    const insertAt = placement === 'after' ? targetIndex + 1 : targetIndex
    next.splice(insertAt, 0, item)
    set({ widgets: next })
    saveWidgets(next)
  },

  replaceAll(widgets) {
    const validTypes = new Set<string>(WIDGET_IDS)
    const seenIds = new Set<string>()
    const next = widgets.filter((widget) => {
      if (!validTypes.has(widget.type) || seenIds.has(widget.id)) return false
      seenIds.add(widget.id)
      return true
    })
    set({ widgets: next, hydrated: true })
    saveWidgets(next)
  },

  setEditing(editing) {
    set({ editing })
  },

  toggleEditing() {
    set({ editing: !get().editing })
  },
}))
