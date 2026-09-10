import { useState } from 'react'
import { Brackets } from '../design/primitives'
import { FOOD_HUE, ZH, accentAlpha } from '../design/tokens'
import { roundG, roundKcal } from '../lib/nutrition'
import { estimateDisclosure } from '../lib/nutritionEstimate'
import { useCaloriesStore } from '../store/calories'
import type { DayKey } from '../types/note'
import type { Food, Serving } from '../types/calorie'
import { BottomSheet } from './BottomSheet'

export function ScanResultSheet() {
  const scanResult = useCaloriesStore((s) => s.scanResult)
  const closeScanResult = useCaloriesStore((s) => s.closeScanResult)

  if (!scanResult) {
    return <BottomSheet open={false} onClose={closeScanResult}>{null}</BottomSheet>
  }

  const { food, day } = scanResult
  const serving = food.servings[0]
  if (!serving) {
    return <BottomSheet open={false} onClose={closeScanResult}>{null}</BottomSheet>
  }

  return (
    <BottomSheet open onClose={closeScanResult} hideClose ariaLabel="найденный продукт">
      <Content key={food.id} food={food} day={day} serving={serving} onClose={closeScanResult} />
    </BottomSheet>
  )
}

function Content({
  food,
  day,
  serving,
  onClose,
}: {
  food: Food
  day: DayKey
  serving: Serving
  onClose: () => void
}) {
  const addEntry = useCaloriesStore((s) => s.addEntry)
  const showToast = useCaloriesStore((s) => s.showToast)
  const openFoodEditor = useCaloriesStore((s) => s.openFoodEditor)

  // Если serving.grams не задан (например, «1 порц.» без веса), поле ввода
  // превращается в множитель порций: base = 1, дефолт «1».
  const hasGrams = typeof serving.grams === 'number' && serving.grams > 0
  const baseGrams = hasGrams ? (serving.grams as number) : 1
  const defaultInput = hasGrams ? String(Math.round(baseGrams)) : '1'

  // Стартуем с пустой строкой — значения в input нет, а дефолт показан
  // placeholder'ом. Пустой ввод трактуем как «взять дефолт» (тот же паттерн,
  // что и в QuickField у подсчёта калорий — не автовыделяем текст и не мешаем
  // пользователю тапать в произвольное место).
  const [weight, setWeight] = useState('')

  const trimmed = weight.trim()
  const parsed = trimmed === '' ? baseGrams : parseFloat(trimmed.replace(',', '.'))
  const factor = Number.isFinite(parsed) && parsed > 0 ? parsed / baseGrams : 0
  const canAdd = factor > 0

  const kcalNow = serving.kcal * factor
  const carbsNow = serving.carbs * factor
  const fatNow = serving.fat * factor
  const proteinNow = serving.protein * factor

  const handleAdd = async () => {
    if (!canAdd) return
    await addEntry(day, { kind: 'food', foodId: food.id, servingId: serving.id, quantity: factor })
    onClose()
    showToast(`Добавлено: ${food.name}`)
  }

  const handleEdit = () => {
    onClose()
    openFoodEditor(food.id)
  }

  const vitHue = FOOD_HUE

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 1,
              background: vitHue,
              boxShadow: `0 0 8px ${vitHue}`,
            }}
          />
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: ZH.text,
            }}
          >
            Найдено по коду
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'relative',
          padding: '14px 16px',
          borderRadius: 14,
          background: ZH.panel,
          border: `1px solid ${ZH.lineHi}`,
          boxShadow: `0 0 0 1px ${vitHue}25, 0 0 24px ${vitHue}20`,
        }}
      >
        <Brackets color={vitHue} size={8} inset={5} />
        <div style={{ fontSize: 16, fontWeight: 600, color: ZH.text, letterSpacing: '-0.01em' }}>
          {food.name}
        </div>
        {food.brand && (
          <div style={{ marginTop: 3, fontSize: 12, color: ZH.textDim }}>{food.brand}</div>
        )}
        {food.estimate && (
          <div
            style={{
              marginTop: 8,
              fontFamily: ZH.mono,
              fontSize: 10,
              color: ZH.textFaint,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              lineHeight: 1.35,
            }}
          >
            {estimateDisclosure(food.estimate)}
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 32,
              fontWeight: 500,
              color: ZH.text,
              lineHeight: 1,
            }}
          >
            {roundKcal(kcalNow)}
          </span>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: ZH.textDim,
            }}
          >
            ккал
          </span>
        </div>

        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: `1px solid ${ZH.line}`,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
          }}
        >
          <MacroCell label="Углеводы" value={roundG(carbsNow)} />
          <MacroCell label="Жиры" value={roundG(fatNow)} />
          <MacroCell label="Белки" value={roundG(proteinNow)} />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: '8px 10px',
          border: `1px solid ${ZH.line}`,
          borderRadius: 10,
          background: 'rgba(18,23,36,0.45)',
        }}
      >
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 9,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: ZH.textFaint,
          }}
        >
          {hasGrams ? 'Вес, г' : 'Порций'}
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder={defaultInput}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            padding: 0,
            color: ZH.text,
            fontSize: 14,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => void handleAdd()}
        disabled={!canAdd}
        style={{
          all: 'unset',
          textAlign: 'center',
          padding: '14px 0',
          borderRadius: 12,
          background: canAdd
            ? `linear-gradient(180deg, ${accentAlpha(0.8)}, ${accentAlpha(0.53)})`
            : 'rgba(18,23,36,0.45)',
          border: `1px solid ${canAdd ? ZH.accent : ZH.line}`,
          boxShadow: canAdd
            ? `0 0 24px ${accentAlpha(0.4)}, 0 0 0 1px ${accentAlpha(0.13)} inset`
            : 'none',
          cursor: canAdd ? 'pointer' : 'not-allowed',
          opacity: canAdd ? 1 : 0.55,
        }}
      >
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: canAdd ? '#06131F' : ZH.textDim,
          }}
        >
          Добавить
        </span>
      </button>

      <button
        type="button"
        onClick={handleEdit}
        style={{
          all: 'unset',
          alignSelf: 'center',
          padding: '4px 8px',
          cursor: 'pointer',
          fontFamily: ZH.mono,
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: ZH.textDim,
        }}
      >
        Изменить продукт
      </button>
    </div>
  )
}

function MacroCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div
        style={{
          fontFamily: ZH.mono,
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ZH.textFaint,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: ZH.mono,
          fontSize: 15,
          color: ZH.text,
          marginTop: 2,
        }}
      >
        {value}
        <span style={{ fontSize: 10, color: ZH.textFaint, marginLeft: 3 }}>г</span>
      </div>
    </div>
  )
}
