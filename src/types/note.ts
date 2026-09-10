import type { NoteColor } from '../lib/colors'

export type Note = {
  id: string
  text: string
  color: NoteColor
  createdAt: number
  updatedAt: number
}

export type DayKey = string

/**
 * Режим отображения ячеек календаря на ZHMap:
 * - 'kcal'  — точка/значок отклонения от дневной цели ккал (дефолт).
 * - 'notes' — до 3 верхних заметок мелким шрифтом в клетке.
 */
export type CalendarMode = 'kcal' | 'notes'
