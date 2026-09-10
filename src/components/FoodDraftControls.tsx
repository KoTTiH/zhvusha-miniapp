import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SysLabel } from '../design/primitives'
import { FOOD_HUE, ZH, accentAlpha, mixAlpha } from '../design/tokens'
import type { FoodItem } from '../lib/ai'

type MacroBasis = 'portion' | 'per100'

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

function formatNum(n: number): string {
  if (n === 0) return '0'
  if (Number.isInteger(n)) return String(n)
  return String(Math.round(n * 10) / 10)
}

function scaleFoodDraftItem(
  item: FoodItem,
  k: number,
  { scaleMacros = true }: { scaleMacros?: boolean } = {},
): FoodItem {
  return markUserEdited({
    ...item,
    grams: Math.max(0, Math.round(item.grams * k)),
    kcal: Math.max(0, Math.round(item.kcal * k)),
    carbs: scaleMacros ? Math.max(0, round1(item.carbs * k)) : item.carbs,
    fat: scaleMacros ? Math.max(0, round1(item.fat * k)) : item.fat,
    protein: scaleMacros ? Math.max(0, round1(item.protein * k)) : item.protein,
    ...(item.fiber !== undefined
      ? { fiber: scaleMacros ? Math.max(0, round1(item.fiber * k)) : item.fiber }
      : {}),
  }, 'ручная правка порции')
}

function markUserEdited(item: FoodItem, basisLabel = 'ручная правка'): FoodItem {
  return {
    ...item,
    portionBasis: 'user_edit',
    basisLabel,
  }
}

function kcalPerGram(item?: FoodItem): number | null {
  if (!item || item.grams <= 0) return null
  return Math.max(0, item.kcal) / item.grams
}

type MacroPerGram = {
  carbs: number
  fat: number
  protein: number
  fiber?: number
}

function macroPerGram(item?: FoodItem): MacroPerGram | null {
  if (!item || item.grams <= 0) return null
  return {
    carbs: Math.max(0, item.carbs) / item.grams,
    fat: Math.max(0, item.fat) / item.grams,
    protein: Math.max(0, item.protein) / item.grams,
    ...(item.fiber !== undefined ? { fiber: Math.max(0, item.fiber) / item.grams } : {}),
  }
}

function foodDraftNumbers(item: FoodItem, macroBasis: MacroBasis) {
  const grams = item.grams > 0 ? item.grams : 100
  const portionFactor = grams / 100
  const per100Factor = 100 / grams
  if (macroBasis === 'per100') {
    return {
      kcalPer100: Math.round(item.kcal * per100Factor),
      carbsPer100: round1(item.carbs),
      fatPer100: round1(item.fat),
      proteinPer100: round1(item.protein),
      fiberPer100: item.fiber !== undefined ? round1(item.fiber) : undefined,
      carbsPortion: round1(item.carbs * portionFactor),
      fatPortion: round1(item.fat * portionFactor),
      proteinPortion: round1(item.protein * portionFactor),
      fiberPortion: item.fiber !== undefined ? round1(item.fiber * portionFactor) : undefined,
    }
  }
  return {
    kcalPer100: Math.round(item.kcal * per100Factor),
    carbsPer100: round1(item.carbs * per100Factor),
    fatPer100: round1(item.fat * per100Factor),
    proteinPer100: round1(item.protein * per100Factor),
    fiberPer100: item.fiber !== undefined ? round1(item.fiber * per100Factor) : undefined,
    carbsPortion: round1(item.carbs),
    fatPortion: round1(item.fat),
    proteinPortion: round1(item.protein),
    fiberPortion: item.fiber !== undefined ? round1(item.fiber) : undefined,
  }
}

function macroText(values: {
  carbs: number
  fat: number
  protein: number
  fiber?: number
}): string {
  return `${values.carbs}/${values.fat}/${values.protein}${values.fiber !== undefined ? `/${values.fiber}` : ''}`
}

function foodItemBasisText(item: FoodItem): string {
  const label = item.basisLabel?.trim()
  if (label) return label
  switch (item.portionBasis) {
    case 'stated_weight':
      return 'вес из описания'
    case 'visual_anchor':
      return 'масштаб по фото'
    case 'label':
      return 'данные с этикетки'
    case 'typical_portion':
      return 'типовая порция'
    case 'user_edit':
      return 'ручная правка'
    case 'unknown':
    case undefined:
      return 'основание не указано'
  }
}

function foodItemBrandDataText(item: FoodItem): { text: string; exact: boolean } | null {
  const label = item.brandDataLabel?.trim()
  switch (item.brandDataStatus) {
    case 'exact':
      return {
        text: label ? `точные данные подтверждены · ${label}` : 'точные данные подтверждены',
        exact: true,
      }
    case 'estimated':
      return {
        text: label || 'точные данные не подтверждены',
        exact: false,
      }
    case 'not_provided':
    default:
      return null
  }
}

export function FoodDraftAiCard({
  original,
  edited,
  onChange,
  title = 'ai разобрал',
  macroBasis = 'portion',
  scaleMacros = true,
  scaleKcalOnGrams = false,
  onNameChange,
  nameFallback = 'еда',
  afterControls,
  footer,
  lowConfidenceText,
}: {
  original: FoodItem
  edited: FoodItem
  onChange: (next: FoodItem) => void
  title?: string
  macroBasis?: MacroBasis
  scaleMacros?: boolean
  scaleKcalOnGrams?: boolean
  onNameChange?: (name: string) => void
  nameFallback?: string
  afterControls?: ReactNode
  footer?: ReactNode
  lowConfidenceText?: ReactNode
}) {
  const [editOpen, setEditOpen] = useState(false)
  const lowConf = edited.confidence < 0.8
  const veryLow = edited.confidence < 0.5
  const borderColor = lowConf ? mixAlpha(ZH.warn, 55) : mixAlpha(FOOD_HUE, 55)
  const aiConfidenceReason = edited.confidenceReason?.trim()
  const fallbackLowConfidenceText = veryLow
    ? 'для точности: добавь вес, бренд/название или фото с понятным масштабом'
    : 'для точности: уточни вес, способ приготовления, соус или размер порции'
  const grams = edited.grams > 0 ? edited.grams : 100
  const numbers = foodDraftNumbers(edited, macroBasis)
  const basisText = foodItemBasisText(edited)
  const brandDataText = foodItemBrandDataText(edited)
  const macroLine = {
    label: `у/ж/б${edited.fiber !== undefined ? '/к' : ''} за 100г:`,
    value: macroText({
      carbs: numbers.carbsPer100,
      fat: numbers.fatPer100,
      protein: numbers.proteinPer100,
      fiber: numbers.fiberPer100,
    }),
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 14px 12px',
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        background: `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 10)}, ${mixAlpha(FOOD_HUE, 4)})`,
        boxShadow: `0 0 16px ${mixAlpha(FOOD_HUE, 12)}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SysLabel color={lowConf ? ZH.warn : FOOD_HUE}>{title}</SysLabel>
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 10,
            letterSpacing: '0.12em',
            color: lowConf ? ZH.warn : ZH.textFaint,
            textTransform: 'uppercase',
          }}
        >
          уверенность {Math.round(edited.confidence * 100)}%
        </span>
      </div>

      {onNameChange ? (
        <input
          type="text"
          value={edited.name}
          onChange={(e) => onNameChange(e.target.value)}
          aria-label="название еды"
          placeholder={nameFallback}
          style={{
            width: '100%',
            border: 'none',
            borderBottom: `1px solid ${ZH.line}`,
            background: 'transparent',
            padding: '0 0 7px',
            color: ZH.text,
            fontSize: 15,
            fontWeight: 500,
            fontFamily: 'inherit',
            lineHeight: 1.3,
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      ) : (
        <div
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: ZH.text,
            lineHeight: 1.3,
            wordBreak: 'break-word',
          }}
        >
          {edited.name || nameFallback}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 6,
          fontFamily: ZH.mono,
          fontSize: 11,
          color: ZH.textDim,
          letterSpacing: '0.04em',
        }}
      >
        <div>
          <span style={{ color: ZH.textFaint }}>порция·</span>{' '}
          {edited.grams > 0 ? `${Math.round(grams)} г · ` : ''}
          <span style={{ color: ZH.text }}>{Math.round(edited.kcal)} ккал</span>
        </div>
        <div>
          <span style={{ color: ZH.textFaint }}>100 г·</span>{' '}
          <span style={{ color: ZH.text }}>{numbers.kcalPer100} ккал</span>
        </div>
        <div
          style={{
            gridColumn: '1 / -1',
            marginTop: 2,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: ZH.textFaint }}>{macroLine.label} </span>
          <span style={{ color: ZH.text }}>{macroLine.value}</span>
        </div>
        <div
          style={{
            gridColumn: '1 / -1',
            marginTop: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ color: ZH.textFaint }}>опора· </span>
          <span style={{ color: lowConf ? ZH.warn : ZH.textDim }}>{basisText}</span>
        </div>
        {brandDataText && (
          <div
            style={{
              gridColumn: '1 / -1',
              marginTop: 1,
              minWidth: 0,
              lineHeight: 1.35,
            }}
          >
            <span style={{ color: ZH.textFaint }}>бренд· </span>
            <span style={{ color: brandDataText.exact ? FOOD_HUE : ZH.warn }}>
              {brandDataText.text}
            </span>
          </div>
        )}
      </div>

      <FoodDraftScaleChips
        original={original}
        edited={edited}
        onChange={onChange}
        editOpen={editOpen}
        onToggleEdit={() => setEditOpen((v) => !v)}
        scaleMacros={scaleMacros}
      />
      {editOpen && (
        <FoodDraftEditFields
          original={original}
          edited={edited}
          onChange={onChange}
          macroBasis={macroBasis}
          scaleMacros={scaleMacros}
          scaleKcalOnGrams={scaleKcalOnGrams}
        />
      )}
      {afterControls}
      {lowConf && (
        <div
          style={{
            fontSize: 11,
            color: ZH.warn,
            lineHeight: 1.4,
            letterSpacing: '0.02em',
            fontWeight: veryLow ? 500 : 400,
          }}
        >
          {lowConfidenceText ??
            (aiConfidenceReason
              ? `для точности: ${aiConfidenceReason}`
              : fallbackLowConfidenceText)}
        </div>
      )}
      {footer}
    </div>
  )
}

export function FoodDraftScaleChips({
  original,
  edited,
  onChange,
  editOpen,
  onToggleEdit,
  scaleMacros = true,
}: {
  original: FoodItem
  edited: FoodItem
  onChange: (next: FoodItem) => void
  editOpen: boolean
  onToggleEdit: () => void
  scaleMacros?: boolean
}) {
  const ratio = original.grams > 0 ? edited.grams / original.grams : null
  const matches = (k: number) => ratio !== null && Math.abs(ratio - k) < 0.01
  const apply = (k: number) => onChange(scaleFoodDraftItem(original, k, { scaleMacros }))
  const scales: { k: number; label: string }[] = [
    { k: 0.5, label: '½×' },
    { k: 1, label: '1×' },
    { k: 1.5, label: '1.5×' },
    { k: 2, label: '2×' },
  ]
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {scales.map(({ k, label }) => {
        const active = matches(k)
        return (
          <button
            key={k}
            type="button"
            onClick={() => apply(k)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '5px 10px',
              borderRadius: 999,
              border: `1px solid ${active ? mixAlpha(FOOD_HUE, 55) : ZH.line}`,
              background: active
                ? `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 35)}, ${mixAlpha(FOOD_HUE, 14)})`
                : 'rgba(148,178,224,0.04)',
              fontFamily: ZH.mono,
              fontSize: 11,
              fontWeight: 500,
              color: active ? '#06131F' : ZH.textDim,
              letterSpacing: '0.04em',
            }}
          >
            {label}
          </button>
        )
      })}
      <button
        type="button"
        onClick={onToggleEdit}
        aria-label={editOpen ? 'свернуть правку' : 'править вручную'}
        aria-expanded={editOpen}
        style={{
          all: 'unset',
          cursor: 'pointer',
          marginLeft: 'auto',
          padding: '5px 10px',
          borderRadius: 999,
          border: `1px solid ${editOpen ? accentAlpha(0.5) : ZH.line}`,
          background: editOpen ? accentAlpha(0.14) : 'rgba(148,178,224,0.04)',
          fontFamily: ZH.mono,
          fontSize: 11,
          color: editOpen ? ZH.accent : ZH.textDim,
          letterSpacing: '0.06em',
        }}
      >
        ✎ {editOpen ? 'свернуть' : 'править'}
      </button>
    </div>
  )
}

export function FoodDraftEditFields({
  original,
  edited,
  onChange,
  macroBasis = 'portion',
  scaleMacros = true,
  scaleKcalOnGrams = false,
}: {
  original?: FoodItem
  edited: FoodItem
  onChange: (next: FoodItem) => void
  macroBasis?: MacroBasis
  scaleMacros?: boolean
  scaleKcalOnGrams?: boolean
}) {
  const kcalPerGramRef = useRef<number | null>(kcalPerGram(edited) ?? kcalPerGram(original))
  const macroPerGramRef = useRef<MacroPerGram | null>(macroPerGram(edited) ?? macroPerGram(original))
  const { grams: editedGrams, kcal: editedKcal } = edited
  useEffect(() => {
    if (!scaleKcalOnGrams) return
    const next = editedGrams > 0 ? Math.max(0, editedKcal) / editedGrams : null
    if (next !== null) kcalPerGramRef.current = next
  }, [editedGrams, editedKcal, scaleKcalOnGrams])
  useEffect(() => {
    if (!scaleMacros || macroBasis !== 'portion') return
    const next = macroPerGram(edited)
    if (next !== null) macroPerGramRef.current = next
  }, [edited, macroBasis, scaleMacros])
  const setField = (patch: Partial<FoodItem>) => {
    onChange(markUserEdited({ ...edited, ...patch }))
  }
  const setGrams = (n: number) => {
    const grams = Math.max(0, Math.round(n))
    if (!scaleKcalOnGrams) {
      setField({ grams })
      return
    }
    const scalePortionMacros = scaleMacros && macroBasis === 'portion'
    const liveKcalPerGram = kcalPerGram(edited)
    if (liveKcalPerGram !== null) kcalPerGramRef.current = liveKcalPerGram
    const baseKcalPerGram = liveKcalPerGram ?? kcalPerGramRef.current ?? kcalPerGram(original)
    const liveMacroPerGram = macroPerGram(edited)
    if (liveMacroPerGram !== null) macroPerGramRef.current = liveMacroPerGram
    const baseMacroPerGram = liveMacroPerGram ?? macroPerGramRef.current ?? macroPerGram(original)
    const kcal =
      baseKcalPerGram !== null
        ? Math.max(0, Math.round(baseKcalPerGram * grams))
        : Math.max(0, Math.round(edited.kcal))
    setField({
      grams,
      kcal,
      ...(scalePortionMacros && baseMacroPerGram
        ? {
          carbs: Math.max(0, round1(baseMacroPerGram.carbs * grams)),
          fat: Math.max(0, round1(baseMacroPerGram.fat * grams)),
          protein: Math.max(0, round1(baseMacroPerGram.protein * grams)),
          ...(baseMacroPerGram.fiber !== undefined
            ? { fiber: Math.max(0, round1(baseMacroPerGram.fiber * grams)) }
            : {}),
        }
        : {}),
    })
  }
  const macroHint = macroBasis === 'per100' ? 'БЖУК на 100 г' : null
  const kcalHint = scaleKcalOnGrams
    ? scaleMacros && macroBasis === 'portion'
      ? 'ккал и БЖУ меняются от веса'
      : 'ккал меняются от веса'
    : null
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 8,
        padding: '10px 10px 8px',
        borderRadius: 10,
        background: 'rgba(8,9,15,0.45)',
        border: `1px solid ${ZH.line}`,
      }}
    >
      {(macroHint || kcalHint) && (
        <div
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            minWidth: 0,
          }}
        >
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 8,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: ZH.textFaint,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {kcalHint ?? 'ручная правка'}
          </span>
          {macroHint && (
            <span
              style={{
                fontFamily: ZH.mono,
                fontSize: 8,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: ZH.textDim,
                textAlign: 'right',
                whiteSpace: 'nowrap',
              }}
            >
              {macroHint}
            </span>
          )}
        </div>
      )}
      <FoodDraftEditField label="вес, г" value={edited.grams} onChange={setGrams} />
      <FoodDraftEditField
        label="ккал"
        value={edited.kcal}
        onChange={(n) => setField({ kcal: Math.max(0, Math.round(n)) })}
      />
      <FoodDraftEditField
        label="углеводы, г"
        value={edited.carbs}
        onChange={(n) => setField({ carbs: Math.max(0, n) })}
      />
      <FoodDraftEditField
        label="жиры, г"
        value={edited.fat}
        onChange={(n) => setField({ fat: Math.max(0, n) })}
      />
      <FoodDraftEditField
        label="белки, г"
        value={edited.protein}
        onChange={(n) => setField({ protein: Math.max(0, n) })}
      />
      {edited.fiber !== undefined && (
        <FoodDraftEditField
          label="клетчатка, г"
          value={edited.fiber}
          onChange={(n) => setField({ fiber: Math.max(0, n) })}
        />
      )}
    </div>
  )
}

function FoodDraftEditField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  const [text, setText] = useState(() => formatNum(value))
  const focusedRef = useRef(false)
  useEffect(() => {
    if (!focusedRef.current) setText(formatNum(value))
  }, [value])
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ZH.textFaint,
        }}
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={() => {
          focusedRef.current = true
        }}
        onBlur={(e) => {
          focusedRef.current = false
          const raw = e.target.value.replace(',', '.')
          const n = Number(raw)
          if (Number.isFinite(n)) onChange(n)
          else setText(formatNum(value))
        }}
        onChange={(e) => {
          const v = e.target.value
          setText(v)
          const raw = v.replace(',', '.')
          const n = Number(raw)
          if (Number.isFinite(n)) onChange(n)
        }}
        style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 0,
          color: ZH.text,
          fontSize: 13,
          fontFamily: ZH.mono,
          width: '100%',
          boxSizing: 'border-box',
        }}
      />
    </label>
  )
}
