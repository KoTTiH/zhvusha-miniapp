import { create } from 'zustand'
import { DEFAULT_ACCENT } from '../design/themePresets'
import {
  DEFAULT_CALORIE_DEVIATION_COLOR,
  DEFAULT_FOOD_COLOR,
  addSavedColor,
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
} from '../lib/themeStorage'

type ThemeState = {
  accent: string
  calorieDeviationEnabled: boolean
  calorieDeviationColor: string
  calorieDeviationSavedColors: string[]
  foodColorEnabled: boolean
  foodColor: string
  foodSavedColors: string[]
  hydrated: boolean
  hydrate: () => void
  setAccent: (hex: string) => void
  setCalorieDeviationEnabled: (enabled: boolean) => void
  setCalorieDeviationColor: (hex: string) => void
  saveCalorieDeviationColorChoice: (hex: string) => void
  setFoodColorEnabled: (enabled: boolean) => void
  setFoodColor: (hex: string) => void
  saveFoodColorChoice: (hex: string) => void
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return { r: 167, g: 139, b: 250 }
  const v = m[1]
  return {
    r: parseInt(v.slice(0, 2), 16),
    g: parseInt(v.slice(2, 4), 16),
    b: parseInt(v.slice(4, 6), 16),
  }
}

function relativeLuminance(c: { r: number; g: number; b: number }): number {
  const arr = [c.r, c.g, c.b].map((x) => {
    const n = x / 255
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * arr[0] + 0.7152 * arr[1] + 0.0722 * arr[2]
}

export function applyAccent(hex: string): void {
  if (typeof document === 'undefined') return
  const normalized = hex.toUpperCase()
  const rgb = hexToRgb(normalized)
  const root = document.documentElement.style
  root.setProperty('--zh-accent', normalized)
  root.setProperty('--zh-accent-r', String(rgb.r))
  root.setProperty('--zh-accent-g', String(rgb.g))
  root.setProperty('--zh-accent-b', String(rgb.b))

  // Keep Telegram-theme tokens (used by legacy tg-* Tailwind classes)
  // in sync with the active accent.
  root.setProperty('--color-tg-button', normalized)
  root.setProperty('--color-tg-link', normalized)
  root.setProperty('--color-tg-accent', normalized)

  // Pick a readable text colour for button foregrounds.
  const buttonText = relativeLuminance(rgb) > 0.55 ? '#06131F' : '#FFFFFF'
  root.setProperty('--color-tg-button-text', buttonText)
}

export function applyFoodColor(hex: string, enabled: boolean): void {
  if (typeof document === 'undefined') return
  const normalized = normalizeThemeHex(hex) ?? DEFAULT_FOOD_COLOR
  document.documentElement.style.setProperty('--zh-food-hue', enabled ? normalized : 'var(--zh-accent)')
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  accent: DEFAULT_ACCENT,
  calorieDeviationEnabled: true,
  calorieDeviationColor: DEFAULT_CALORIE_DEVIATION_COLOR,
  calorieDeviationSavedColors: [DEFAULT_CALORIE_DEVIATION_COLOR],
  foodColorEnabled: true,
  foodColor: DEFAULT_FOOD_COLOR,
  foodSavedColors: [DEFAULT_FOOD_COLOR],
  hydrated: false,

  hydrate() {
    if (get().hydrated) return
    const accent = loadAccent()
    const foodColorEnabled = loadFoodColorEnabled()
    const foodColor = loadFoodColor()
    set({
      accent,
      calorieDeviationEnabled: loadCalorieDeviationEnabled(),
      calorieDeviationColor: loadCalorieDeviationColor(),
      calorieDeviationSavedColors: loadCalorieDeviationSavedColors(),
      foodColorEnabled,
      foodColor,
      foodSavedColors: loadFoodSavedColors(),
      hydrated: true,
    })
    applyAccent(accent)
    applyFoodColor(foodColor, foodColorEnabled)
  },

  setAccent(hex) {
    const normalized = hex.toUpperCase()
    set({ accent: normalized })
    applyAccent(normalized)
    saveAccent(normalized)
  },

  setCalorieDeviationEnabled(enabled) {
    set({ calorieDeviationEnabled: enabled })
    saveCalorieDeviationEnabled(enabled)
  },

  setCalorieDeviationColor(hex) {
    const normalized = normalizeThemeHex(hex)
    if (!normalized) return
    set({ calorieDeviationColor: normalized })
    saveCalorieDeviationColor(normalized)
  },

  saveCalorieDeviationColorChoice(hex) {
    const next = addSavedColor(get().calorieDeviationSavedColors, hex, DEFAULT_CALORIE_DEVIATION_COLOR)
    set({ calorieDeviationSavedColors: next })
    saveCalorieDeviationSavedColors(next)
  },

  setFoodColorEnabled(enabled) {
    set({ foodColorEnabled: enabled })
    saveFoodColorEnabled(enabled)
    applyFoodColor(get().foodColor, enabled)
  },

  setFoodColor(hex) {
    const normalized = normalizeThemeHex(hex)
    if (!normalized) return
    set({ foodColor: normalized })
    saveFoodColor(normalized)
    applyFoodColor(normalized, get().foodColorEnabled)
  },

  saveFoodColorChoice(hex) {
    const next = addSavedColor(get().foodSavedColors, hex, DEFAULT_FOOD_COLOR)
    set({ foodSavedColors: next })
    saveFoodSavedColors(next)
  },
}))
