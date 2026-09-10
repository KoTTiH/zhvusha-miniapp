import type { FoodLogStatus } from '../types/calorie'

export function foodStatusToast(status: FoodLogStatus): string {
  if (status === 'no_food') return 'Отмечено: еды не было'
  if (status === 'not_logged') return 'Отмечено: не записывал'
  return 'Отметка сброшена'
}
