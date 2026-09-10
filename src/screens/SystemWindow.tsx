import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { BalanceIndicator } from '../components/BalanceIndicator'
import type { SettingsTab } from '../components/SettingsSheet'
import { SysLabel, SystemTopStripe, ZHScreen } from '../design/primitives'
import { ZH, accentAlpha } from '../design/tokens'
import { dayKey } from '../lib/dates'
import { subscribeBackButton, telegramUserName } from '../lib/tma'
import { OPEN_DATA_SETTINGS_EVENT } from '../lib/uiEvents'
import { useCaloriesStore } from '../store/calories'
import { useWidgetsStore } from '../store/widgets'
import { WidgetHost, type WidgetDropPlacement } from '../components/widgets/WidgetHost'
import { WIDGET_REGISTRY } from '../components/widgets/registry'
import type { WidgetId } from '../types/widget'

const BalanceSheet = lazy(() =>
  import('../components/BalanceSheet').then((module) => ({ default: module.BalanceSheet })),
)
const HelpSheet = lazy(() =>
  import('../components/HelpSheet').then((module) => ({ default: module.HelpSheet })),
)
const SettingsSheet = lazy(() =>
  import('../components/SettingsSheet').then((module) => ({ default: module.SettingsSheet })),
)
const WidgetPicker = lazy(() =>
  import('../components/widgets/WidgetPicker').then((module) => ({
    default: module.WidgetPicker,
  })),
)

const HEADER_CIRCLE_BUTTON_SIZE = 24

type WidgetDragOver = {
  id: string
  placement: WidgetDropPlacement
} | null

export function SystemWindow() {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('color')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [balanceOpen, setBalanceOpen] = useState(false)
  const [draggingWidgetId, setDraggingWidgetId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<WidgetDragOver>(null)
  const draggingWidgetIdRef = useRef<string | null>(null)
  const dragOverRef = useRef<WidgetDragOver>(null)

  const caloriesHydrated = useCaloriesStore((s) => s.hydrated)
  const openAddSheet = useCaloriesStore((s) => s.openAddSheet)
  const widgets = useWidgetsStore((s) => s.widgets)
  const editing = useWidgetsStore((s) => s.editing)
  const widgetsHydrated = useWidgetsStore((s) => s.hydrated)
  const toggleWidgetType = useWidgetsStore((s) => s.toggleType)
  const removeWidget = useWidgetsStore((s) => s.remove)
  const moveWidget = useWidgetsStore((s) => s.move)
  const reorderWidget = useWidgetsStore((s) => s.reorder)
  const setEditing = useWidgetsStore((s) => s.setEditing)

  useEffect(() => {
    const openDataSettings = () => {
      setSettingsTab('data')
      setSettingsOpen(true)
    }
    window.addEventListener(OPEN_DATA_SETTINGS_EVENT, openDataSettings)
    return () => window.removeEventListener(OPEN_DATA_SETTINGS_EVENT, openDataSettings)
  }, [])

  useEffect(() => {
    if (!editing) return undefined
    return subscribeBackButton(() => {
      draggingWidgetIdRef.current = null
      dragOverRef.current = null
      setDraggingWidgetId(null)
      setDragOver(null)
      setEditing(false)
    })
  }, [editing, setEditing])

  const name = telegramUserName()

  const activeTypes = useMemo(() => {
    const set = new Set<WidgetId>()
    for (const w of widgets) set.add(w.type)
    return set
  }, [widgets])

  const today = new Date()
  const todayStr = today
    .toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
    .replace(/\./g, '.')

  const hasWidgets = widgets.length > 0
  const widgetsReady = widgetsHydrated
  const dashboardReady = widgetsReady && (hasWidgets || caloriesHydrated)
  const showEmptyDashboardState = dashboardReady && !hasWidgets && !editing

  const openSettings = (tab: SettingsTab = 'color') => {
    setSettingsTab(tab)
    setSettingsOpen(true)
  }

  const openFirstFood = () => {
    openAddSheet(dayKey(new Date()), 'food')
  }

  const updateDragOver = (next: WidgetDragOver) => {
    dragOverRef.current = next
    setDragOver(next)
  }

  const startWidgetDrag = (id: string) => {
    draggingWidgetIdRef.current = id
    setDraggingWidgetId(id)
    updateDragOver(null)
  }

  const moveWidgetDrag = (clientX: number, clientY: number) => {
    const draggingId = draggingWidgetIdRef.current
    if (!draggingId) return
    const element = document.elementFromPoint(clientX, clientY)
    const host = element instanceof Element
      ? (element.closest('[data-widget-id]') as HTMLElement | null)
      : null
    const targetId = host?.dataset.widgetId
    if (!targetId || targetId === draggingId) {
      updateDragOver(null)
      return
    }
    const rect = host.getBoundingClientRect()
    const placement: WidgetDropPlacement = clientY > rect.top + rect.height / 2 ? 'after' : 'before'
    updateDragOver({ id: targetId, placement })
  }

  const finishWidgetDrag = () => {
    const draggingId = draggingWidgetIdRef.current
    const over = dragOverRef.current
    if (draggingId && over) {
      reorderWidget(draggingId, over.id, over.placement)
    }
    draggingWidgetIdRef.current = null
    updateDragOver(null)
    setDraggingWidgetId(null)
  }

  const finishEditing = () => {
    draggingWidgetIdRef.current = null
    dragOverRef.current = null
    setDraggingWidgetId(null)
    setDragOver(null)
    setEditing(false)
  }

  return (
    <ZHScreen>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          paddingBottom: 110,
        }}
      >
        <SystemTopStripe
          right={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {editing ? (
                <button
                  type="button"
                  onClick={finishEditing}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    padding: '4px 10px',
                    borderRadius: 7,
                    border: `1px solid ${accentAlpha(0.4)}`,
                    background: accentAlpha(0.12),
                    fontFamily: ZH.mono,
                    fontSize: 10,
                    fontWeight: 500,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: ZH.accent,
                  }}
                >
                  готово
                </button>
              ) : (
                <>
                  <span
                    style={{
                      fontFamily: ZH.mono,
                      fontSize: 10,
                      letterSpacing: '0.16em',
                      color: ZH.textFaint,
                      textTransform: 'uppercase',
                    }}
                  >
                    {todayStr}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (hasWidgets) setEditing(true)
                      else setPickerOpen(true)
                    }}
                    aria-label={hasWidgets ? 'настроить виджеты' : 'добавить виджеты'}
                    style={{
                      all: 'unset',
                      width: HEADER_CIRCLE_BUTTON_SIZE,
                      height: HEADER_CIRCLE_BUTTON_SIZE,
                      borderRadius: 999,
                      border: `1px solid ${ZH.line}`,
                      color: ZH.textDim,
                      fontFamily: ZH.mono,
                      fontSize: 12,
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    onClick={() => setHelpOpen(true)}
                    aria-label="помощь"
                    style={{
                      all: 'unset',
                      width: HEADER_CIRCLE_BUTTON_SIZE,
                      height: HEADER_CIRCLE_BUTTON_SIZE,
                      borderRadius: 999,
                      border: `1px solid ${ZH.line}`,
                      color: ZH.textDim,
                      fontFamily: ZH.mono,
                      fontSize: 12,
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    ?
                  </button>
                  <button
                    type="button"
                    onClick={() => openSettings('color')}
                    aria-label="настройки"
                    style={{
                      all: 'unset',
                      width: HEADER_CIRCLE_BUTTON_SIZE,
                      height: HEADER_CIRCLE_BUTTON_SIZE,
                      borderRadius: 999,
                      border: `1px solid ${ZH.line}`,
                      color: ZH.textDim,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <SettingsGlyph />
                  </button>
                </>
              )}
            </div>
          }
        />

        <div
          style={{
            padding: '4px 20px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          <BalanceIndicator onClick={() => setBalanceOpen(true)} />
        </div>

        <div
          style={{
            padding: '6px 16px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {!dashboardReady ? (
            <DashboardHydrationSpace />
          ) : showEmptyDashboardState ? (
            <EmptyDashboardState
              onAddFood={openFirstFood}
              onAddWidget={() => setPickerOpen(true)}
            />
          ) : hasWidgets ? (
            widgets.map((w, index) => {
              const entry = WIDGET_REGISTRY[w.type]
              if (!entry) return null
              const { Component } = entry
              return (
                <WidgetHost
                  key={w.id}
                  id={w.id}
                  label={entry.meta.title}
                  editing={editing}
                  canMoveUp={index > 0}
                  canMoveDown={index < widgets.length - 1}
                  dragging={draggingWidgetId === w.id}
                  dropPlacement={dragOver?.id === w.id ? dragOver.placement : null}
                  onEnterEditing={() => setEditing(true)}
                  onRemove={() => removeWidget(w.id)}
                  onMoveUp={() => moveWidget(w.id, -1)}
                  onMoveDown={() => moveWidget(w.id, 1)}
                  onDragStart={() => startWidgetDrag(w.id)}
                  onDragMove={moveWidgetDrag}
                  onDragEnd={finishWidgetDrag}
                >
                  <Suspense fallback={<WidgetSkeleton />}>
                    <Component />
                  </Suspense>
                </WidgetHost>
              )
            })
          ) : (
            <EmptyState onAddFood={openFirstFood} onAddWidget={() => setPickerOpen(true)} />
          )}

          {hasWidgets && !showEmptyDashboardState && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '14px 0',
                borderRadius: 12,
                textAlign: 'center',
                border: `1px dashed ${accentAlpha(editing ? 0.55 : 0.3)}`,
                background: accentAlpha(editing ? 0.08 : 0.04),
                fontFamily: ZH.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: ZH.accent,
              }}
            >
              + добавить виджет
            </button>
          )}
        </div>
      </div>

      {pickerOpen && (
        <Suspense fallback={null}>
          <WidgetPicker
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onToggle={toggleWidgetType}
            activeTypes={activeTypes}
          />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsSheet
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            tab={settingsTab}
            onTabChange={setSettingsTab}
          />
        </Suspense>
      )}
      {helpOpen && (
        <Suspense fallback={null}>
          <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
        </Suspense>
      )}
      {balanceOpen && (
        <Suspense fallback={null}>
          <BalanceSheet open={balanceOpen} onClose={() => setBalanceOpen(false)} />
        </Suspense>
      )}
    </ZHScreen>
  )
}

function EmptyDashboardState({
  onAddFood,
  onAddWidget,
}: {
  onAddFood: () => void
  onAddWidget: () => void
}) {
  return (
    <div
      style={{
        marginTop: 42,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: '0 20px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'center',
          textAlign: 'center',
          width: '100%',
          maxWidth: 320,
          minWidth: 0,
        }}
      >
        <SysLabel color={ZH.textFaint}>первый шаг</SysLabel>
        <div
          style={{
            margin: '0 0 4px',
            padding: '10px 14px 12px',
            borderTop: `1px solid ${accentAlpha(0.18)}`,
            borderBottom: `1px solid ${accentAlpha(0.1)}`,
            fontSize: 24,
            lineHeight: 1.12,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: ZH.text,
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          Запиши первую еду
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.55,
            color: ZH.textDim,
            width: '100%',
            maxWidth: 290,
            boxSizing: 'border-box',
          }}
        >
          Фото, голос или текст. Я помогу записать еду.
        </div>
      </div>

      <div
        style={{
          marginTop: 8,
          width: '100%',
          maxWidth: 340,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={onAddFood}
          style={{
            all: 'unset',
            cursor: 'pointer',
            minHeight: 52,
            borderRadius: 12,
            border: `1px solid ${ZH.accent}`,
            background: `linear-gradient(180deg, ${accentAlpha(0.86)}, ${accentAlpha(0.56)})`,
            boxShadow: `0 0 26px ${accentAlpha(0.34)}, 0 0 0 1px ${accentAlpha(0.16)} inset`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 18px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <SysLabel color={ZH.bg}>добавить еду</SysLabel>
        </button>
        <button
          type="button"
          onClick={onAddWidget}
          style={{
            all: 'unset',
            cursor: 'pointer',
            minHeight: 40,
            borderRadius: 10,
            border: `1px dashed ${accentAlpha(0.32)}`,
            background: accentAlpha(0.035),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 14px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <SysLabel color={ZH.textFaint}>добавить виджеты</SysLabel>
        </button>
      </div>
    </div>
  )
}

function SettingsGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 3.5v2.2 M12 18.3v2.2 M4.5 12h2.2 M17.3 12h2.2 M6.7 6.7l1.6 1.6 M15.7 15.7l1.6 1.6 M6.7 17.3l1.6-1.6 M15.7 8.3l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

function DashboardHydrationSpace() {
  return <div aria-hidden style={{ minHeight: 230 }} />
}

function WidgetSkeleton() {
  return (
    <div
      aria-hidden
      style={{
        minHeight: 84,
        borderRadius: 14,
        border: `1px solid ${accentAlpha(0.08)}`,
        background: `linear-gradient(180deg, ${accentAlpha(0.035)}, rgba(18,23,36,0.16))`,
        opacity: 0.55,
      }}
    />
  )
}

function EmptyState({
  onAddFood,
  onAddWidget,
}: {
  onAddFood: () => void
  onAddWidget: () => void
}) {
  return (
    <div
      style={{
        marginTop: 42,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: '0 20px',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          margin: '0 0 4px',
          padding: '10px 14px 12px',
          borderTop: `1px solid ${accentAlpha(0.18)}`,
          borderBottom: `1px solid ${accentAlpha(0.1)}`,
          fontSize: 22,
          lineHeight: 1.15,
          fontWeight: 600,
          color: ZH.text,
          textAlign: 'center',
          width: '100%',
          maxWidth: 320,
          boxSizing: 'border-box',
        }}
      >
        Главная пока пустая
      </div>
      <div
        style={{
          fontSize: 13,
          color: ZH.textDim,
          textAlign: 'center',
          lineHeight: 1.55,
          width: '100%',
          maxWidth: 290,
          boxSizing: 'border-box',
        }}
      >
        Добавь еду или верни виджет, чтобы собрать рабочий экран.
      </div>
      <div
        style={{
          marginTop: 6,
          width: '100%',
          maxWidth: 340,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={onAddFood}
          style={{
            all: 'unset',
            cursor: 'pointer',
            minHeight: 52,
            borderRadius: 12,
            background: `linear-gradient(180deg, ${accentAlpha(0.8)}, ${accentAlpha(0.53)})`,
            border: `1px solid ${ZH.accent}`,
            boxShadow: `0 0 24px ${accentAlpha(0.35)}, 0 0 0 1px ${accentAlpha(0.15)} inset`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 18px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <SysLabel color={ZH.bg}>добавить еду</SysLabel>
        </button>
        <button
          type="button"
          onClick={onAddWidget}
          style={{
            all: 'unset',
            cursor: 'pointer',
            minHeight: 40,
            borderRadius: 10,
            border: `1px dashed ${accentAlpha(0.32)}`,
            background: accentAlpha(0.035),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 14px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          <SysLabel color={ZH.textFaint}>+ добавить виджет</SysLabel>
        </button>
      </div>
    </div>
  )
}
