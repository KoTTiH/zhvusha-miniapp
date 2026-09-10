import { useEffect, useMemo, useState } from 'react'
import { Brackets, SysLabel } from '../design/primitives'
import { FOOD_HUE, ZH, accentAlpha } from '../design/tokens'
import { roundG, roundKcal, trimNum } from '../lib/nutrition'
import { foodSourceLine } from '../lib/nutritionEstimate'
import { isInsideTelegram, subscribeBackButton } from '../lib/tma'
import { createEmptyMeal, useCaloriesStore } from '../store/calories'
import type { Food, Meal, MealItem } from '../types/calorie'
import { BottomSheet } from './BottomSheet'

export function MealEditorScreen() {
  const id = useCaloriesStore((s) => s.editorMealId)
  const close = useCaloriesStore((s) => s.closeMealEditor)
  const meals = useCaloriesStore((s) => s.meals)
  const foods = useCaloriesStore((s) => s.foods)
  const upsertMeal = useCaloriesStore((s) => s.upsertMeal)
  const deleteMeal = useCaloriesStore((s) => s.deleteMeal)
  const toggleFav = useCaloriesStore((s) => s.toggleMealFavourite)
  const showToast = useCaloriesStore((s) => s.showToast)
  const insideTg = isInsideTelegram()

  const isNew = id === '__new__'
  const existing = !isNew && id ? meals[id] : undefined

  const [draft, setDraft] = useState<Meal>(() =>
    existing ? cloneMeal(existing) : createEmptyMeal(),
  )
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickedFood, setPickedFood] = useState<Food | null>(null)
  const [pickedServingId, setPickedServingId] = useState<string | null>(null)
  const [pickedQty, setPickedQty] = useState('1')

  useEffect(() => subscribeBackButton(close), [close])

  const totals = useMemo(() => {
    return draft.items.reduce(
      (acc, it) => {
        const f = foods[it.foodId]
        const s = f?.servings.find((sv) => sv.id === it.servingId)
        if (!f || !s) return acc
        return {
          kcal: acc.kcal + s.kcal * it.quantity,
          carbs: acc.carbs + s.carbs * it.quantity,
          fat: acc.fat + s.fat * it.quantity,
          protein: acc.protein + s.protein * it.quantity,
          fiber: acc.fiber + (s.fiber ?? 0) * it.quantity,
          alcohol: acc.alcohol + (s.alcohol ?? 0) * it.quantity,
        }
      },
      { kcal: 0, carbs: 0, fat: 0, protein: 0, fiber: 0, alcohol: 0 },
    )
  }, [draft.items, foods])

  const canSave = draft.name.trim().length > 0 && draft.items.length > 0

  const handleSave = async () => {
    if (!canSave) return
    await upsertMeal({ ...draft, name: draft.name.trim(), updatedAt: Date.now() })
    close()
  }

  const updateItemQty = (idx: number, qty: number) => {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, i) => (i === idx ? { ...it, quantity: qty } : it)),
    }))
  }

  const removeItem = (idx: number) => {
    setDraft((d) => ({ ...d, items: d.items.filter((_, i) => i !== idx) }))
  }

  const handleToggleFav = async () => {
    setDraft((d) => ({ ...d, favourite: !d.favourite }))
    if (!isNew && id) await toggleFav(id)
  }

  const handleDelete = async () => {
    if (isNew || !id) return
    await deleteMeal(id)
    showToast('Блюдо удалено')
    close()
  }

  const openPicker = () => {
    setPickedFood(null)
    setPickedServingId(null)
    setPickedQty('1')
    setPickerOpen(true)
  }

  const activeFoods = useMemo(
    () =>
      Object.values(foods)
        .filter((f) => !f.archived)
        .sort((a, b) => {
          if (a.favourite !== b.favourite) return a.favourite ? -1 : 1
          return a.name.localeCompare(b.name, 'ru')
        }),
    [foods],
  )

  const confirmPick = () => {
    if (!pickedFood || !pickedServingId) return
    const qty = Number(pickedQty.replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) return
    setDraft((d) => ({
      ...d,
      items: [...d.items, { foodId: pickedFood.id, servingId: pickedServingId, quantity: qty }],
    }))
    setPickerOpen(false)
  }

  const vitHue = FOOD_HUE

  return (
    <main
      className="animate-fade-in"
      style={{
        minHeight: '100dvh',
        background: ZH.bg,
        color: ZH.text,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        padding: '16px 14px 28px',
        maxWidth: 560,
        margin: '0 auto',
        overflowX: 'hidden',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px' }}>
        {!insideTg && (
          <button type="button" onClick={close} aria-label="Назад" style={backBtnStyle}>
            ←
          </button>
        )}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 1,
              background: vitHue,
              boxShadow: `0 0 8px ${vitHue}`,
            }}
          />
          <SysLabel color={ZH.text}>
            {isNew ? 'новое блюдо' : 'редактирование'}
          </SysLabel>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!canSave}
          style={saveBtnStyle(canSave)}
        >
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: canSave ? '#06131F' : ZH.textDim,
            }}
          >
            Сохранить
          </span>
        </button>
      </header>

      <section style={panelStyle}>
        <Brackets color={ZH.lineHi} size={7} inset={4} />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={miniLabelStyle}>Название *</span>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="Например, Утро рабочего дня"
            style={inputStyle}
          />
        </label>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: 4,
            paddingRight: 4,
          }}
        >
          <SysLabel>Состав</SysLabel>
          <button
            type="button"
            onClick={openPicker}
            disabled={activeFoods.length === 0}
            style={{
              all: 'unset',
              cursor: activeFoods.length === 0 ? 'not-allowed' : 'pointer',
              fontFamily: ZH.mono,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: activeFoods.length === 0 ? ZH.textFaint : ZH.accent,
              opacity: activeFoods.length === 0 ? 0.5 : 1,
            }}
          >
            + продукт
          </button>
        </div>
        <div
          style={{
            background: 'rgba(18,23,36,0.45)',
            border: `1px solid ${ZH.line}`,
            borderRadius: 12,
            overflow: 'hidden',
          }}
        >
          {draft.items.length === 0 ? (
            <div
              style={{
                padding: '20px 0',
                textAlign: 'center',
                fontSize: 12,
                color: ZH.textDim,
                fontFamily: ZH.mono,
              }}
            >
              {activeFoods.length === 0 ? 'пока нет продуктов' : 'продукты не выбраны'}
            </div>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', margin: 0, padding: 0, listStyle: 'none' }}>
              {draft.items.map((it, idx) => (
                <ItemRow
                  key={`${it.foodId}_${idx}`}
                  item={it}
                  foods={foods}
                  onQtyChange={(q) => updateItemQty(idx, q)}
                  onRemove={() => removeItem(idx)}
                  isLast={idx === draft.items.length - 1}
                />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section
        style={{
          ...panelStyle,
          gap: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <SysLabel>Итого</SysLabel>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 20,
              fontWeight: 500,
              color: ZH.text,
              letterSpacing: '-0.01em',
            }}
          >
            {roundKcal(totals.kcal)}
            <span style={{ fontSize: 11, color: ZH.textDim, marginLeft: 4 }}>ккал</span>
          </span>
        </div>
        <div style={{ fontFamily: ZH.mono, fontSize: 11, color: ZH.textDim, letterSpacing: '0.04em' }}>
          У {roundG(totals.carbs)} · Ж {roundG(totals.fat)} · Б {roundG(totals.protein)} г
        </div>
        {(totals.fiber > 0 || totals.alcohol > 0) && (
          <div style={{ fontSize: 10, color: ZH.textFaint, fontFamily: ZH.mono }}>
            {totals.fiber > 0 && <>Клетчатка {roundG(totals.fiber)} г</>}
            {totals.fiber > 0 && totals.alcohol > 0 && ' · '}
            {totals.alcohol > 0 && <>Алкоголь {roundG(totals.alcohol)} г</>}
          </div>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button type="button" onClick={() => void handleToggleFav()} style={ghostBtnStyle}>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 12,
              color: ZH.text,
            }}
          >
            {draft.favourite ? '★' : '☆'} {draft.favourite ? 'В избранном' : 'Добавить в избранное'}
          </span>
        </button>
        {!isNew && (
          <button type="button" onClick={() => void handleDelete()} style={destructiveGhostBtnStyle}>
            <span style={{ fontFamily: ZH.mono, fontSize: 12, color: ZH.warn }}>
              Удалить блюдо
            </span>
          </button>
        )}
      </section>

      <BottomSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={pickedFood ? pickedFood.name : 'Выбрать продукт'}
      >
        {!pickedFood ? (
          <ul
            style={{
              display: 'flex',
              flexDirection: 'column',
              padding: 0,
              margin: 0,
              listStyle: 'none',
              paddingBottom: 8,
            }}
          >
            {activeFoods.map((f) => {
              const source = foodSourceLine(f)
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPickedFood(f)
                      setPickedServingId(f.servings[0]?.id ?? null)
                    }}
                    style={{
                      all: 'unset',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 4px',
                      textAlign: 'left',
                      borderBottom: `1px solid ${ZH.line}`,
                    }}
                  >
                    <span style={{ width: 12, fontSize: 11, color: ZH.textFaint }}>
                      {f.favourite ? '★' : ''}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontSize: 13,
                          color: ZH.text,
                        }}
                      >
                        {f.name}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontFamily: ZH.mono,
                          fontSize: 10,
                          color: ZH.textFaint,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {source}
                      </span>
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontFamily: ZH.mono,
                        fontSize: 11,
                        color: ZH.textDim,
                      }}
                    >
                      {roundKcal(f.servings[0]?.kcal ?? 0)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 8 }}>
            <div>
              <div style={{ paddingLeft: 2, marginBottom: 6 }}>
                <SysLabel>Порция</SysLabel>
              </div>
              <div
                style={{
                  background: 'rgba(18,23,36,0.45)',
                  border: `1px solid ${ZH.line}`,
                  borderRadius: 10,
                  overflow: 'hidden',
                }}
              >
                {pickedFood.servings.map((s, i) => (
                  <label
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      fontSize: 13,
                      cursor: 'pointer',
                      borderBottom:
                        i < pickedFood.servings.length - 1
                          ? `1px solid ${ZH.line}`
                          : 'none',
                    }}
                  >
                    <input
                      type="radio"
                      name="serving"
                      checked={pickedServingId === s.id}
                      onChange={() => setPickedServingId(s.id)}
                      style={{ accentColor: ZH.accent }}
                    />
                    <span style={{ flex: 1, color: ZH.text }}>{s.label}</span>
                    <span
                      style={{
                        fontFamily: ZH.mono,
                        fontSize: 11,
                        color: ZH.textDim,
                      }}
                    >
                      {roundKcal(s.kcal)} ккал
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'rgba(18,23,36,0.45)',
                border: `1px solid ${ZH.line}`,
                borderRadius: 10,
                padding: '8px 12px',
              }}
            >
              <span style={{ fontSize: 13, color: ZH.textDim }}>Количество</span>
              <input
                type="number"
                inputMode="decimal"
                value={pickedQty}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setPickedQty(e.target.value)}
                style={{
                  marginLeft: 'auto',
                  width: 80,
                  height: 34,
                  background: 'rgba(8,9,15,0.55)',
                  border: `1px solid ${ZH.line}`,
                  borderRadius: 8,
                  padding: '0 8px',
                  fontSize: 14,
                  color: ZH.text,
                  fontFamily: ZH.mono,
                  textAlign: 'center',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setPickedFood(null)}
                style={{ ...ghostBtnStyle, flex: 1 }}
              >
                <span style={{ fontFamily: ZH.mono, fontSize: 12, color: ZH.text }}>
                  Назад
                </span>
              </button>
              <button
                type="button"
                onClick={confirmPick}
                style={{
                  all: 'unset',
                  flex: 1,
                  height: 40,
                  borderRadius: 10,
                  cursor: 'pointer',
                  background: `linear-gradient(180deg, ${accentAlpha(0.8)}, ${accentAlpha(0.53)})`,
                  border: `1px solid ${ZH.accent}`,
                  boxShadow: `0 0 16px ${accentAlpha(0.3)}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: ZH.mono,
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: '#06131F',
                  }}
                >
                  Добавить
                </span>
              </button>
            </div>
          </div>
        )}
      </BottomSheet>
    </main>
  )
}

function cloneMeal(m: Meal): Meal {
  return { ...m, items: m.items.map((i) => ({ ...i })) }
}

function ItemRow({
  item,
  foods,
  onQtyChange,
  onRemove,
  isLast,
}: {
  item: MealItem
  foods: Record<string, Food>
  onQtyChange: (q: number) => void
  onRemove: () => void
  isLast: boolean
}) {
  const food = foods[item.foodId]
  const serving = food?.servings.find((s) => s.id === item.servingId)
  const missing = !food || !serving
  const source = food ? foodSourceLine(food) : ''

  return (
    <li
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 12px',
        borderBottom: isLast ? 'none' : `1px solid ${ZH.line}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, opacity: missing ? 0.6 : 1 }}>
        <div
          style={{
            fontSize: 13,
            color: ZH.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {food?.name ?? 'Удалённый продукт'}
        </div>
        <div
          style={{
            fontSize: 11,
            color: ZH.textDim,
            fontFamily: ZH.mono,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {trimNum(item.quantity)}× {serving?.label ?? '—'}
          {serving && <span> · {roundKcal(serving.kcal * item.quantity)} ккал</span>}
          {source && <span> · {source}</span>}
        </div>
      </div>
      <QtyStepper value={item.quantity} onChange={onQtyChange} />
      <button
        type="button"
        onClick={onRemove}
        aria-label="Удалить"
        style={{
          all: 'unset',
          cursor: 'pointer',
          height: 32,
          width: 32,
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: ZH.warn,
          border: `1px solid ${ZH.warn}30`,
          background: `${ZH.warn}10`,
          fontSize: 12,
        }}
      >
        ✕
      </button>
    </li>
  )
}

function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: 'rgba(8,9,15,0.55)',
        border: `1px solid ${ZH.line}`,
        borderRadius: 8,
      }}
    >
      <button
        type="button"
        onClick={() => onChange(Math.max(0.5, Math.round((value - 0.5) * 100) / 100))}
        aria-label="Меньше"
        style={stepperBtnStyle}
      >
        −
      </button>
      <span
        style={{
          width: 38,
          textAlign: 'center',
          fontSize: 12,
          fontFamily: ZH.mono,
          color: ZH.text,
        }}
      >
        {trimNum(value)}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.round((value + 0.5) * 100) / 100)}
        aria-label="Больше"
        style={stepperBtnStyle}
      >
        +
      </button>
    </div>
  )
}

const stepperBtnStyle: React.CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  height: 32,
  width: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: ZH.text,
  fontSize: 14,
}

const panelStyle: React.CSSProperties = {
  position: 'relative',
  background: ZH.panel,
  border: `1px solid ${ZH.line}`,
  borderRadius: 14,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
}

const backBtnStyle: React.CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  flexShrink: 0,
  height: 32,
  width: 32,
  borderRadius: 8,
  border: `1px solid ${ZH.line}`,
  background: 'rgba(18,23,36,0.45)',
  color: ZH.text,
  fontSize: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

function saveBtnStyle(canSave: boolean): React.CSSProperties {
  return {
    all: 'unset',
    cursor: canSave ? 'pointer' : 'not-allowed',
    flexShrink: 0,
    padding: '8px 14px',
    borderRadius: 10,
    background: canSave
      ? `linear-gradient(180deg, ${accentAlpha(0.8)}, ${accentAlpha(0.53)})`
      : 'rgba(148,178,224,0.06)',
    border: `1px solid ${canSave ? ZH.accent : ZH.line}`,
    boxShadow: canSave ? `0 0 14px ${accentAlpha(0.3)}` : 'none',
    opacity: canSave ? 1 : 0.6,
  }
}

const ghostBtnStyle: React.CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  height: 40,
  borderRadius: 10,
  background: 'rgba(148,178,224,0.06)',
  border: `1px solid ${ZH.line}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const destructiveGhostBtnStyle: React.CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  height: 40,
  borderRadius: 10,
  background: `${ZH.warn}10`,
  border: `1px solid ${ZH.warn}30`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const miniLabelStyle: React.CSSProperties = {
  fontFamily: ZH.mono,
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: ZH.textDim,
}

const inputStyle: React.CSSProperties = {
  height: 40,
  background: 'rgba(8,9,15,0.55)',
  border: `1px solid ${ZH.line}`,
  borderRadius: 10,
  padding: '0 12px',
  fontSize: 14,
  color: ZH.text,
  outline: 'none',
  boxSizing: 'border-box',
}
