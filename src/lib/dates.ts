import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import type { DayKey } from '../types/note'

export const WEEK_STARTS_ON = 1

export function dayKey(date: Date): DayKey {
  return format(date, 'yyyy-MM-dd')
}

export function monthGrid(anchor: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON })
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: WEEK_STARTS_ON })
  return eachDayOfInterval({ start: gridStart, end: gridEnd })
}

export function monthTitle(anchor: Date, locale: 'ru' | 'en' = 'ru'): string {
  const months = locale === 'ru'
    ? ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
    : ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
  return `${months[anchor.getMonth()]} ${anchor.getFullYear()}`
}

export const weekdayShort = {
  ru: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}

const RU_WEEKDAY_LONG = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
const RU_MONTH_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export function formatDayTitle(day: DayKey): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${RU_WEEKDAY_LONG[date.getDay()]}, ${date.getDate()} ${RU_MONTH_GEN[date.getMonth()]} ${date.getFullYear()}`
}

export { addMonths, subMonths, isSameDay, isSameMonth, startOfMonth }
