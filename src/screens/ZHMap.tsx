import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Panel, SystemTopStripe, ZHScreen } from '../design/primitives'
import { ZH, accentAlpha, mixAlpha } from '../design/tokens'
import { FoodLogStatusControls } from '../components/FoodLogStatusControls'
import { foodStatusToast } from '../lib/foodLogStatus'
import { hapticImpact, hapticSuccess } from '../lib/haptic'
import {
  addMonths,
  dayKey,
  isSameDay,
  isSameMonth,
  monthGrid,
  monthTitle,
  startOfMonth,
  subMonths,
  weekdayShort,
} from '../lib/dates'
import { computeDayKcal, entryTotal, resolveEntry, roundG, roundKcal, sumTotals } from '../lib/nutrition'
import {
  loadWaterColorMode,
  loadWaterGoalMl,
  resolveWaterColor,
  subscribeWaterSettingsChanged,
  sumWater,
} from '../lib/water'
import { useCaloriesStore } from '../store/calories'
import { useNotesStore } from '../store/notes'
import { useThemeStore } from '../store/theme'
import type { FoodLogStatus } from '../types/calorie'
import type { CalendarMode, DayKey, Note } from '../types/note'

const MAX_NOTES_IN_SUMMARY = 5
const MAX_NOTES_IN_CELL = 3

type Props = {
  onDayTap: (day: DayKey, rect: DOMRect) => void
}

export function ZHMap({ onDayTap }: Props) {
  const [anchor, setAnchor] = useState<Date>(() => startOfMonth(new Date()))
  const [selectedKey, setSelectedKey] = useState<DayKey | null>(null)
  const [waterGoalMl, setWaterGoalMl] = useState(() => loadWaterGoalMl())
  const [waterColorMode, setWaterColorMode] = useState(() => loadWaterColorMode())
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const swipeMoved = useRef(false)

  const selectDay = useNotesStore((s) => s.selectDay)

  // Стабильный callback — иначе inline `(rect) => handleCellTap(c.key, rect)` в
  // `.map(DayCell)` пересоздаётся на каждый ре-рендер, и 42 DayCell мемо-обёртки
  // промахиваются по пропсам даже если ничего кроме чужого стора не менялось.
  const handleCellTap = useCallback(
    (key: DayKey, rect: DOMRect) => {
      if (selectedKey === key) {
        onDayTap(key, rect)
        return
      }
      // Синхронизируем со store.selectedDay — FAB на главном пишет в выбранный
      // день, а не в сегодня. loadDay внутри selectDay идемпотентен (ранний
      // return если день уже загружен), так что повторные тапы не дергают I/O.
      selectDay(key)
      setSelectedKey(key)
    },
    [onDayTap, selectDay, selectedKey],
  )

  const notesByDay = useNotesStore((s) => s.notesByDay)
  const notesHydrated = useNotesStore((s) => s.hydrated)
  const loadNotesRange = useNotesStore((s) => s.loadRange)
  const calendarMode = useNotesStore((s) => s.calendarMode)
  const setCalendarMode = useNotesStore((s) => s.setCalendarMode)
  const entriesByDay = useCaloriesStore((s) => s.entriesByDay)
  const caloriesHydrated = useCaloriesStore((s) => s.hydrated)
  const loadCaloriesRange = useCaloriesStore((s) => s.loadRange)
  const waterByDay = useCaloriesStore((s) => s.waterByDay)
  const loadWaterRange = useCaloriesStore((s) => s.loadWaterRange)
  const dayMetaByDay = useCaloriesStore((s) => s.dayMetaByDay)
  const loadDayMetaRange = useCaloriesStore((s) => s.loadDayMetaRange)
  const setFoodLogStatus = useCaloriesStore((s) => s.setFoodLogStatus)
  const showToast = useCaloriesStore((s) => s.showToast)
  const foods = useCaloriesStore((s) => s.foods)
  const goalKcal = useCaloriesStore((s) => s.goal.kcal)
  const calorieDeviationEnabled = useThemeStore((s) => s.calorieDeviationEnabled)
  const calorieDeviationColor = useThemeStore((s) => s.calorieDeviationColor)

  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => dayKey(today), [today])
  const grid = useMemo(() => monthGrid(anchor), [anchor])
  const gridKeys = useMemo(() => grid.map((d) => dayKey(d)), [grid])
  const monthKey = `${anchor.getFullYear()}-${anchor.getMonth()}`
  const waterColor = resolveWaterColor(waterColorMode)

  useEffect(() => {
    void loadNotesRange(gridKeys)
    void loadCaloriesRange(gridKeys)
    void loadWaterRange(gridKeys)
    void loadDayMetaRange(gridKeys)
  }, [gridKeys, loadNotesRange, loadCaloriesRange, loadWaterRange, loadDayMetaRange])

  useEffect(() => {
    return subscribeWaterSettingsChanged(() => {
      setWaterGoalMl(loadWaterGoalMl())
      setWaterColorMode(loadWaterColorMode())
    })
  }, [])

  const cells = useMemo(() => {
    return grid.map((date) => {
      const key = dayKey(date)
      const inMonth = isSameMonth(date, anchor)
      const isToday = isSameDay(date, today)
      const dayNotes = notesByDay[key] ?? []
      const waterEntries = waterByDay[key] ?? []
      const waterMl = sumWater(waterEntries)
      const waterProgress = waterGoalMl > 0 ? Math.min(1, waterMl / waterGoalMl) : 0
      const isLazy = dayMetaByDay[key]?.lazy === true
      const foodStatus = dayMetaByDay[key]?.foodStatus ?? 'unknown'
      const eventCount =
        dayNotes.length +
        (entriesByDay[key]?.length ?? 0) +
        waterEntries.length +
        (isLazy ? 1 : 0) +
        (foodStatus !== 'unknown' ? 1 : 0)
      const entries = entriesByDay[key]
      const kcal = entries && entries.length > 0 ? computeDayKcal(entries, foods) : null
      const kcalDelta = kcal !== null ? Math.round(kcal - goalKcal) : null
      const topNotes = dayNotes.slice(0, MAX_NOTES_IN_CELL).map((n) => n.text)
      return { date, key, inMonth, isToday, eventCount, kcalDelta, topNotes, isLazy, foodStatus, waterProgress }
    })
  }, [grid, notesByDay, entriesByDay, waterByDay, dayMetaByDay, today, anchor, foods, goalKcal, waterGoalMl])

  const calendarReady = useMemo(() => {
    return notesHydrated && caloriesHydrated && gridKeys.every((key) =>
      key in notesByDay
      && key in entriesByDay
      && key in waterByDay
      && key in dayMetaByDay
    )
  }, [
    notesHydrated,
    caloriesHydrated,
    gridKeys,
    notesByDay,
    entriesByDay,
    waterByDay,
    dayMetaByDay,
  ])

  // Сводка выбранного дня: калории + БЖУК + тексты заметок.
  const selectedSummary = useMemo(() => {
    if (!selectedKey) return null
    const entries = entriesByDay[selectedKey] ?? []
    const totals = sumTotals(entries.map((e) => entryTotal(resolveEntry(e, foods))))
    const notes = notesByDay[selectedKey] ?? []
    const waterMl = (waterByDay[selectedKey] ?? []).reduce((sum, entry) => sum + entry.ml, 0)
    const lazy = dayMetaByDay[selectedKey]?.lazy === true
    const foodStatus = dayMetaByDay[selectedKey]?.foodStatus ?? 'unknown'
    return {
      foodEntryCount: entries.length,
      isPastDay: selectedKey < todayKey,
      totals,
      notes,
      waterMl,
      lazy,
      foodStatus,
    }
  }, [selectedKey, todayKey, entriesByDay, notesByDay, waterByDay, dayMetaByDay, foods])

  const handleFoodStatusForSelected = useCallback(async (status: FoodLogStatus) => {
    if (!selectedKey) return
    hapticImpact('light')
    await setFoodLogStatus(selectedKey, status)
    hapticSuccess()
    showToast(foodStatusToast(status))
  }, [selectedKey, setFoodLogStatus, showToast])

  return (
    <ZHScreen>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          paddingBottom: 80,
        }}
      >
        <SystemTopStripe
          label="карта дней"
          right={
            <CalendarModeToggle mode={calendarMode} onChange={setCalendarMode} />
          }
        />

        <div style={{ padding: '4px 20px 4px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <button
              type="button"
              onClick={() => setAnchor((a) => subMonths(a, 1))}
              style={navBtn}
              aria-label="предыдущий месяц"
            >
              ‹
            </button>
            <div
              style={{
                fontFamily: ZH.mono,
                fontSize: 14,
                color: ZH.text,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              {monthTitle(anchor)}
            </div>
            <button
              type="button"
              onClick={() => setAnchor((a) => addMonths(a, 1))}
              style={navBtn}
              aria-label="следующий месяц"
            >
              ›
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {weekdayShort.ru.map((d) => (
              <div
                key={d}
                style={{
                  textAlign: 'center',
                  fontFamily: ZH.mono,
                  fontSize: 9,
                  letterSpacing: '0.14em',
                  color: ZH.textFaint,
                  textTransform: 'uppercase',
                }}
              >
                {d}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{ padding: '0 20px', touchAction: 'pan-y' }}
          onPointerDown={(e) => {
            swipeStart.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId }
            swipeMoved.current = false
          }}
          onPointerMove={(e) => {
            const s = swipeStart.current
            if (!s || s.pointerId !== e.pointerId) return
            if (Math.abs(e.clientX - s.x) > 10) swipeMoved.current = true
          }}
          onPointerUp={(e) => {
            const s = swipeStart.current
            if (!s || s.pointerId !== e.pointerId) return
            const dx = e.clientX - s.x
            const dy = e.clientY - s.y
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
              if (dx < 0) setAnchor((a) => addMonths(a, 1))
              else setAnchor((a) => subMonths(a, 1))
            }
            swipeStart.current = null
          }}
          onPointerCancel={() => {
            swipeStart.current = null
            swipeMoved.current = false
          }}
          onClickCapture={(e) => {
            if (swipeMoved.current) {
              e.preventDefault()
              e.stopPropagation()
              swipeMoved.current = false
            }
          }}
        >
          <div
            key={monthKey}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              gap: 6,
            }}
          >
            {calendarReady
              ? cells.map((c) => (
                  <DayCell
                    key={c.key}
                    dayKey={c.key}
                    day={c.date.getDate()}
                    intensity={c.eventCount}
                    isToday={c.isToday}
                    isOther={!c.inMonth}
                    isEmpty={c.eventCount === 0 && !c.isToday}
                    isSelected={selectedKey === c.key}
                    mode={calendarMode}
                    kcalDelta={c.kcalDelta}
                    goalKcal={goalKcal}
                    highlightDeviation={calorieDeviationEnabled}
                    deviationColor={calorieDeviationColor}
                    topNotes={c.topNotes}
                    isLazy={c.isLazy}
                    waterProgress={c.waterProgress}
                    waterColor={waterColor}
                    onTap={handleCellTap}
                  />
                ))
              : grid.map((date) => (
                  <CalendarCellPlaceholder
                    key={dayKey(date)}
                    day={date.getDate()}
                    isOther={!isSameMonth(date, anchor)}
                    mode={calendarMode}
                  />
                ))}
          </div>
        </div>

        <div style={{ padding: '8px 20px 0' }}>
          <Panel style={{ padding: '10px 12px', width: '100%' }}>
            {selectedSummary ? (
              <DaySummary
                kcal={selectedSummary.totals.kcal}
                carbs={selectedSummary.totals.carbs}
                fat={selectedSummary.totals.fat}
                protein={selectedSummary.totals.protein}
                fiber={selectedSummary.totals.fiber}
                notes={selectedSummary.notes}
                waterMl={selectedSummary.waterMl}
                lazy={selectedSummary.lazy}
                foodStatus={selectedSummary.foodStatus}
                foodEntryCount={selectedSummary.foodEntryCount}
                showFoodStatusControl={selectedSummary.isPastDay}
                waterColor={waterColor}
                onSetFoodStatus={(status) => void handleFoodStatusForSelected(status)}
              />
            ) : (
              <div
                style={{
                  fontFamily: ZH.mono,
                  fontSize: 11,
                  color: ZH.textFaint,
                  letterSpacing: '0.08em',
                  textAlign: 'center',
                  textTransform: 'uppercase',
                  padding: '4px 0',
                }}
              >
                выбери день
              </div>
            )}
          </Panel>
        </div>
      </div>
    </ZHScreen>
  )
}

function CalendarCellPlaceholder({
  day,
  isOther,
  mode,
}: {
  day: number
  isOther: boolean
  mode: CalendarMode
}) {
  const showNotes = mode === 'notes'
  return (
    <div
      aria-hidden
      style={{
        aspectRatio: showNotes ? 'auto' : '1 / 1',
        minHeight: showNotes ? 58 : undefined,
        borderRadius: 8,
        position: 'relative',
        boxSizing: 'border-box',
        border: `1px solid ${ZH.line}`,
        background: ZH.panel,
        opacity: isOther ? 0.18 : 0.34,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: showNotes ? 5 : '50%',
          left: showNotes ? 5 : '50%',
          transform: showNotes ? 'none' : 'translate(-50%, -50%)',
          fontFamily: ZH.mono,
          fontSize: showNotes ? 10 : 12,
          fontWeight: 500,
          color: ZH.textFaint,
          lineHeight: 1,
        }}
      >
        {day}
      </span>
    </div>
  )
}

function DaySummary({
  kcal,
  carbs,
  fat,
  protein,
  fiber,
  notes,
  waterMl,
  lazy,
  foodStatus,
  foodEntryCount,
  showFoodStatusControl,
  waterColor,
  onSetFoodStatus,
}: {
  kcal: number
  carbs: number
  fat: number
  protein: number
  fiber: number
  notes: Note[]
  waterMl: number
  lazy: boolean
  foodStatus: FoodLogStatus
  foodEntryCount: number
  showFoodStatusControl: boolean
  waterColor: string
  onSetFoodStatus: (status: FoodLogStatus) => void
}) {
  const visibleNotes = notes.slice(0, MAX_NOTES_IN_SUMMARY)
  const extra = notes.length - visibleNotes.length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 18,
              color: ZH.text,
              fontWeight: 500,
              letterSpacing: '0.04em',
            }}
          >
            {roundKcal(kcal)}
          </span>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 9,
              color: ZH.textFaint,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            ккал
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            fontFamily: ZH.mono,
            fontSize: 10,
            color: ZH.textDim,
            letterSpacing: '0.04em',
          }}
        >
          <MacroTag letter="У" value={carbs} />
          <MacroTag letter="Ж" value={fat} />
          <MacroTag letter="Б" value={protein} />
          <MacroTag letter="К" value={fiber} />
        </div>
      </div>
      {(waterMl > 0 || lazy || foodStatus !== 'unknown') && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {foodStatus !== 'unknown' && (
            <InfoPill label="еда" value={foodStatus === 'no_food' ? 'не было' : 'не записывал'} />
          )}
          {waterMl > 0 && <InfoPill label="вода" value={`${waterMl} мл`} color={waterColor} />}
          {lazy && <InfoPill label="AI" value="примерно" warn />}
        </div>
      )}
      {foodEntryCount === 0 && showFoodStatusControl && (
        <FoodLogStatusControls
          compact
          status={foodStatus}
          onSetStatus={onSetFoodStatus}
        />
      )}
      {notes.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${ZH.line}`,
            paddingTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          {visibleNotes.map((n) => (
            <div
              key={n.id}
              style={{
                display: 'flex',
                gap: 6,
                fontFamily: ZH.mono,
                fontSize: 11,
                color: ZH.text,
                lineHeight: 1.4,
                letterSpacing: '0.02em',
              }}
            >
              <span style={{ color: ZH.textFaint, flexShrink: 0 }}>·</span>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {n.text}
              </span>
            </div>
          ))}
          {extra > 0 && (
            <div
              style={{
                fontFamily: ZH.mono,
                fontSize: 10,
                color: ZH.textFaint,
                letterSpacing: '0.08em',
                paddingLeft: 12,
              }}
            >
              …и ещё {extra}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InfoPill({
  label,
  value,
  warn = false,
  color,
}: {
  label: string
  value: string
  warn?: boolean
  color?: string
}) {
  const pillColor = warn ? ZH.warn : color ?? ZH.accent
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        border: `1px solid ${warn ? `${ZH.warn}55` : mixAlpha(pillColor, 35)}`,
        borderRadius: 999,
        padding: '4px 7px',
        background: warn ? `${ZH.warn}10` : mixAlpha(pillColor, 6),
        fontFamily: ZH.mono,
        fontSize: 10,
        letterSpacing: '0.06em',
        color: pillColor,
      }}
    >
      <span style={{ color: ZH.textFaint }}>{label}</span>
      {value}
    </span>
  )
}

function MacroTag({ letter, value }: { letter: string; value: number }) {
  return (
    <span>
      <span style={{ color: ZH.textFaint }}>{letter}</span>
      {roundG(value)}
    </span>
  )
}

type DayCellProps = {
  dayKey: DayKey
  day: number
  intensity: number
  isToday: boolean
  isOther: boolean
  isEmpty: boolean
  isSelected: boolean
  mode: CalendarMode
  /** Отклонение от дневной цели ккал; null = нет записей о еде. */
  kcalDelta: number | null
  goalKcal: number
  highlightDeviation: boolean
  deviationColor: string
  /** До 3 верхних заметок — первое, что видно в режиме notes. */
  topNotes: string[]
  isLazy: boolean
  waterProgress: number
  waterColor: string
  onTap: (key: DayKey, rect: DOMRect) => void
}

// memo — DayCell рендерится 42 раза на месяц. Без неё любой ре-рендер ZHMap
// (например, обновление чужого поля в zustand) пересобирает всю сетку,
// даже если `day`/`intensity`/`isToday` конкретной ячейки не изменились.
const DayCell = memo(function DayCell({
  dayKey,
  day,
  intensity,
  isToday,
  isOther,
  isEmpty,
  isSelected,
  mode,
  kcalDelta,
  goalKcal,
  highlightDeviation,
  deviationColor,
  topNotes,
  isLazy,
  waterProgress,
  waterColor,
  onTap,
}: DayCellProps) {
  const ref = useRef<HTMLButtonElement>(null)
  // Цвет дня — акцент темы пользователя. Статов больше нет, всё сводится к
  // интенсивности (сколько событий было в этот день).
  const hue = 'var(--zh-accent)'
  const level = Math.min(4, intensity) as 0 | 1 | 2 | 3 | 4
  const showNotes = mode === 'notes'

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => ref.current && onTap(dayKey, ref.current.getBoundingClientRect())}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        all: 'unset',
        aspectRatio: showNotes ? 'auto' : '1 / 1',
        minHeight: showNotes ? 58 : undefined,
        borderRadius: 8,
        position: 'relative',
        display: 'flex',
        flexDirection: showNotes ? 'column' : 'row',
        alignItems: showNotes ? 'stretch' : 'center',
        justifyContent: showNotes ? 'flex-start' : 'center',
        padding: showNotes ? '4px 3px' : 0,
        boxSizing: 'border-box',
        cursor: 'pointer',
        background: 'transparent',
        border: isSelected ? `1px solid ${accentAlpha(0.5)}` : 'none',
        opacity: isOther ? 0.3 : 1,
        overflow: 'hidden',
      }}
    >
      {!showNotes && <WaterFillBar progress={waterProgress} color={waterColor} />}
      {isToday && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: showNotes ? (isLazy ? 24 : 4) : 8,
            width: 4,
            height: 4,
            borderRadius: 999,
            background: ZH.accent,
            boxShadow: `0 0 4px ${accentAlpha(0.6)}`,
            zIndex: 3,
          }}
        />
      )}
      {isLazy && (
        <span
          aria-label="примерный день"
          style={{
            position: 'absolute',
            top: 3,
            right: showNotes ? 3 : undefined,
            left: showNotes ? undefined : 4,
            zIndex: 3,
            padding: '1px 3px',
            borderRadius: 4,
            border: `1px solid ${ZH.warn}66`,
            background: `${ZH.warn}16`,
            color: ZH.warn,
            fontFamily: ZH.mono,
            fontSize: 6,
            fontWeight: 600,
            lineHeight: 1,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          AI
        </span>
      )}
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: showNotes ? 10 : 12,
          fontWeight: isToday ? 600 : 500,
          color: isToday ? ZH.text : isEmpty ? ZH.textFaint : ZH.textDim,
          zIndex: 2,
          alignSelf: showNotes ? 'flex-start' : 'center',
          paddingLeft: showNotes ? 2 : 0,
          lineHeight: 1,
        }}
      >
        {day}
      </span>
      {showNotes ? (
        topNotes.length > 0 && (
          <div
            style={{
              marginTop: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {topNotes.map((text, i) => (
              <div
                key={i}
                style={{
                  fontSize: 7,
                  lineHeight: 1.15,
                  color: ZH.textDim,
                  letterSpacing: '0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {text}
              </div>
            ))}
          </div>
        )
      ) : kcalDelta !== null ? (
        <KcalBadge
          delta={kcalDelta}
          goalKcal={goalKcal}
          highContrast={isToday}
          highlightDeviation={highlightDeviation}
          deviationColor={deviationColor}
        />
      ) : (
        level > 0 && !isToday && (
          <div
            style={{
              position: 'absolute',
              bottom: 4,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 1.5,
            }}
          >
            {Array.from({ length: level }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 2,
                  height: 2,
                  borderRadius: 999,
                  background: hue,
                  boxShadow: `0 0 3px ${hue}`,
                }}
              />
            ))}
          </div>
        )
      )}
    </button>
  )
})

function WaterFillBar({ progress, color }: { progress: number; color: string }) {
  const pct = Math.max(0, Math.min(1, progress)) * 100
  if (pct <= 0) return null

  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        top: '50%',
        right: 3,
        height: '46%',
        width: 1.5,
        transform: 'translateY(-50%)',
        borderRadius: 999,
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      <span
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: `${pct}%`,
          minHeight: pct > 0 ? 1.5 : 0,
          borderRadius: 999,
          background: color,
          boxShadow: pct > 0 ? `0 0 4px ${mixAlpha(color, 65)}` : 'none',
          transition: 'height 180ms ease',
        }}
      />
    </span>
  )
}

function CalendarModeToggle({
  mode,
  onChange,
}: {
  mode: CalendarMode
  onChange: (m: CalendarMode) => void
}) {
  const items: { id: CalendarMode; label: string }[] = [
    { id: 'kcal', label: 'ккал' },
    { id: 'notes', label: 'заметки' },
  ]
  return (
    <div
      role="tablist"
      aria-label="режим календаря"
      style={{
        display: 'inline-flex',
        padding: 2,
        borderRadius: 8,
        border: `1px solid ${ZH.line}`,
        background: 'rgba(8,9,15,0.4)',
        gap: 2,
      }}
    >
      {items.map((it) => {
        const active = mode === it.id
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '4px 9px',
              borderRadius: 6,
              background: active ? accentAlpha(0.18) : 'transparent',
              color: active ? ZH.text : ZH.textFaint,
              fontFamily: ZH.mono,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Подпись под числом дня: отклонение съеденного от дневной цели.
 * Зелёный — |delta| ≤ 15% цели; оранжевый — иначе.
 * Факт без оценки: цвет помогает быстро увидеть «где день ушёл в разнос».
 */
function KcalBadge({
  delta,
  goalKcal,
  highContrast,
  highlightDeviation,
  deviationColor,
}: {
  delta: number
  goalKcal: number
  highContrast: boolean
  highlightDeviation: boolean
  deviationColor: string
}) {
  const tolerance = Math.max(200, goalKcal * 0.15)
  const inNorm = Math.abs(delta) <= tolerance
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'
  const mag = Math.abs(delta)
  const label = mag >= 1000 ? `${sign}${(mag / 1000).toFixed(1)}k` : `${sign}${mag}`
  const color = highlightDeviation ? (inNorm ? '#5EC2B8' : deviationColor) : ZH.textFaint
  return (
    <span
      style={{
        position: 'absolute',
        bottom: 3,
        left: 0,
        right: 0,
        textAlign: 'center',
        fontFamily: ZH.mono,
        fontSize: 8,
        fontWeight: 500,
        letterSpacing: '0.01em',
        color,
        textShadow: highContrast ? '0 1px 0 rgba(0,0,0,0.4)' : 'none',
        zIndex: 2,
      }}
    >
      {label}
    </span>
  )
}

const navBtn = {
  all: 'unset',
  width: 32,
  height: 32,
  borderRadius: 7,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: `1px solid ${ZH.line}`,
  color: ZH.textDim,
  fontFamily: ZH.mono,
  fontSize: 16,
  cursor: 'pointer',
} as const
