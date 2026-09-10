import { useEffect, useMemo, useState } from 'react'
import { Panel, SysLabel } from '../../design/primitives'
import { ZH, mixAlpha } from '../../design/tokens'
import { dayKey } from '../../lib/dates'
import {
  loadWaterColorMode,
  loadWaterGoalMl,
  loadWaterQuickAmounts,
  resolveWaterColor,
  saveWaterColorMode,
  saveWaterGoalMl,
  saveWaterQuickAmounts,
  subscribeWaterSettingsChanged,
  sumWater,
  type WaterColorMode,
} from '../../lib/water'
import { useCaloriesStore } from '../../store/calories'
import { useNotesStore } from '../../store/notes'
import { WaterProgress, WaterQuickControls } from '../WaterSection'

export function WaterTodayWidget() {
  const today = useMemo(() => dayKey(new Date()), [])
  const [editing, setEditing] = useState(false)
  const [goalMl, setGoalMl] = useState(() => loadWaterGoalMl())
  const [colorMode, setColorMode] = useState(() => loadWaterColorMode())
  const [quickAmounts, setQuickAmounts] = useState<[number, number]>(() => loadWaterQuickAmounts())
  const [draftGoal, setDraftGoal] = useState(() => String(goalMl))
  const [draftAmounts, setDraftAmounts] = useState<[string, string]>(() => [
    String(quickAmounts[0]),
    String(quickAmounts[1]),
  ])
  const loadWaterDay = useCaloriesStore((s) => s.loadWaterDay)
  const entries = useCaloriesStore((s) => s.waterByDay[today])
  const openDay = useNotesStore((s) => s.openDay)
  const total = sumWater(entries)
  const waterColor = resolveWaterColor(colorMode)

  useEffect(() => {
    void loadWaterDay(today)
  }, [today, loadWaterDay])

  useEffect(() => {
    return subscribeWaterSettingsChanged(() => {
      const nextGoal = loadWaterGoalMl()
      const nextQuick = loadWaterQuickAmounts()
      const nextColorMode = loadWaterColorMode()
      setGoalMl(nextGoal)
      setQuickAmounts(nextQuick)
      setColorMode(nextColorMode)
      setEditing((cur) => {
        if (!cur) {
          setDraftGoal(String(nextGoal))
          setDraftAmounts([String(nextQuick[0]), String(nextQuick[1])])
        }
        return cur
      })
    })
  }, [])

  const startEditing = () => {
    setDraftGoal(String(goalMl))
    setDraftAmounts([String(quickAmounts[0]), String(quickAmounts[1])])
    setEditing(true)
  }

  const saveEditing = () => {
    const nextGoal = parseAmount(draftGoal)
    const first = parseAmount(draftAmounts[0])
    const second = parseAmount(draftAmounts[1])
    if (!nextGoal || !first || !second) return
    const next: [number, number] = [first, second]
    setGoalMl(nextGoal)
    setQuickAmounts(next)
    saveWaterGoalMl(nextGoal)
    saveWaterQuickAmounts(next)
    setEditing(false)
  }

  const canSave = Boolean(
    parseAmount(draftGoal) && parseAmount(draftAmounts[0]) && parseAmount(draftAmounts[1]),
  )

  const handleEditButton = () => {
    if (!editing) {
      startEditing()
      return
    }
    saveEditing()
  }

  const handleColorModeChange = (mode: WaterColorMode) => {
    setColorMode(mode)
    saveWaterColorMode(mode)
  }

  return (
    <Panel style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SysLabel>вода · сегодня</SysLabel>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {editing && (
            <WaterThemeToggle
              value={colorMode}
              color={waterColor}
              onChange={handleColorModeChange}
            />
          )}
          <button
            type="button"
            onClick={handleEditButton}
            aria-label={editing ? 'сохранить настройки воды' : 'редактировать воду'}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 24,
              height: 24,
              borderRadius: 999,
              border: `1px solid ${editing ? mixAlpha(canSave ? waterColor : ZH.warn, 45) : ZH.line}`,
              background: editing
                ? mixAlpha(canSave ? waterColor : ZH.warn, 10)
                : 'transparent',
              color: editing ? (canSave ? waterColor : ZH.warn) : ZH.textDim,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {editing ? <CheckGlyph /> : <EditGlyph />}
          </button>
        </div>
      </div>
      {entries === undefined ? (
        <div
          className="animate-skeleton"
          style={{ height: 82, borderRadius: 12, background: 'rgba(148,178,224,0.05)' }}
        />
      ) : (
        <>
          <WaterProgress
            total={total}
            goal={goalMl}
            color={waterColor}
            editingGoal={editing}
            goalDraft={draftGoal}
            onGoalDraftChange={setDraftGoal}
          />
          <WaterQuickControls
            day={today}
            quickAmounts={quickAmounts}
            color={waterColor}
            editingQuick={editing}
            quickDrafts={draftAmounts}
            onQuickDraftChange={(idx, value) => {
              setDraftAmounts((prev) => {
                const next: [string, string] = [...prev]
                next[idx] = value
                return next
              })
            }}
          />
          {editing && (
            <div
              className="animate-fade-in"
              style={{
                fontFamily: ZH.mono,
                fontSize: 9,
                color: canSave ? waterColor : ZH.warn,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                textAlign: 'center',
              }}
            >
              {canSave ? 'изменяешь норму и быстрые кнопки' : 'введи значения 1–5000 мл'}
            </div>
          )}
          <button
            type="button"
            onClick={() => openDay(today, 'log')}
            style={{
              all: 'unset',
              cursor: 'pointer',
              paddingTop: 2,
              fontFamily: ZH.mono,
              fontSize: 10,
              color: ZH.textFaint,
              letterSpacing: '0.08em',
            }}
          >
            записей: {entries.length}
          </button>
        </>
      )}
    </Panel>
  )
}

function parseAmount(value: string): number | null {
  const n = Math.round(Number(value.replace(',', '.')))
  if (!Number.isFinite(n) || n <= 0 || n > 5000) return null
  return n
}

function WaterThemeToggle({
  value,
  color,
  onChange,
}: {
  value: WaterColorMode
  color: string
  onChange: (mode: WaterColorMode) => void
}) {
  const items: { id: WaterColorMode; label: string }[] = [
    { id: 'fixed', label: 'вода' },
    { id: 'system', label: 'тема' },
  ]
  return (
    <div
      role="tablist"
      aria-label="цвет воды"
      style={{
        display: 'inline-flex',
        padding: 2,
        borderRadius: 999,
        border: `1px solid ${ZH.line}`,
        background: 'rgba(8,9,15,0.28)',
        gap: 2,
      }}
    >
      {items.map((item) => {
        const active = value === item.id
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              minWidth: 34,
              padding: '4px 7px',
              borderRadius: 999,
              background: active ? mixAlpha(color, 18) : 'transparent',
              color: active ? color : ZH.textFaint,
              fontFamily: ZH.mono,
              fontSize: 8,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function EditGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 20h4l11-11-4-4L4 16v4Z" strokeLinejoin="round" />
      <path d="m14 6 4 4" strokeLinecap="round" />
    </svg>
  )
}

function CheckGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
