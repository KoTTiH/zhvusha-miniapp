import type { ComponentType } from 'react'
import type { WidgetId, WidgetMeta } from '../../types/widget'
import { CaloriesTodayWidget } from './CaloriesTodayWidget'
import { WaterTodayWidget } from './WaterTodayWidget'

type WidgetComponent = ComponentType

type RegistryEntry = {
  meta: WidgetMeta
  Component: WidgetComponent
}

export const WIDGET_REGISTRY: Record<WidgetId, RegistryEntry | undefined> = {
  'calories-today': {
    meta: {
      type: 'calories-today',
      title: 'Калории сегодня',
      description: 'Калории за сегодня: кольцо прогресса, БЖУК с целями, клетчатка и неделя в миниатюре.',
    },
    Component: CaloriesTodayWidget,
  },
  'water-today': {
    meta: {
      type: 'water-today',
      title: 'Вода сегодня',
      description: 'Дневная вода: прогресс к 2000 мл, быстрые +250/+500 и ручной ввод миллилитров.',
    },
    Component: WaterTodayWidget,
  },
}
