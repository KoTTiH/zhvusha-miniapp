/**
 * Идентификаторы типов виджетов на главном экране.
 * Новый виджет = новое значение в union + запись в WIDGET_IDS + регистрация в widgets/registry.tsx.
 */
export type WidgetId =
  | 'calories-today'
  | 'water-today'

export const WIDGET_IDS: WidgetId[] = [
  'calories-today',
  'water-today',
]

/**
 * Инстанс виджета на главной. id — стабильный идентификатор конкретной карточки
 * (используется как React key, для удаления); type — какого типа виджет.
 * Набор инстансов и их порядок хранится per-user в localStorage.
 */
export type WidgetInstance = {
  id: string
  type: WidgetId
}

/** Мета-информация о виджете для UI-пикера. */
export type WidgetMeta = {
  type: WidgetId
  title: string
  description: string
}
