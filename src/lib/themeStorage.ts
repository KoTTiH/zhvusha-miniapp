import { DEFAULT_ACCENT } from '../design/themePresets'
import { DEFAULT_FOOD_HUE } from '../design/tokens'
import { telegramUserId } from './tma'

export const DEFAULT_CALORIE_DEVIATION_COLOR = '#E5A46B'
export const DEFAULT_FOOD_COLOR = DEFAULT_FOOD_HUE

const MAX_SAVED_COLORS = 12
const HEX_RE = /^#[0-9a-fA-F]{6}$/

function accentKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:accent` : 'zhvusha:anon:accent'
}

function calorieDeviationEnabledKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:calorie_deviation_enabled` : 'zhvusha:anon:calorie_deviation_enabled'
}

function calorieDeviationColorKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:calorie_deviation_color` : 'zhvusha:anon:calorie_deviation_color'
}

function calorieDeviationSavedColorsKey(): string {
  const uid = telegramUserId()
  return uid
    ? `zhvusha:u${uid}:calorie_deviation_saved_colors`
    : 'zhvusha:anon:calorie_deviation_saved_colors'
}

function foodColorEnabledKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:food_color_enabled` : 'zhvusha:anon:food_color_enabled'
}

function foodColorKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:food_color` : 'zhvusha:anon:food_color'
}

function foodSavedColorsKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:food_saved_colors` : 'zhvusha:anon:food_saved_colors'
}

function normalizeHex(hex: string): string | null {
  const trimmed = hex.trim()
  if (!HEX_RE.test(trimmed)) return null
  return trimmed.toUpperCase()
}

function normalizeSavedColors(input: unknown, defaults: string[]): string[] {
  const out: string[] = []
  const push = (value: unknown) => {
    if (typeof value !== 'string') return
    const normalized = normalizeHex(value)
    if (!normalized || out.includes(normalized)) return
    out.push(normalized)
  }
  defaults.forEach(push)
  if (Array.isArray(input)) input.forEach(push)
  return out.slice(0, MAX_SAVED_COLORS)
}

function loadSavedColors(key: string, defaults: string[]): string[] {
  if (typeof window === 'undefined') return normalizeSavedColors([], defaults)
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return normalizeSavedColors([], defaults)
    return normalizeSavedColors(JSON.parse(raw), defaults)
  } catch {
    return normalizeSavedColors([], defaults)
  }
}

function saveSavedColors(key: string, colors: string[]): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeSavedColors(colors, [])
  try {
    window.localStorage.setItem(key, JSON.stringify(normalized))
  } catch {
    /* ignore */
  }
}

export function loadAccent(): string {
  if (typeof window === 'undefined') return DEFAULT_ACCENT
  try {
    const raw = window.localStorage.getItem(accentKey())
    const normalized = raw ? normalizeHex(raw) : null
    if (normalized) return normalized
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCENT
}

export function saveAccent(hex: string): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeHex(hex)
  if (!normalized) return
  try {
    window.localStorage.setItem(accentKey(), normalized)
  } catch {
    /* ignore */
  }
}

export function loadCalorieDeviationEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(calorieDeviationEnabledKey())
    return raw === null ? true : raw === '1'
  } catch {
    return true
  }
}

export function saveCalorieDeviationEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(calorieDeviationEnabledKey(), enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function loadCalorieDeviationColor(): string {
  if (typeof window === 'undefined') return DEFAULT_CALORIE_DEVIATION_COLOR
  try {
    const raw = window.localStorage.getItem(calorieDeviationColorKey())
    const normalized = raw ? normalizeHex(raw) : null
    if (normalized) return normalized
  } catch {
    /* ignore */
  }
  return DEFAULT_CALORIE_DEVIATION_COLOR
}

export function saveCalorieDeviationColor(hex: string): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeHex(hex)
  if (!normalized) return
  try {
    window.localStorage.setItem(calorieDeviationColorKey(), normalized)
  } catch {
    /* ignore */
  }
}

export function loadCalorieDeviationSavedColors(): string[] {
  return loadSavedColors(calorieDeviationSavedColorsKey(), [DEFAULT_CALORIE_DEVIATION_COLOR])
}

export function saveCalorieDeviationSavedColors(colors: string[]): void {
  saveSavedColors(calorieDeviationSavedColorsKey(), colors)
}

export function loadFoodColorEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(foodColorEnabledKey())
    return raw === null ? true : raw === '1'
  } catch {
    return true
  }
}

export function saveFoodColorEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(foodColorEnabledKey(), enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function loadFoodColor(): string {
  if (typeof window === 'undefined') return DEFAULT_FOOD_COLOR
  try {
    const raw = window.localStorage.getItem(foodColorKey())
    const normalized = raw ? normalizeHex(raw) : null
    if (normalized) return normalized
  } catch {
    /* ignore */
  }
  return DEFAULT_FOOD_COLOR
}

export function saveFoodColor(hex: string): void {
  if (typeof window === 'undefined') return
  const normalized = normalizeHex(hex)
  if (!normalized) return
  try {
    window.localStorage.setItem(foodColorKey(), normalized)
  } catch {
    /* ignore */
  }
}

export function loadFoodSavedColors(): string[] {
  return loadSavedColors(foodSavedColorsKey(), [DEFAULT_FOOD_COLOR])
}

export function saveFoodSavedColors(colors: string[]): void {
  saveSavedColors(foodSavedColorsKey(), colors)
}

export function addSavedColor(colors: string[], hex: string, fallback: string): string[] {
  const normalized = normalizeHex(hex)
  if (!normalized) return normalizeSavedColors(colors, [fallback])
  const base = normalizeSavedColors(colors, [fallback]).filter((color) => color !== normalized)
  return [normalized, ...base].slice(0, MAX_SAVED_COLORS)
}

export function isHexColor(hex: string): boolean {
  return normalizeHex(hex) !== null
}

export function normalizeThemeHex(hex: string): string | null {
  return normalizeHex(hex)
}
