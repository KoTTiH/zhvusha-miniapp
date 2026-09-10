import { hapticFeedback } from '@tma.js/sdk-react'

export function hapticSuccess(): void {
  try {
    hapticFeedback.notificationOccurred('success')
  } catch {
    /* SDK недоступен */
  }
}

export function hapticError(): void {
  try {
    hapticFeedback.notificationOccurred('error')
  } catch {
    /* SDK недоступен */
  }
}

export function hapticWarning(): void {
  try {
    hapticFeedback.notificationOccurred('warning')
  } catch {
    /* SDK недоступен */
  }
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    hapticFeedback.impactOccurred(style)
  } catch {
    /* SDK недоступен */
  }
}

export function hapticSelection(): void {
  try {
    hapticFeedback.selectionChanged()
  } catch {
    /* SDK недоступен */
  }
}
