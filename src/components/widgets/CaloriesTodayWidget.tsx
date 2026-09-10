import { useEffect, useMemo, useState } from 'react'
import { Panel, SysLabel } from '../../design/primitives'
import { ZH } from '../../design/tokens'
import { dayKey } from '../../lib/dates'
import {
  computeDayKcal,
  entryTotal,
  goalToGrams,
  resolveEntry,
  roundG,
  roundKcal,
  sumTotals,
} from '../../lib/nutrition'
import { useCaloriesStore } from '../../store/calories'
import { useThemeStore } from '../../store/theme'
import type { DayKey } from '../../types/note'
import { KcalRing, MacroBar, WeekSparkline } from '../CaloriesSection'

export function CaloriesTodayWidget() {
  const today = useMemo(() => dayKey(new Date()), [])
  const [selectedDay, setSelectedDay] = useState<DayKey>(today)

  const last7 = useMemo(() => {
    const base = new Date()
    const out: DayKey[] = []
    for (let i = 6; i >= 0; i--) {
      const x = new Date(base)
      x.setDate(x.getDate() - i)
      out.push(dayKey(x))
    }
    return out
  }, [])

  const loadRange = useCaloriesStore((s) => s.loadRange)
  const entriesByDay = useCaloriesStore((s) => s.entriesByDay)
  const foods = useCaloriesStore((s) => s.foods)
  const goal = useCaloriesStore((s) => s.goal)
  const calorieDeviationEnabled = useThemeStore((s) => s.calorieDeviationEnabled)
  const calorieDeviationColor = useThemeStore((s) => s.calorieDeviationColor)

  useEffect(() => {
    void loadRange(last7)
  }, [last7, loadRange])

  const entries = entriesByDay[selectedDay]
  const totals = useMemo(() => {
    if (!entries || entries.length === 0) {
      return { kcal: 0, carbs: 0, fat: 0, protein: 0, fiber: 0, alcohol: 0 }
    }
    return sumTotals(entries.map((e) => entryTotal(resolveEntry(e, foods))))
  }, [entries, foods])

  const weekKcal = useMemo(
    () => last7.map((d) => ({ day: d, kcal: computeDayKcal(entriesByDay[d], foods) })),
    [last7, entriesByDay, foods],
  )

  const grams = goalToGrams(goal)
  const hasGoal = goal.kcal > 0
  const pct = hasGoal ? Math.min(100, (totals.kcal / goal.kcal) * 100) : 0
  const overshoot = totals.kcal > goal.kcal
  const remaining = goal.kcal - totals.kcal

  const isToday = selectedDay === today
  const selectedDateStr = useMemo(() => {
    const [y, m, d] = selectedDay.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
  }, [selectedDay])

  return (
    <Panel style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SysLabel>калории · {isToday ? 'сегодня' : selectedDateStr}</SysLabel>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
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
          {hasGoal
            ? remaining >= 0
              ? `Осталось ${roundKcal(remaining)} ккал`
              : `Перебор ${roundKcal(-remaining)} ккал`
            : 'Цель не установлена'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
            paddingTop: 10,
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

      {hasGoal && (
        <WeekSparkline
          data={weekKcal}
          currentDay={selectedDay}
          goalKcal={goal.kcal}
          highlightDeviation={calorieDeviationEnabled}
          deviationColor={calorieDeviationColor}
          onSelect={setSelectedDay}
        />
      )}
    </Panel>
  )
}
