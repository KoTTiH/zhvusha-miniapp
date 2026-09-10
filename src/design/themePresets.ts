export type AccentPreset = {
  id: string
  label: string
  hex: string
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: 'violet', label: 'Violet', hex: '#A78BFA' },
  { id: 'royal', label: 'Royal', hex: '#7C3AED' },
  { id: 'magenta', label: 'Magenta', hex: '#EC4899' },
  { id: 'aqua', label: 'Aqua', hex: '#5EE4B8' },
  { id: 'cyan', label: 'Cyan', hex: '#22D3EE' },
  { id: 'amber', label: 'Amber', hex: '#F59E0B' },
  { id: 'lime', label: 'Lime', hex: '#A3E635' },
  { id: 'crimson', label: 'Crimson', hex: '#F43F5E' },
]

export const DEFAULT_ACCENT = ACCENT_PRESETS[0].hex
