import { useEffect, useMemo, useState } from 'react'
import { ActivityBar, SysLabel } from '../design/primitives'
import { ZH, mixAlpha } from '../design/tokens'
import { hapticImpact, hapticSuccess } from '../lib/haptic'
import {
  DEFAULT_WATER_QUICK_AMOUNTS,
  loadWaterColorMode,
  loadWaterGoalMl,
  resolveWaterColor,
  subscribeWaterSettingsChanged,
  sumWater,
  WATER_HUE,
} from '../lib/water'
import { useCaloriesStore } from '../store/calories'
import type { WaterEntry } from '../types/calorie'
import type { DayKey } from '../types/note'

type Props = {
  day: DayKey
  showEntries?: boolean
}

const WATER_AMOUNT_GAP = 3
const WATER_AMOUNT_VALUE_WIDTH = '5ch'

export function WaterSection({ day, showEntries = true }: Props) {
  const [goalMl, setGoalMl] = useState(() => loadWaterGoalMl())
  const [colorMode, setColorMode] = useState(() => loadWaterColorMode())
  const loadWaterDay = useCaloriesStore((s) => s.loadWaterDay)
  const waterRaw = useCaloriesStore((s) => s.waterByDay[day])
  const deleteWater = useCaloriesStore((s) => s.deleteWater)
  const entries = useMemo(() => waterRaw ?? [], [waterRaw])
  const sorted = useMemo(() => [...entries].sort((a, b) => a.createdAt - b.createdAt), [entries])
  const total = sumWater(entries)
  const isLoaded = waterRaw !== undefined
  const waterColor = resolveWaterColor(colorMode)

  useEffect(() => {
    void loadWaterDay(day)
  }, [day, loadWaterDay])

  useEffect(() => {
    return subscribeWaterSettingsChanged(() => {
      setGoalMl(loadWaterGoalMl())
      setColorMode(loadWaterColorMode())
    })
  }, [])

  const handleDelete = async (id: string) => {
    hapticImpact('medium')
    await deleteWater(day, id)
  }

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
              background: waterColor,
              boxShadow: `0 0 8px ${waterColor}`,
            }}
          />
          <SysLabel color={ZH.textDim}>Вода</SysLabel>
        </div>
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 11,
            color: ZH.textFaint,
            letterSpacing: '0.08em',
          }}
        >
          {total} мл
        </span>
      </div>

      <div
        style={{
          background: ZH.panel,
          border: `1px solid ${ZH.line}`,
          borderRadius: 14,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
        }}
      >
        <WaterProgress total={total} goal={goalMl} color={waterColor} />
        <WaterQuickControls day={day} color={waterColor} />
      </div>

      {!showEntries ? null : !isLoaded ? (
        <div
          className="animate-skeleton"
          style={{ height: 44, borderRadius: 10, background: 'rgba(148,178,224,0.05)' }}
        />
      ) : sorted.length === 0 ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map((entry) => (
            <WaterRow
              key={entry.id}
              entry={entry}
              onDelete={() => void handleDelete(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function WaterProgress({
  total,
  goal,
  color = WATER_HUE,
  editingGoal = false,
  goalDraft,
  onGoalDraftChange,
}: {
  total: number
  goal: number
  color?: string
  editingGoal?: boolean
  goalDraft?: string
  onGoalDraftChange?: (value: string) => void
}) {
  const pct = goal > 0 ? Math.min(100, (total / goal) * 100) : 0
  const remaining = Math.max(0, goal - total)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 24,
              fontWeight: 500,
              letterSpacing: '0.02em',
              color: ZH.text,
            }}
          >
            {total}
          </span>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              color: ZH.textFaint,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            мл
          </span>
        </div>
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 10,
            color: remaining > 0 ? ZH.textFaint : color,
            letterSpacing: '0.08em',
          }}
        >
          {remaining > 0 ? `ещё ${remaining} мл` : 'цель закрыта'}
        </span>
      </div>
      <ActivityBar value={pct} color={color} height={5} trackOpacity={0.09} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: ZH.mono,
          fontSize: 9,
          color: ZH.textFaint,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        <span>{Math.round(pct)}%</span>
        {editingGoal ? (
          <input
            type="text"
            inputMode="numeric"
            aria-label="норма воды"
            value={goalDraft ?? String(goal)}
            onChange={(e) => onGoalDraftChange?.(e.target.value)}
            style={{
              width: 72,
              border: `1px solid ${mixAlpha(color, 45)}`,
              borderRadius: 7,
              background: mixAlpha(color, 8),
              color,
              fontFamily: ZH.mono,
              fontSize: 10,
              letterSpacing: '0.08em',
              textAlign: 'center',
              outline: 'none',
              padding: '3px 6px',
              boxSizing: 'border-box',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
          />
        ) : (
          <span>{goal} мл</span>
        )}
      </div>
    </div>
  )
}

export function WaterQuickControls({
  day,
  quickAmounts = DEFAULT_WATER_QUICK_AMOUNTS,
  color = WATER_HUE,
  editingQuick = false,
  quickDrafts,
  onQuickDraftChange,
}: {
  day: DayKey
  quickAmounts?: readonly [number, number]
  color?: string
  editingQuick?: boolean
  quickDrafts?: readonly [string, string]
  onQuickDraftChange?: (idx: 0 | 1, value: string) => void
}) {
  const addWater = useCaloriesStore((s) => s.addWater)
  const [custom, setCustom] = useState('')

  const parsed = Number(custom.replace(',', '.'))
  const customMl = Number.isFinite(parsed) ? Math.round(parsed) : 0
  const canAddCustom = customMl > 0

  const add = async (ml: number) => {
    await addWater(day, ml)
    hapticSuccess()
  }

  const handleCustom = async () => {
    if (!canAddCustom) return
    await add(customMl)
    setCustom('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {editingQuick ? (
          <>
            <WaterButtonEditor
              value={quickDrafts?.[0] ?? String(quickAmounts[0])}
              color={color}
              onChange={(value) => onQuickDraftChange?.(0, value)}
            />
            <WaterButtonEditor
              value={quickDrafts?.[1] ?? String(quickAmounts[1])}
              color={color}
              onChange={(value) => onQuickDraftChange?.(1, value)}
            />
          </>
        ) : (
          <>
            <WaterButton ml={quickAmounts[0]} color={color} onClick={() => void add(quickAmounts[0])} />
            <WaterButton ml={quickAmounts[1]} color={color} onClick={() => void add(quickAmounts[1])} />
          </>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label
          style={{
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: WATER_AMOUNT_GAP,
            padding: '0 12px',
            border: `1px solid ${ZH.line}`,
            borderRadius: 10,
            background: 'rgba(18,23,36,0.45)',
            boxSizing: 'border-box',
            minWidth: 0,
          }}
        >
          <input
            type="text"
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="0"
            style={{
              width: WATER_AMOUNT_VALUE_WIDTH,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              padding: 0,
              color: ZH.text,
              fontFamily: ZH.mono,
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textAlign: 'right',
              boxSizing: 'border-box',
              userSelect: 'text',
              WebkitUserSelect: 'text',
            }}
          />
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 12,
              fontWeight: 600,
              color: ZH.textFaint,
            }}
          >
            мл
          </span>
        </label>
        <button
          type="button"
          onClick={() => void handleCustom()}
          disabled={!canAddCustom}
          style={{
            all: 'unset',
            cursor: canAddCustom ? 'pointer' : 'not-allowed',
            height: 40,
            padding: '0 12px',
            borderRadius: 10,
            textAlign: 'center',
            border: `1px solid ${canAddCustom ? mixAlpha(color, 50) : ZH.line}`,
            background: canAddCustom
              ? `linear-gradient(180deg, ${mixAlpha(color, 45)}, ${mixAlpha(color, 20)})`
              : 'rgba(148,178,224,0.04)',
            color: canAddCustom ? '#06131F' : ZH.textFaint,
            fontFamily: ZH.mono,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            opacity: canAddCustom ? 1 : 0.55,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          добавить
        </button>
      </div>
    </div>
  )
}

function WaterButton({ ml, color, onClick }: { ml: number; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        height: 40,
        padding: '0 12px',
        borderRadius: 10,
        textAlign: 'center',
        border: `1px solid ${mixAlpha(color, 45)}`,
        background: `linear-gradient(180deg, ${mixAlpha(color, 20)}, ${mixAlpha(color, 8)})`,
        boxShadow: `0 0 14px ${mixAlpha(color, 14)}`,
        fontFamily: ZH.mono,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.12em',
        color,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: WATER_AMOUNT_GAP,
      }}
    >
      <span style={{ width: WATER_AMOUNT_VALUE_WIDTH, textAlign: 'right' }}>+{ml}</span>
      <span>мл</span>
    </button>
  )
}

function WaterButtonEditor({
  value,
  color,
  onChange,
}: {
  value: string
  color: string
  onChange: (value: string) => void
}) {
  return (
    <label
      style={{
        height: 40,
        padding: '0 12px',
        borderRadius: 10,
        border: `1px dashed ${mixAlpha(color, 70)}`,
        background: `linear-gradient(180deg, ${mixAlpha(color, 24)}, ${mixAlpha(color, 10)})`,
        boxShadow: `0 0 16px ${mixAlpha(color, 18)}, 0 0 0 1px ${mixAlpha(color, 12)} inset`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: WATER_AMOUNT_GAP,
        minWidth: 0,
        boxSizing: 'border-box',
        userSelect: 'text',
        WebkitUserSelect: 'text',
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        aria-label="быстрая кнопка воды"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: WATER_AMOUNT_VALUE_WIDTH,
          border: 'none',
          outline: 'none',
          padding: 0,
          background: 'transparent',
          color,
          fontFamily: ZH.mono,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textAlign: 'right',
          boxSizing: 'border-box',
          userSelect: 'text',
          WebkitUserSelect: 'text',
        }}
      />
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 12,
          fontWeight: 600,
          color,
        }}
      >
        мл
      </span>
    </label>
  )
}

function WaterRow({
  entry,
  onDelete,
}: {
  entry: WaterEntry
  onDelete: () => void
}) {
  return (
    <div
      style={{
        background: 'rgba(18,23,36,0.45)',
        border: `1px solid ${ZH.line}`,
        borderRadius: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
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
        {formatTime(entry.createdAt)}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 13,
          color: ZH.text,
          minWidth: 0,
        }}
      >
        {entry.ml} мл
      </span>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Удалить воду"
        style={{
          all: 'unset',
          cursor: 'pointer',
          width: 24,
          height: 24,
          borderRadius: 7,
          border: `1px solid ${ZH.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: ZH.textDim,
          fontFamily: ZH.mono,
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}
