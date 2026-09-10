import { useEffect, useState } from 'react'

/** Примеры событий для placeholder'а в поле заметки. */
export const NOTE_EXAMPLES = [
  'позвонил маме',
  'сходил в зал',
  'прочитал главу',
  'вышел на прогулку',
  'поговорил с другом',
  'медитировал 10 минут',
] as const

/**
 * Развёрнутые примеры для поля еды — у AI результат тем точнее, чем больше
 * контекста (вес, бренд, способ приготовления). Плейсхолдер сам показывает,
 * как писать.
 */
export const FOOD_EXAMPLES = [
  'курица гриль 200 г + рис басмати 150 г',
  'овсянка на молоке с бананом и мёдом 300 г',
  'капучино 240 мл на овсяном молоке',
  'борщ со сметаной 350 мл, хлеб ржаной 40 г',
  'омлет из 3 яиц с помидорами и сыром',
  'батончик snickers 55 г',
] as const

/**
 * Живой placeholder, набирающийся и стирающийся по очереди по списку фраз.
 * Начинает анимацию немедленно при mount — иначе placeholder пуст первые
 * сотни миллисекунд, что визуально «дёрганно». Работает, пока `enabled=true`;
 * таймеры отменяются на размонтирование и при переключении в false.
 */
export function useTypewriterPlaceholder(
  phrases: readonly string[],
  enabled: boolean,
): string {
  const [text, setText] = useState('')

  useEffect(() => {
    if (!enabled || phrases.length === 0) return
    let idx = 0
    let cur = ''
    let dir: 'type' | 'erase' = 'type'
    let timer: number | null = null

    const CURSOR = '▏'
    const TYPE_MS = 70
    const ERASE_MS = 38
    const HOLD_MS = 1400
    const GAP_MS = 420

    const tick = () => {
      const full = phrases[idx % phrases.length] ?? ''
      if (dir === 'type') {
        if (cur.length < full.length) {
          cur = full.slice(0, cur.length + 1)
          setText(cur + CURSOR)
          timer = window.setTimeout(tick, TYPE_MS)
        } else {
          setText(cur)
          dir = 'erase'
          timer = window.setTimeout(tick, HOLD_MS)
        }
      } else {
        if (cur.length > 0) {
          cur = cur.slice(0, -1)
          setText(cur + CURSOR)
          timer = window.setTimeout(tick, ERASE_MS)
        } else {
          dir = 'type'
          idx += 1
          timer = window.setTimeout(tick, GAP_MS)
        }
      }
    }

    tick()
    return () => {
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [enabled, phrases])

  return enabled ? text : ''
}
