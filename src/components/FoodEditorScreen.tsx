import { useEffect, useMemo, useState } from 'react'
import { Brackets, SysLabel } from '../design/primitives'
import { FOOD_HUE, ZH, accentAlpha } from '../design/tokens'
import { normalizeBarcode } from '../lib/barcode'
import { expectedKcalFromMacros, roundG } from '../lib/nutrition'
import { estimateDisclosure } from '../lib/nutritionEstimate'
import { lookupBarcode } from '../lib/openFoodFacts'
import { isInsideTelegram, subscribeBackButton } from '../lib/tma'
import { createEmptyFood, createEmptyServing, useCaloriesStore } from '../store/calories'
import type { Food, NutritionEstimate, Serving } from '../types/calorie'
import { BarcodeScanner } from './BarcodeScanner'

export function FoodEditorScreen() {
  const id = useCaloriesStore((s) => s.editorFoodId)
  const prefill = useCaloriesStore((s) => s.editorFoodPrefill)
  const close = useCaloriesStore((s) => s.closeFoodEditor)
  const foods = useCaloriesStore((s) => s.foods)
  const upsertFood = useCaloriesStore((s) => s.upsertFood)
  const archiveFood = useCaloriesStore((s) => s.archiveFood)
  const unarchiveFood = useCaloriesStore((s) => s.unarchiveFood)
  const toggleFav = useCaloriesStore((s) => s.toggleFoodFavourite)
  const hardDelete = useCaloriesStore((s) => s.hardDeleteFood)
  const showToast = useCaloriesStore((s) => s.showToast)
  const scanner = useCaloriesStore((s) => s.scanner)
  const openScanner = useCaloriesStore((s) => s.openScanner)
  const closeScanner = useCaloriesStore((s) => s.closeScanner)
  const insideTg = isInsideTelegram()

  const isNew = id === '__new__'
  const existing = !isNew && id ? foods[id] : undefined

  const [draft, setDraft] = useState<Food>(() => {
    if (existing) return cloneFood(existing)
    const base = createEmptyFood()
    if (!prefill) return base
    const merged: Food = {
      ...base,
      ...(prefill.name !== undefined ? { name: prefill.name } : {}),
      ...(prefill.brand !== undefined ? { brand: prefill.brand } : {}),
      ...(prefill.barcode !== undefined ? { barcode: prefill.barcode } : {}),
      ...(prefill.estimate !== undefined
        ? { estimate: { ...prefill.estimate } }
        : prefill.barcode !== undefined
          ? { estimate: manualFoodEstimate(true, base.servings[0]) }
          : {}),
      ...(prefill.servings && prefill.servings.length > 0
        ? { servings: prefill.servings.map((s) => ({ ...s })) }
        : {}),
    }
    return merged
  })

  const editorScannerOpen = scanner?.mode === 'editorFill'

  useEffect(() => {
    if (editorScannerOpen) return
    return subscribeBackButton(close)
  }, [close, editorScannerOpen])

  const serving: Serving = draft.servings[0] ?? createEmptyServing()

  const canSave = useMemo(() => {
    return draft.name.trim().length > 0 && serving.kcal >= 0
  }, [draft.name, serving.kcal])

  const handleSave = async () => {
    if (!canSave) return
    const derivedLabel = serving.grams && serving.grams > 0
      ? `${roundG(serving.grams)} г`
      : 'порция'
    const barcode = draft.barcode?.trim() || undefined
    const estimate = draft.estimate ?? manualFoodEstimate(Boolean(barcode), serving)
    const cleaned: Food = {
      ...draft,
      name: draft.name.trim(),
      barcode,
      servings: [{ ...serving, label: derivedLabel }],
      brand: draft.brand?.trim() || undefined,
      estimate,
      updatedAt: Date.now(),
    }
    await upsertFood(cleaned)
    close()
  }

  const updateServing = (patch: Partial<Serving>) => {
    setDraft((d) => {
      const cur = d.servings[0] ?? createEmptyServing()
      const nextServing = { ...cur, ...patch }
      return {
        ...d,
        servings: [nextServing],
        estimate: d.estimate?.source === 'manual'
          ? d.estimate
          : manualFoodEstimate(Boolean(d.barcode), nextServing, 'ручная правка'),
      }
    })
  }

  const handleToggleFav = async () => {
    setDraft((d) => ({ ...d, favourite: !d.favourite }))
    if (!isNew && id) await toggleFav(id)
  }

  const handleArchive = async () => {
    if (isNew || !id) return
    await archiveFood(id)
    showToast('Продукт архивирован')
    close()
  }

  const handleUnarchive = async () => {
    if (isNew || !id) return
    await unarchiveFood(id)
    setDraft((d) => ({ ...d, archived: false }))
  }

  const handleHardDelete = async () => {
    if (isNew || !id) return
    const ok = await hardDelete(id)
    if (ok) {
      showToast('Продукт удалён · история сохранена как быстрые записи')
      close()
    }
  }

  const expected = expectedKcalFromMacros(serving)
  const mismatch =
    serving.kcal > 0 &&
    Math.abs(expected - serving.kcal) > Math.max(20, serving.kcal * 0.15)

  const handleEditorScanDetected = async (code: string) => {
    const normalized = normalizeBarcode(code)
    if (!/^\d{8,14}$/.test(normalized)) {
      showToast('Код не распознан')
      closeScanner()
      return
    }
    setDraft((d) => ({
      ...d,
      barcode: normalized,
      estimate: d.estimate?.source === 'barcode'
        ? d.estimate
        : manualFoodEstimate(true, d.servings[0] ?? createEmptyServing()),
    }))
    closeScanner()

    const isEmpty = draft.name.trim() === '' && serving.kcal === 0
    if (!isEmpty) return

    const off = await lookupBarcode(normalized).catch(() => null)
    if (!off) {
      showToast('Код сохранён. Данных в базе не найдено — заполните вручную.')
      return
    }
    const confirmed = await tgConfirm(`Подтянуть из OpenFoodFacts: «${off.name}»?`)
    if (!confirmed) return
    setDraft((d) => {
      const cur = d.servings[0] ?? createEmptyServing()
      const nextServing: Serving = {
        ...cur,
        grams: 100,
        label: '100 г',
        kcal: off.per100g.kcal,
        carbs: off.per100g.carbs,
        fat: off.per100g.fat,
        protein: off.per100g.protein,
        ...(off.per100g.fiber !== undefined ? { fiber: off.per100g.fiber } : {}),
      }
      return {
        ...d,
        name: off.name,
        brand: off.brand ?? d.brand,
        servings: [nextServing],
        estimate: barcodeEstimate(off.per100g.kcalEstimated),
      }
    })
  }

  const vitHue = FOOD_HUE
  const manualBarcode = Boolean(
    draft.barcode && draft.estimate?.source === 'manual' && draft.estimate.portionBasis === 'label',
  )
  const visibleEstimate = draft.estimate ?? manualFoodEstimate(Boolean(draft.barcode), serving)

  return (
    <>
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
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '4px 2px',
          }}
        >
          {!insideTg && (
            <button
              type="button"
              onClick={close}
              aria-label="Назад"
              style={backBtnStyle}
            >
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
              {isNew ? 'новый продукт' : 'редактирование'}
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
          <TextField
            label="Название *"
            value={draft.name}
            onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
            placeholder="Например: Йогурт натуральный"
          />
          <button
            type="button"
            onClick={() => openScanner('editorFill')}
            style={scanBtnStyle}
          >
            <span
              style={{
                fontFamily: ZH.mono,
                fontSize: 12,
                letterSpacing: '0.04em',
                color: ZH.text,
              }}
            >
              {draft.barcode ? `⌬ ${draft.barcode}` : '⌬ Сканировать штрих-код'}
            </span>
          </button>
          {manualBarcode && (
            <div style={localLabelStyle}>
              <span style={{ color: FOOD_HUE }}>локальная этикетка</span>
              <span style={{ color: ZH.textDim }}>
                Код будет связан с этой карточкой. Второй скан откроет продукт сразу.
              </span>
            </div>
          )}
          <div
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              lineHeight: 1.35,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: ZH.textFaint,
            }}
          >
            {estimateDisclosure(visibleEstimate)}
          </div>
        </section>

        <div style={{ paddingLeft: 4 }}>
          <SysLabel>Пищевая ценность</SysLabel>
        </div>
        <section style={panelStyle}>
          <NumField
            label="Вес, г (опц.)"
            value={serving.grams}
            onChange={(n) => updateServing({ grams: n })}
            placeholder="125"
          />
          <NumField
            label="Калории, ккал"
            value={serving.kcal}
            onChange={(n) => updateServing({ kcal: n ?? 0 })}
            placeholder="110"
          />
          <NumField
            label="Углеводы, г"
            value={serving.carbs}
            onChange={(n) => updateServing({ carbs: n ?? 0 })}
            placeholder="8"
          />
          <NumField
            label="Жиры, г"
            value={serving.fat}
            onChange={(n) => updateServing({ fat: n ?? 0 })}
            placeholder="3"
          />
          <NumField
            label="Белки, г"
            value={serving.protein}
            onChange={(n) => updateServing({ protein: n ?? 0 })}
            placeholder="6"
          />
          <NumField
            label="Клетчатка, г (опц.)"
            value={serving.fiber}
            onChange={(n) => updateServing({ fiber: n })}
            placeholder="если знаешь — вычтется из углеводов"
          />
        </section>

        <div
          style={{
            paddingLeft: 4,
            fontSize: 11,
            color: ZH.textDim,
            fontFamily: ZH.mono,
          }}
        >
          Проверка: {roundG(expected)} ккал из макро
          {mismatch && (
            <span style={{ color: ZH.warn }}>
              {' — '}расходится с «{roundG(serving.kcal)}»
            </span>
          )}
        </div>

        <section
          style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}
        >
          <button
            type="button"
            onClick={() => void handleToggleFav()}
            style={ghostBtnStyle}
          >
            <span
              style={{
                fontFamily: ZH.mono,
                fontSize: 12,
                letterSpacing: '0.04em',
                color: ZH.text,
              }}
            >
              {draft.favourite ? '★' : '☆'} {draft.favourite ? 'В избранном' : 'Добавить в избранное'}
            </span>
          </button>
          {!isNew && (
            <div style={{ display: 'flex', gap: 8 }}>
              {!draft.archived ? (
                <button
                  type="button"
                  onClick={() => void handleArchive()}
                  style={{ ...ghostBtnStyle, flex: 1 }}
                >
                  <span style={{ fontFamily: ZH.mono, fontSize: 12, color: ZH.text }}>
                    Архив
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleUnarchive()}
                  style={{ ...ghostBtnStyle, flex: 1 }}
                >
                  <span style={{ fontFamily: ZH.mono, fontSize: 12, color: ZH.text }}>
                    Из архива
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleHardDelete()}
                style={destructiveBtnStyle}
              >
                <span
                  style={{
                    fontFamily: ZH.mono,
                    fontSize: 12,
                    color: ZH.warn,
                  }}
                >
                  Удалить
                </span>
              </button>
            </div>
          )}
        </section>
      </main>
      {editorScannerOpen && (
        <BarcodeScanner
          onDetected={(code) => void handleEditorScanDetected(code)}
          onClose={closeScanner}
          title="Штрих-код продукта"
        />
      )}
    </>
  )
}

const panelStyle: React.CSSProperties = {
  position: 'relative',
  background: ZH.panel,
  border: `1px solid ${ZH.line}`,
  borderRadius: 14,
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
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

const scanBtnStyle: React.CSSProperties = {
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

const localLabelStyle: React.CSSProperties = {
  borderRadius: 10,
  border: `1px solid ${accentAlpha(0.22)}`,
  background: accentAlpha(0.08),
  padding: '9px 11px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontFamily: ZH.mono,
  fontSize: 11,
  lineHeight: 1.45,
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

const destructiveBtnStyle: React.CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  flex: 1,
  height: 40,
  borderRadius: 10,
  background: `${ZH.warn}15`,
  border: `1px solid ${ZH.warn}40`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

function tgConfirm(msg: string): Promise<boolean> {
  return new Promise((resolve) => {
    const webApp = (window as unknown as {
      Telegram?: { WebApp?: { showConfirm?: (m: string, cb: (ok: boolean) => void) => void } }
    }).Telegram?.WebApp
    if (webApp?.showConfirm) {
      webApp.showConfirm(msg, (ok) => resolve(ok))
    } else {
      resolve(window.confirm(msg))
    }
  })
}

function cloneFood(f: Food): Food {
  return {
    ...f,
    servings: f.servings.map((s) => ({ ...s })),
    ...(f.estimate ? { estimate: { ...f.estimate } } : {}),
  }
}

function barcodeEstimate(kcalEstimated?: boolean): NutritionEstimate {
  return {
    source: 'barcode',
    confidence: kcalEstimated ? 0.88 : 0.95,
    portionBasis: 'label',
    basisLabel: kcalEstimated ? 'ккал рассчитаны по БЖУ' : 'этикетка Open Food Facts',
    dataSource: 'Open Food Facts',
  }
}

function manualFoodEstimate(
  hasBarcode: boolean,
  serving: Serving,
  label = hasBarcode ? 'этикетка вручную' : 'введено вручную',
): NutritionEstimate {
  return {
    source: 'manual',
    portionBasis: hasBarcode
      ? 'label'
      : serving.grams && serving.grams > 0
        ? 'stated_weight'
        : 'unknown',
    basisLabel: label,
    dataSource: hasBarcode ? 'локальная этикетка' : 'ручной ввод',
  }
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ZH.textDim,
        }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
  )
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: number | undefined
  onChange: (n: number | undefined) => void
  placeholder?: string
}) {
  const display = value === undefined || Number.isNaN(value) ? '' : String(value)
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ZH.textDim,
        }}
      >
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={display}
        placeholder={placeholder}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.')
          if (raw === '') onChange(undefined)
          else {
            const n = Number(raw)
            if (Number.isFinite(n)) onChange(n)
          }
        }}
        style={{ ...inputStyle, fontFamily: ZH.mono }}
      />
    </label>
  )
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
