import { useEffect, useMemo, useState } from 'react'
import { SysLabel } from '../design/primitives'
import { FOOD_HUE, ZH, accentAlpha, mixAlpha } from '../design/tokens'
import { dayKey } from '../lib/dates'
import { hapticImpact, hapticSuccess } from '../lib/haptic'
import {
  entryTotal,
  goalToGrams,
  resolveEntry,
  roundG,
  roundKcal,
  sumTotals,
  trimNum,
} from '../lib/nutrition'
import {
  estimateShortLine,
  isLowConfidenceEstimate,
} from '../lib/nutritionEstimate'
import { useCaloriesStore } from '../store/calories'
import { useThemeStore } from '../store/theme'
import {
  type FoodEntry,
  type NutritionEstimate,
  type ResolvedEntry,
} from '../types/calorie'
import type { DayKey } from '../types/note'

type Props = {
  day: DayKey
  onOpenSettings: () => void
}

export function CaloriesSection({ day, onOpenSettings }: Props) {
  const entriesByDay = useCaloriesStore((s) => s.entriesByDay)
  const entriesRaw = entriesByDay[day]
  const entries = useMemo(() => entriesRaw ?? [], [entriesRaw])
  const isLoaded = entriesRaw !== undefined
  const foods = useCaloriesStore((s) => s.foods)
  const goal = useCaloriesStore((s) => s.goal)
  const calorieDeviationEnabled = useThemeStore((s) => s.calorieDeviationEnabled)
  const calorieDeviationColor = useThemeStore((s) => s.calorieDeviationColor)
  const loadDay = useCaloriesStore((s) => s.loadDay)
  const deleteEntryWithUndo = useCaloriesStore((s) => s.deleteEntryWithUndo)
  const copyDay = useCaloriesStore((s) => s.copyDay)
  const showToast = useCaloriesStore((s) => s.showToast)

  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null)

  const yesterday = useMemo(() => {
    const [y, m, d] = day.split('-').map(Number)
    const date = new Date(y, m - 1, d)
    date.setDate(date.getDate() - 1)
    return dayKey(date)
  }, [day])

  useEffect(() => {
    void loadDay(day)
    void loadDay(yesterday)
  }, [day, yesterday, loadDay])

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => a.createdAt - b.createdAt),
    [entries],
  )

  const resolved = useMemo(
    () => sortedEntries.map((e) => resolveEntry(e, foods)),
    [sortedEntries, foods],
  )
  const totals = useMemo(() => sumTotals(resolved.map(entryTotal)), [resolved])

  const grams = goalToGrams(goal)
  const remaining = goal.kcal - totals.kcal
  const pct = goal.kcal > 0 ? Math.min(100, (totals.kcal / goal.kcal) * 100) : 0
  const overshoot = totals.kcal > goal.kcal

  const yesterdayEntriesRaw = useCaloriesStore((s) => s.entriesByDay[yesterday])
  const yesterdayHasDay = (yesterdayEntriesRaw?.length ?? 0) > 0

  const handleCopyDay = async () => {
    const yEntries = useCaloriesStore.getState().entriesByDay[yesterday] ?? []
    if (yEntries.length === 0) {
      showToast('Во вчерашнем дне нет записей')
      return
    }
    await copyDay(yesterday, day)
    hapticSuccess()
    showToast('Скопировано с вчера')
  }

  const handleCopyFrom = async (fromDay: DayKey) => {
    if (fromDay === day) return
    await loadDay(fromDay)
    const entries = useCaloriesStore.getState().entriesByDay[fromDay] ?? []
    if (entries.length === 0) {
      showToast('В этом дне нет записей')
      return
    }
    await copyDay(fromDay, day)
    hapticSuccess()
    showToast('Скопировано')
  }

  const handleDelete = async (entry: FoodEntry) => {
    hapticImpact('medium')
    setExpandedEntryId(null)
    await deleteEntryWithUndo(day, entry.id)
  }

  const vitHue = FOOD_HUE

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, color: ZH.text }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 1,
              background: vitHue,
              boxShadow: `0 0 8px ${vitHue}`,
            }}
          />
          <SysLabel color={ZH.textDim}>Калории</SysLabel>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Цель"
          style={{
            all: 'unset',
            cursor: 'pointer',
            height: 30,
            width: 30,
            borderRadius: 999,
            border: `1px solid ${ZH.line}`,
            color: ZH.textDim,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01c.24.59.8.99 1.44 1H21a2 2 0 1 1 0 4h-.09c-.64.01-1.2.41-1.44 1z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {goal.updatedAt === 0 && (
        <button
          type="button"
          onClick={onOpenSettings}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '12px 14px',
            borderRadius: 12,
            background: accentAlpha(0.1),
            border: `1px solid ${accentAlpha(0.3)}`,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            boxShadow: `0 0 16px ${accentAlpha(0.15)}`,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: ZH.text }}>
              Установи цель по калориям
            </span>
            <span style={{ fontSize: 11, color: ZH.textDim }}>
              30 секунд · можно автоматически
            </span>
          </div>
          <span
            style={{
              flexShrink: 0,
              padding: '8px 14px',
              borderRadius: 10,
              background: `linear-gradient(180deg, ${accentAlpha(0.8)}, ${accentAlpha(0.53)})`,
              border: `1px solid ${ZH.accent}`,
              fontFamily: ZH.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: '#06131F',
            }}
          >
            Настроить
          </span>
        </button>
      )}

      <div
        style={{
          background: ZH.panel,
          border: `1px solid ${ZH.line}`,
          borderRadius: 14,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <KcalRing
          kcal={totals.kcal}
          goal={goal.kcal}
          overshoot={overshoot}
          pct={pct}
          highlightDeviation={calorieDeviationEnabled}
          deviationColor={calorieDeviationColor}
        />
        <div
          style={{
            fontFamily: ZH.mono,
            fontSize: 11,
            color: ZH.textDim,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {goal.kcal > 0
            ? remaining >= 0
              ? `Осталось ${roundKcal(remaining)} ккал`
              : `Перебор ${roundKcal(-remaining)} ккал`
            : 'Цель не установлена'}
        </div>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <MacroBar
            label="Углеводы"
            used={totals.carbs}
            goal={grams.carbsG}
            highlightDeviation={calorieDeviationEnabled}
            deviationColor={calorieDeviationColor}
          />
          <MacroBar
            label="Жиры"
            used={totals.fat}
            goal={grams.fatG}
            highlightDeviation={calorieDeviationEnabled}
            deviationColor={calorieDeviationColor}
          />
          <MacroBar
            label="Белки"
            used={totals.protein}
            goal={grams.proteinG}
            highlightDeviation={calorieDeviationEnabled}
            deviationColor={calorieDeviationColor}
          />
        </div>
        {(totals.fiber > 0 || totals.alcohol > 0) && (
          <div
            style={{
              width: '100%',
              paddingTop: 10,
              marginTop: 4,
              borderTop: `1px solid ${ZH.line}`,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px 14px',
              fontSize: 11,
              color: ZH.textDim,
              fontFamily: ZH.mono,
            }}
          >
            {totals.fiber > 0 && (
              <span>
                Клетчатка {roundG(totals.fiber)} г · чистые У{' '}
                {roundG(Math.max(0, totals.carbs - totals.fiber))} г
              </span>
            )}
            {totals.alcohol > 0 && (
              <span>
                Алкоголь {roundG(totals.alcohol)} г · {roundKcal(totals.alcohol * 7)} ккал
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {yesterdayHasDay && (
          <button
            type="button"
            onClick={() => void handleCopyDay()}
            style={{ ...copyBtnStyle, flex: 1 }}
          >
            <span style={copyBtnLabelStyle}>Повторить вчера</span>
          </button>
        )}
        <label
          style={{
            ...copyBtnStyle,
            flex: 1,
            position: 'relative',
            cursor: 'pointer',
          }}
        >
          <span style={copyBtnLabelStyle}>Из другого дня</span>
          <input
            type="date"
            max={day}
            onChange={(e) => {
              const v = e.target.value
              if (v) void handleCopyFrom(v)
              e.target.value = ''
            }}
            style={{
              position: 'absolute',
              inset: 0,
              opacity: 0,
              cursor: 'pointer',
            }}
          />
        </label>
      </div>

      {!isLoaded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-hidden>
          <div
            className="animate-skeleton"
            style={{ height: 44, borderRadius: 10, background: 'rgba(148,178,224,0.05)' }}
          />
          <div
            className="animate-skeleton"
            style={{
              height: 44,
              borderRadius: 10,
              background: 'rgba(148,178,224,0.05)',
              animationDelay: '120ms',
            }}
          />
          <div
            className="animate-skeleton"
            style={{
              height: 44,
              borderRadius: 10,
              background: 'rgba(148,178,224,0.05)',
              animationDelay: '240ms',
            }}
          />
        </div>
      ) : sortedEntries.length === 0 ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resolved.map((r) => (
            <EntryRow
              key={r.entry.id}
              resolved={r}
              expanded={expandedEntryId === r.entry.id}
              onToggle={() =>
                setExpandedEntryId((cur) => (cur === r.entry.id ? null : r.entry.id))
              }
              onDelete={() => handleDelete(r.entry)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const copyBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '7px 12px',
  borderRadius: 10,
  border: `1px solid ${ZH.line}`,
  background: 'rgba(18,23,36,0.45)',
  cursor: 'pointer',
}

const copyBtnLabelStyle: React.CSSProperties = {
  fontFamily: ZH.mono,
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: ZH.textDim,
}

const RU_WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

export function WeekSparkline({
  data,
  currentDay,
  goalKcal,
  highlightDeviation = true,
  deviationColor = ZH.warn,
  onSelect,
}: {
  data: { day: DayKey; kcal: number }[]
  currentDay: DayKey
  goalKcal: number
  highlightDeviation?: boolean
  deviationColor?: string
  onSelect?: (day: DayKey) => void
}) {
  return (
    <div
      style={{
        background: ZH.panel,
        border: `1px solid ${ZH.line}`,
        borderRadius: 12,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <SysLabel color={ZH.textDim}>7 дней</SysLabel>
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 10,
            color: ZH.textFaint,
            letterSpacing: '0.08em',
          }}
        >
          цель {goalKcal} ккал
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {data.map(({ day: d, kcal }) => {
          const ratio = goalKcal > 0 ? kcal / goalKcal : 0
          const over = ratio > 1
          const heightPct = Math.min(100, ratio * 100)
          const isToday = d === currentDay
          const [y, m, day] = d.split('-').map(Number)
          const date = new Date(y, m - 1, day)
          const weekday = RU_WEEKDAY_SHORT[date.getDay()]
          const fill = over && highlightDeviation ? deviationColor : ZH.accent
          return (
            <button
              type="button"
              key={d}
              onClick={onSelect ? () => onSelect(d) : undefined}
              aria-label={`Открыть ${d}`}
              aria-current={isToday ? 'date' : undefined}
              title={`${d}: ${Math.round(kcal)} ккал`}
              style={{
                all: 'unset',
                cursor: onSelect ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 48,
                  borderRadius: 6,
                  background: 'rgba(148,178,224,0.05)',
                  overflow: 'hidden',
                  border: isToday ? `1px solid ${accentAlpha(0.45)}` : `1px solid ${ZH.line}`,
                  boxShadow: isToday ? `0 0 10px ${accentAlpha(0.25)}` : 'none',
                }}
              >
                {kcal > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: `${Math.max(12, heightPct)}%`,
                      background: `linear-gradient(180deg, ${mixAlpha(fill, 53)}, ${fill})`,
                      boxShadow: `0 0 8px ${mixAlpha(fill, 60)}`,
                      transition: 'height 700ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  fontFamily: ZH.mono,
                  fontSize: 9,
                  letterSpacing: '0.08em',
                  color: isToday ? ZH.text : ZH.textFaint,
                  fontWeight: isToday ? 500 : 400,
                }}
              >
                {weekday} {date.getDate()}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function KcalRing({
  kcal,
  goal,
  overshoot,
  pct,
  highlightDeviation = true,
  deviationColor = ZH.warn,
}: {
  kcal: number
  goal: number
  overshoot: boolean
  pct: number
  highlightDeviation?: boolean
  deviationColor?: string
}) {
  const R = 45
  const C = 2 * Math.PI * R
  const dash = goal > 0 ? C * Math.min(1, pct / 100) : 0
  const fill = overshoot && highlightDeviation ? deviationColor : ZH.accent
  return (
    <div style={{ position: 'relative', height: 144, width: 144 }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
        <defs>
          <filter id="kcal-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth="5"
          stroke="rgba(148,178,224,0.1)"
        />
        {goal > 0 && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            stroke={fill}
            filter="url(#kcal-glow)"
            style={{
              strokeDasharray: `${dash} ${C}`,
              transition:
                'stroke-dasharray 450ms cubic-bezier(0.2, 0.8, 0.2, 1), stroke 300ms ease-out',
            }}
          />
        )}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontFamily: ZH.mono,
            fontSize: 30,
            fontWeight: 500,
            color: ZH.text,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {roundKcal(kcal)}
        </div>
        <div
          style={{
            fontFamily: ZH.mono,
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: ZH.textFaint,
            marginTop: 6,
          }}
        >
          {goal > 0 ? `/ ${goal}` : 'ккал'}
        </div>
      </div>
    </div>
  )
}

export function MacroBar({
  label,
  used,
  goal,
  highlightDeviation = true,
  deviationColor = ZH.warn,
}: {
  label: string
  used: number
  goal: number
  highlightDeviation?: boolean
  deviationColor?: string
}) {
  const pct = goal > 0 ? Math.min(100, (used / goal) * 100) : 0
  const over = goal > 0 && used > goal
  const fill = over && highlightDeviation ? deviationColor : ZH.accent
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span
        style={{
          flexShrink: 0,
          width: 72,
          fontSize: 11,
          color: ZH.text,
          fontFamily: ZH.mono,
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 3,
          borderRadius: 999,
          background: 'rgba(148,178,224,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${mixAlpha(fill, 53)}, ${fill})`,
            boxShadow: `0 0 8px ${mixAlpha(fill, 60)}`,
            transition:
              'width 450ms cubic-bezier(0.2, 0.8, 0.2, 1), background-color 300ms ease-out',
          }}
        />
      </div>
      <span
        style={{
          flexShrink: 0,
          width: 72,
          fontSize: 11,
          fontFamily: ZH.mono,
          textAlign: 'right',
          color: over && highlightDeviation ? deviationColor : ZH.textDim,
        }}
      >
        {roundG(used)}/{goal > 0 ? goal : '–'} г
      </span>
    </div>
  )
}

function EntryRow({
  resolved,
  expanded,
  onToggle,
  onDelete,
}: {
  resolved: ResolvedEntry
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}) {
  const { name, servingLabel, kcal, entry, missing } = resolved
  const qLabel = entry.quantity !== 1 ? `${trimNum(entry.quantity)}× ` : ''
  const time = formatTime(entry.createdAt)
  const estimate = resolved.estimate
  const lowEstimate = isLowConfidenceEstimate(estimate)

  return (
    <div
      style={{
        background: 'rgba(18,23,36,0.45)',
        border: `1px solid ${ZH.line}`,
        borderRadius: 10,
        overflow: 'hidden',
        opacity: missing ? 0.6 : 1,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          all: 'unset',
          cursor: 'pointer',
          width: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          padding: '9px 12px',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            flexShrink: 0,
            fontFamily: ZH.mono,
            fontSize: 10,
            color: ZH.textFaint,
            letterSpacing: '0.06em',
          }}
        >
          {time}
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 13,
            color: ZH.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
          {servingLabel && (
            <span style={{ color: ZH.textDim }}>
              {' · '}
              {qLabel}
              {servingLabel}
            </span>
          )}
        </span>
        <span
          style={{
            flexShrink: 0,
            fontFamily: ZH.mono,
            fontSize: 12,
            color: lowEstimate ? ZH.warn : ZH.textDim,
          }}
        >
          {lowEstimate ? '≈' : ''}
          {roundKcal(kcal)}
        </span>
      </button>

      {expanded && (
        <div
          className="animate-fade-in"
          style={{
            padding: '0 8px 8px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 10,
          }}
        >
          {estimate ? (
            <EstimateDetails estimate={estimate} />
          ) : (
            <span style={{ flex: 1 }} />
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label="Удалить"
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '10px 14px',
              borderRadius: 8,
              border: `1px solid ${ZH.warn}50`,
              background: `${ZH.warn}15`,
              color: ZH.warn,
              fontFamily: ZH.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Удалить
          </button>
        </div>
      )}
    </div>
  )
}

function EstimateDetails({ estimate }: { estimate: NutritionEstimate }) {
  const reason = estimate.confidenceReason?.trim()
  return (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          color: estimate.source === 'ai' && estimate.confidence !== undefined && estimate.confidence < 0.8
            ? ZH.warn
            : ZH.textFaint,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {estimateShortLine(estimate)}
      </span>
      {reason && (
        <span
          style={{
            fontSize: 11,
            color: ZH.textDim,
            lineHeight: 1.35,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {reason}
        </span>
      )}
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}
