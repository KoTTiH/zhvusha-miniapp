import { telegramUserId } from './tma'
import { DEFAULT_WATER_GOAL_ML, type WaterEntry } from '../types/calorie'

export const WATER_HUE = '#5EC2E8'
export const DEFAULT_WATER_QUICK_AMOUNTS: [number, number] = [250, 500]
export type WaterColorMode = 'fixed' | 'system'
const WATER_SETTINGS_EVENT = 'zhvusha:water-settings-changed'

function waterQuickAmountsKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:water_quick` : 'zhvusha:anon:water_quick'
}

function waterGoalKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:water_goal_ml` : 'zhvusha:anon:water_goal_ml'
}

function waterColorModeKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:water_color_mode` : 'zhvusha:anon:water_color_mode'
}

export function loadWaterGoalMl(): number {
  if (typeof window === 'undefined') return DEFAULT_WATER_GOAL_ML
  try {
    const raw = window.localStorage.getItem(waterGoalKey())
    const parsed = normalizeAmount(raw)
    return parsed ?? DEFAULT_WATER_GOAL_ML
  } catch {
    return DEFAULT_WATER_GOAL_ML
  }
}

export function saveWaterGoalMl(goalMl: number): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeAmount(goalMl) ?? DEFAULT_WATER_GOAL_ML
  try {
    window.localStorage.setItem(waterGoalKey(), String(normalized))
    notifyWaterSettingsChanged()
  } catch {
    /* ignore */
  }
}

export function loadWaterColorMode(): WaterColorMode {
  if (typeof window === 'undefined') return 'fixed'
  try {
    const raw = window.localStorage.getItem(waterColorModeKey())
    return raw === 'system' ? 'system' : 'fixed'
  } catch {
    return 'fixed'
  }
}

export function saveWaterColorMode(mode: WaterColorMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(waterColorModeKey(), mode)
    notifyWaterSettingsChanged()
  } catch {
    /* ignore */
  }
}

export function resolveWaterColor(mode: WaterColorMode): string {
  return mode === 'system' ? 'var(--zh-accent)' : WATER_HUE
}

export function loadWaterQuickAmounts(): [number, number] {
  if (typeof window === 'undefined') return DEFAULT_WATER_QUICK_AMOUNTS
  try {
    const raw = window.localStorage.getItem(waterQuickAmountsKey())
    if (!raw) return DEFAULT_WATER_QUICK_AMOUNTS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length < 2) return DEFAULT_WATER_QUICK_AMOUNTS
    const first = normalizeAmount(parsed[0])
    const second = normalizeAmount(parsed[1])
    if (!first || !second) return DEFAULT_WATER_QUICK_AMOUNTS
    return [first, second]
  } catch {
    return DEFAULT_WATER_QUICK_AMOUNTS
  }
}

export function saveWaterQuickAmounts(amounts: [number, number]): void {
  if (typeof window === 'undefined') return
  const first = normalizeAmount(amounts[0]) ?? DEFAULT_WATER_QUICK_AMOUNTS[0]
  const second = normalizeAmount(amounts[1]) ?? DEFAULT_WATER_QUICK_AMOUNTS[1]
  try {
    window.localStorage.setItem(waterQuickAmountsKey(), JSON.stringify([first, second]))
    notifyWaterSettingsChanged()
  } catch {
    /* ignore */
  }
}

export function subscribeWaterSettingsChanged(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(WATER_SETTINGS_EVENT, callback)
  return () => window.removeEventListener(WATER_SETTINGS_EVENT, callback)
}

export function sumWater(entries: WaterEntry[] | undefined): number {
  return (entries ?? []).reduce((sum, entry) => sum + entry.ml, 0)
}

function notifyWaterSettingsChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(WATER_SETTINGS_EVENT))
}

function normalizeAmount(value: unknown): number | null {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n <= 0 || n > 5000) return null
  return n
}
