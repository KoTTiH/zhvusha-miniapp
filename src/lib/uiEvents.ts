export const OPEN_DATA_SETTINGS_EVENT = 'zhvusha:open-data-settings'

export function requestOpenDataSettings(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(OPEN_DATA_SETTINGS_EVENT))
}
