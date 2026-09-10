import { telegramUserId } from './tma'

export type NoteColor = string

export type ColorDef = {
  hex: string
  label?: string
}

export const PRESET_COLORS: ColorDef[] = [
  { hex: '#3b82f6', label: 'Синий' },
  { hex: '#ef4444', label: 'Красный' },
  { hex: '#f97316', label: 'Оранжевый' },
  { hex: '#eab308', label: 'Жёлтый' },
  { hex: '#22c55e', label: 'Зелёный' },
  { hex: '#14b8a6', label: 'Бирюзовый' },
  { hex: '#a855f7', label: 'Фиолетовый' },
  { hex: '#ec4899', label: 'Розовый' },
  { hex: '#6b7280', label: 'Серый' },
]

export const DEFAULT_COLORS: NoteColor[] = PRESET_COLORS.map((c) => c.hex)
export const DEFAULT_NOTE_COLOR: NoteColor = DEFAULT_COLORS[0]

const LEGACY_NAME_TO_HEX: Record<string, string> = {
  blue: '#3b82f6',
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green: '#22c55e',
  teal: '#14b8a6',
  purple: '#a855f7',
  pink: '#ec4899',
  gray: '#6b7280',
}

const HEX_RE = /^#([0-9a-f]{6})$/i

export function isValidHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value)
}

export function resolveColor(id: string | undefined | null): NoteColor {
  if (!id) return DEFAULT_NOTE_COLOR
  const lower = id.toLowerCase()
  if (lower in LEGACY_NAME_TO_HEX) return LEGACY_NAME_TO_HEX[lower]
  if (isValidHex(id)) return id.toLowerCase()
  return DEFAULT_NOTE_COLOR
}

export function parseColorInput(raw: string): NoteColor | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null

  if (s in LEGACY_NAME_TO_HEX) return LEGACY_NAME_TO_HEX[s]

  const hex6 = s.match(/^#?([0-9a-f]{6})$/)
  if (hex6) return '#' + hex6[1]

  const hex3 = s.match(/^#?([0-9a-f]{3})$/)
  if (hex3) {
    const [r, g, b] = hex3[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`
  }

  const rgb = s.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/)
  if (rgb) {
    const bytes = [rgb[1], rgb[2], rgb[3]].map((n) =>
      Math.max(0, Math.min(255, parseInt(n, 10))),
    )
    return '#' + bytes.map((v) => v.toString(16).padStart(2, '0')).join('')
  }

  const hsl = s.match(/^hsla?\(\s*(-?\d{1,3})\s*,\s*(\d{1,3})%\s*,\s*(\d{1,3})%\s*(?:,\s*[\d.]+\s*)?\)$/)
  if (hsl) {
    return hslToHex(parseInt(hsl[1], 10), parseInt(hsl[2], 10), parseInt(hsl[3], 10))
  }

  return null
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = Math.max(0, Math.min(100, s)) / 100
  const lNorm = Math.max(0, Math.min(100, l)) / 100
  const hNorm = ((h % 360) + 360) % 360

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
  const x = c * (1 - Math.abs(((hNorm / 60) % 2) - 1))
  const m = lNorm - c / 2

  let r = 0, g = 0, b = 0
  if (hNorm < 60) [r, g, b] = [c, x, 0]
  else if (hNorm < 120) [r, g, b] = [x, c, 0]
  else if (hNorm < 180) [r, g, b] = [0, c, x]
  else if (hNorm < 240) [r, g, b] = [0, x, c]
  else if (hNorm < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]

  const rgb = [r, g, b].map((v) => Math.round((v + m) * 255))
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('')
}

const LEGACY_SHARED_COLORS_KEY = 'zhvusha:colors'
const LEGACY_CUSTOM_KEY = 'zhvusha:custom_colors'
const COLORS_LIMIT = 48

function colorsKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:colors` : 'zhvusha:anon:colors'
}

function purgeSharedLegacy(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LEGACY_SHARED_COLORS_KEY)
    window.localStorage.removeItem(LEGACY_CUSTOM_KEY)
  } catch {
    /* ignore */
  }
}

export function loadColors(): NoteColor[] {
  if (typeof window === 'undefined') return [...DEFAULT_COLORS]

  purgeSharedLegacy()

  try {
    const raw = window.localStorage.getItem(colorsKey())
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(isValidHex).map((h) => h.toLowerCase())
        if (valid.length > 0) return valid
      }
    }
  } catch {
    /* ignore */
  }

  return [...DEFAULT_COLORS]
}

export function saveColors(colors: NoteColor[]): void {
  if (typeof window === 'undefined') return
  try {
    const uniq = Array.from(new Set(colors.map((c) => c.toLowerCase()))).slice(0, COLORS_LIMIT)
    window.localStorage.setItem(colorsKey(), JSON.stringify(uniq))
  } catch {
    /* ignore */
  }
}
