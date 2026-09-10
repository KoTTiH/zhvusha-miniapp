/**
 * Тёплый оттенок по умолчанию для еды/калорий.
 * Раньше это был `STATS.VIT.hue`; статов больше нет, цвет сохранён как
 * отдельная семантика только для раздела еды.
 */
export const DEFAULT_FOOD_HUE = '#D98A7A'

/**
 * Runtime-mutable цвет еды. Конкретное значение пишет theme store в CSS variable,
 * поэтому старые места с FOOD_HUE обновляются без локальной логики в каждом экране.
 */
export const FOOD_HUE = 'var(--zh-food-hue)'

/**
 * Alpha-adjusted accent. Resolves through runtime CSS variables
 * (`--zh-accent-r/g/b`) so it updates live when the user changes theme.
 */
export function accentAlpha(alpha: number): string {
  return `rgba(var(--zh-accent-r), var(--zh-accent-g), var(--zh-accent-b), ${alpha})`
}

/**
 * Alpha-mix any CSS color (hex, named, or `var(...)`) via color-mix.
 */
export function mixAlpha(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`
}

export const ZH = {
  bg: '#08090F',
  bgGradient:
    `radial-gradient(140% 90% at 50% -10%, ${accentAlpha(0.12)} 0%, rgba(8,9,15,0) 55%), ` +
    'radial-gradient(120% 80% at 50% 110%, rgba(94,228,184,0.04) 0%, rgba(8,9,15,0) 50%), ' +
    '#08090F',
  panel: 'rgba(18, 23, 36, 0.55)',
  panelHi: 'rgba(26, 33, 50, 0.72)',
  line: 'rgba(148, 178, 224, 0.14)',
  lineHi: 'rgba(148, 178, 224, 0.28)',
  text: '#E6ECF5',
  textDim: '#8A94A8',
  textFaint: '#4E586E',
  accent: 'var(--zh-accent)',
  accentSoft: accentAlpha(0.2),
  warn: '#E5A46B',
  glow:
    `0 0 0 1px ${accentAlpha(0.38)}, ` +
    `0 0 24px ${accentAlpha(0.2)} inset, ` +
    `0 0 40px ${accentAlpha(0.14)}`,
  softGlow:
    '0 0 0 1px rgba(148,178,224,0.14), ' +
    '0 1px 0 rgba(255,255,255,0.03) inset',
  mono: "'JetBrains Mono', 'IBM Plex Mono', ui-monospace, Menlo, monospace",
} as const
