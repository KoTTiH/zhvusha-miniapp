import { useEffect, useRef, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { ACCENT_PRESETS } from '../design/themePresets'
import { Panel, SysLabel } from '../design/primitives'
import { FOOD_HUE, ZH, accentAlpha, mixAlpha } from '../design/tokens'
import {
  buildAppReadinessReport,
  type AppReadinessTone,
} from '../lib/appReadiness'
import {
  buildDataExport,
  copyDataExportToClipboard,
  downloadDataExport,
  importDataExport,
  previewDataImport,
  serializeDataExport,
  type ZhvushaImportPreview,
  type ZhvushaImportSummary,
  type ZhvushaExport,
} from '../lib/dataExport'
import {
  loadDataBackupStatus,
  rememberDataExport,
  rememberDataImport,
  type DataBackupCounts,
  type DataBackupStatus,
} from '../lib/dataBackupStatus'
import {
  currentDataStorageStatus,
  type DataStorageTone,
} from '../lib/dataStorageStatus'
import {
  runDataIntegrityCheck,
  type DataIntegrityGroup,
  type DataIntegrityIssue,
  type DataIntegrityReport,
} from '../lib/dataIntegrity'
import {
  AI_PRIVACY_NOTE,
  AI_PRIVACY_ROWS,
  AI_PRIVACY_SUMMARY,
  AI_PRIVACY_TITLE,
  type AiPrivacyTone,
} from '../lib/aiPrivacyPolicy'
import { hapticSelection } from '../lib/haptic'
import { isHexColor } from '../lib/themeStorage'
import {
  QUALITY_MAP_ROWS,
  QUALITY_MAP_SUMMARY,
  QUALITY_MAP_TITLE,
  type QualityMapTone,
} from '../lib/qualityMap'
import {
  loadWaterColorMode,
  loadWaterGoalMl,
  resolveWaterColor,
  saveWaterGoalMl,
  subscribeWaterSettingsChanged,
} from '../lib/water'
import { useCaloriesStore } from '../store/calories'
import { useThemeStore } from '../store/theme'
import type { Goal } from '../types/calorie'
import { BottomSheet } from './BottomSheet'

type Props = {
  open: boolean
  onClose: () => void
  tab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}

export type SettingsTab = 'color' | 'goal' | 'data'

export function SettingsSheet({ open, onClose, tab, onTabChange }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} hideClose ariaLabel="настройки">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <TabSwitcher value={tab} onChange={onTabChange} />
          <button
            type="button"
            onClick={onClose}
            style={{
              all: 'unset',
              fontFamily: ZH.mono,
              fontSize: 11,
              letterSpacing: '0.14em',
              color: ZH.textDim,
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Готово
          </button>
        </div>

        {tab === 'color' && <ColorTab />}
        {tab === 'goal' && <GoalTab onDone={onClose} />}
        {tab === 'data' && <DataTab />}
      </div>
    </BottomSheet>
  )
}

const GOAL_FIELD_VALUE_WIDTH = '5ch'
const GOAL_FIELD_GAP = 3

function TabSwitcher({
  value,
  onChange,
}: {
  value: SettingsTab
  onChange: (t: SettingsTab) => void
}) {
  const items: { id: SettingsTab; label: string }[] = [
    { id: 'color', label: 'цвет' },
    { id: 'goal', label: 'цели' },
    { id: 'data', label: 'данные' },
  ]
  return (
    <div
      role="tablist"
      aria-label="настройки"
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
        const active = value === it.id
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
              padding: '4px 10px',
              borderRadius: 6,
              background: active ? accentAlpha(0.18) : 'transparent',
              color: active ? ZH.text : ZH.textFaint,
              fontFamily: ZH.mono,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.16em',
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

function ColorTab() {
  const accent = useThemeStore((s) => s.accent)
  const setAccent = useThemeStore((s) => s.setAccent)
  const calorieDeviationEnabled = useThemeStore((s) => s.calorieDeviationEnabled)
  const calorieDeviationColor = useThemeStore((s) => s.calorieDeviationColor)
  const calorieDeviationSavedColors = useThemeStore((s) => s.calorieDeviationSavedColors)
  const setCalorieDeviationEnabled = useThemeStore((s) => s.setCalorieDeviationEnabled)
  const setCalorieDeviationColor = useThemeStore((s) => s.setCalorieDeviationColor)
  const saveCalorieDeviationColorChoice = useThemeStore((s) => s.saveCalorieDeviationColorChoice)
  const foodColorEnabled = useThemeStore((s) => s.foodColorEnabled)
  const foodColor = useThemeStore((s) => s.foodColor)
  const foodSavedColors = useThemeStore((s) => s.foodSavedColors)
  const setFoodColorEnabled = useThemeStore((s) => s.setFoodColorEnabled)
  const setFoodColor = useThemeStore((s) => s.setFoodColor)
  const saveFoodColorChoice = useThemeStore((s) => s.saveFoodColorChoice)
  const [custom, setCustom] = useState(accent)
  const [deviationCustom, setDeviationCustom] = useState(calorieDeviationColor)
  const [foodCustom, setFoodCustom] = useState(foodColor)

  const pickPreset = (hex: string) => {
    setAccent(hex)
    setCustom(hex)
    hapticSelection()
  }

  const applyCustom = (hex: string) => {
    setCustom(hex)
    setAccent(hex)
  }

  const applyDeviationColor = (hex: string) => {
    setDeviationCustom(hex)
    setCalorieDeviationColor(hex)
  }

  const applyFoodColor = (hex: string) => {
    setFoodCustom(hex)
    setFoodColor(hex)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <div style={{ padding: '0 2px 8px' }}>
          <SysLabel color={ZH.textFaint}>Пресеты</SysLabel>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10,
          }}
        >
          {ACCENT_PRESETS.map((p) => {
            const active = p.hex.toUpperCase() === accent.toUpperCase()
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => pickPreset(p.hex)}
                style={{
                  all: 'unset',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 0',
                  borderRadius: 10,
                  border: active ? `1px solid ${p.hex}` : `1px solid ${ZH.line}`,
                  background: active ? `color-mix(in srgb, ${p.hex} 12%, transparent)` : 'transparent',
                  boxShadow: active ? `0 0 14px color-mix(in srgb, ${p.hex} 40%, transparent)` : 'none',
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: `radial-gradient(circle, ${p.hex}, color-mix(in srgb, ${p.hex} 40%, transparent))`,
                    boxShadow: `0 0 12px color-mix(in srgb, ${p.hex} 70%, transparent)`,
                  }}
                />
                <span
                  style={{
                    fontFamily: ZH.mono,
                    fontSize: 9,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: active ? p.hex : ZH.textDim,
                  }}
                >
                  {p.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <div style={{ padding: '0 2px 8px' }}>
          <SysLabel color={ZH.textFaint}>Свой цвет</SysLabel>
        </div>
        <Panel style={{ padding: 14 }}>
          <div className="color-editor-picker">
            <HexColorPicker color={custom} onChange={applyCustom} />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: custom,
                border: `1px solid ${ZH.line}`,
                boxShadow: `0 0 16px ${accentAlpha(0.4)}`,
                flexShrink: 0,
              }}
            />
            <input
              type="text"
              value={custom}
              onChange={(e) => {
                const v = e.target.value.trim()
                setCustom(v)
                if (/^#[0-9a-fA-F]{6}$/.test(v)) setAccent(v)
              }}
              spellCheck={false}
              style={{
                flex: 1,
                border: `1px solid ${ZH.line}`,
                borderRadius: 8,
                background: 'rgba(18,23,36,0.45)',
                padding: '10px 12px',
                fontFamily: ZH.mono,
                fontSize: 13,
                color: ZH.text,
                letterSpacing: '0.08em',
                outline: 'none',
                textTransform: 'uppercase',
              }}
            />
          </div>
        </Panel>
      </div>

      <ColorFeaturePanel
        title="Отклонение калорий"
        description="цвет для перебора и недобора в дневнике, календаре и виджете"
        enabled={calorieDeviationEnabled}
        activeColor={calorieDeviationColor}
        custom={deviationCustom}
        savedColors={calorieDeviationSavedColors}
        onToggle={() => setCalorieDeviationEnabled(!calorieDeviationEnabled)}
        onPick={applyDeviationColor}
        onInput={(value) => {
          setDeviationCustom(value)
          if (isHexColor(value)) setCalorieDeviationColor(value)
        }}
        onSave={() => {
          saveCalorieDeviationColorChoice(deviationCustom)
          hapticSelection()
        }}
      />

      <ColorFeaturePanel
        title="Цвет еды"
        description="акцент еды; если выключить, еда будет в основном цвете темы"
        enabled={foodColorEnabled}
        activeColor={foodColor}
        custom={foodCustom}
        savedColors={foodSavedColors}
        onToggle={() => setFoodColorEnabled(!foodColorEnabled)}
        onPick={applyFoodColor}
        onInput={(value) => {
          setFoodCustom(value)
          if (isHexColor(value)) setFoodColor(value)
        }}
        onSave={() => {
          saveFoodColorChoice(foodCustom)
          hapticSelection()
        }}
      />
    </div>
  )
}

function ColorFeaturePanel({
  title,
  description,
  enabled,
  activeColor,
  custom,
  savedColors,
  onToggle,
  onPick,
  onInput,
  onSave,
}: {
  title: string
  description: string
  enabled: boolean
  activeColor: string
  custom: string
  savedColors: string[]
  onToggle: () => void
  onPick: (hex: string) => void
  onInput: (value: string) => void
  onSave: () => void
}) {
  const pickerColor = isHexColor(custom) ? custom : activeColor
  return (
    <Panel style={{ padding: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <SysLabel color={ZH.textFaint}>{title}</SysLabel>
            <span style={{ fontSize: 12, color: ZH.textDim, lineHeight: 1.4 }}>
              {description}
            </span>
          </div>
          <button
            type="button"
            aria-pressed={enabled}
            onClick={onToggle}
            style={{
              all: 'unset',
              cursor: 'pointer',
              flexShrink: 0,
              minWidth: 54,
              padding: '7px 10px',
              borderRadius: 999,
              border: `1px solid ${enabled ? mixAlpha(activeColor, 55) : ZH.line}`,
              background: enabled ? mixAlpha(activeColor, 12) : 'rgba(148,178,224,0.04)',
              color: enabled ? activeColor : ZH.textFaint,
              fontFamily: ZH.mono,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              textAlign: 'center',
            }}
          >
            {enabled ? 'вкл' : 'выкл'}
          </button>
        </div>

        {enabled && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="color-editor-picker">
              <HexColorPicker color={pickerColor} onChange={onPick} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  background: pickerColor,
                  border: `1px solid ${ZH.line}`,
                  boxShadow: `0 0 16px ${mixAlpha(pickerColor, 40)}`,
                  flexShrink: 0,
                }}
              />
              <input
                type="text"
                value={custom}
                onChange={(e) => onInput(e.target.value.trim())}
                spellCheck={false}
                style={{
                  flex: 1,
                  border: `1px solid ${ZH.line}`,
                  borderRadius: 8,
                  background: 'rgba(18,23,36,0.45)',
                  padding: '10px 12px',
                  fontFamily: ZH.mono,
                  fontSize: 13,
                  color: ZH.text,
                  letterSpacing: '0.08em',
                  outline: 'none',
                  textTransform: 'uppercase',
                }}
              />
            </div>
            <SavedColorRow
              colors={savedColors}
              activeColor={activeColor}
              canSave={isHexColor(custom)}
              onPick={onPick}
              onSave={onSave}
            />
          </div>
        )}
      </div>
    </Panel>
  )
}

function SavedColorRow({
  colors,
  activeColor,
  canSave,
  onPick,
  onSave,
}: {
  colors: string[]
  activeColor: string
  canSave: boolean
  onPick: (hex: string) => void
  onSave: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        {colors.map((color) => {
          const active = color.toUpperCase() === activeColor.toUpperCase()
          return (
            <button
              key={color}
              type="button"
              aria-label={`Выбрать ${color}`}
              onClick={() => {
                onPick(color)
                hapticSelection()
              }}
              style={{
                all: 'unset',
                cursor: 'pointer',
                width: 24,
                height: 24,
                borderRadius: 999,
                background: color,
                border: active ? `2px solid ${ZH.text}` : `1px solid ${ZH.lineHi}`,
                boxShadow: active ? `0 0 12px ${mixAlpha(color, 65)}` : '0 2px 6px rgba(0,0,0,0.35)',
                boxSizing: 'border-box',
              }}
            />
          )
        })}
      </div>
      <button
        type="button"
        disabled={!canSave}
        onClick={onSave}
        style={{
          all: 'unset',
          cursor: canSave ? 'pointer' : 'not-allowed',
          flexShrink: 0,
          height: 32,
          padding: '0 10px',
          borderRadius: 8,
          border: `1px solid ${canSave ? mixAlpha(activeColor, 45) : ZH.line}`,
          background: canSave ? mixAlpha(activeColor, 10) : 'rgba(148,178,224,0.04)',
          color: canSave ? activeColor : ZH.textFaint,
          fontFamily: ZH.mono,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          opacity: canSave ? 1 : 0.55,
        }}
      >
        сохранить
      </button>
    </div>
  )
}

function GoalTab({ onDone }: { onDone: () => void }) {
  const goal = useCaloriesStore((s) => s.goal)
  const setGoal = useCaloriesStore((s) => s.setGoal)
  const openGoalEditor = useCaloriesStore((s) => s.openGoalEditor)

  const handleOpen = () => {
    onDone()
    openGoalEditor()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Panel style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <SysLabel color={ZH.textFaint}>Текущая цель</SysLabel>
            <button
              type="button"
              onClick={handleOpen}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '7px 10px',
                borderRadius: 8,
                border: `1px solid ${accentAlpha(0.4)}`,
                background: accentAlpha(0.08),
                color: ZH.accent,
                fontFamily: ZH.mono,
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                flexShrink: 0,
              }}
            >
              точная настройка
            </button>
          </div>
          <KcalGoalRow key={goal.kcal} goal={goal} setGoal={setGoal} />
          {goal.kcal > 0 && (
            <div
              style={{
                fontFamily: ZH.mono,
                fontSize: 11,
                color: ZH.textDim,
                letterSpacing: '0.04em',
              }}
            >
              У {goal.carbsPct}% · Ж {goal.fatPct}% · Б {goal.proteinPct}%
            </div>
          )}
        </div>
      </Panel>

      <WaterGoalSettings />
    </div>
  )
}

function KcalGoalRow({
  goal,
  setGoal,
}: {
  goal: Goal
  setGoal: (goal: Goal) => Promise<void>
}) {
  const [kcalDraft, setKcalDraft] = useState(() => String(goal.kcal || ''))
  const parsedKcal = parseKcal(kcalDraft)
  const canSaveKcal = parsedKcal !== null && parsedKcal !== goal.kcal

  const handleSaveKcal = () => {
    if (parsedKcal === null) return
    void setGoal({ ...goal, kcal: parsedKcal })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <label
        style={{
          height: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: GOAL_FIELD_GAP,
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
          aria-label="норма калорий"
          value={kcalDraft}
          onChange={(e) => setKcalDraft(e.target.value)}
          placeholder="0"
          style={{
            width: GOAL_FIELD_VALUE_WIDTH,
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
          ккал
        </span>
      </label>
      <button
        type="button"
        onClick={handleSaveKcal}
        disabled={!canSaveKcal}
        style={{
          all: 'unset',
          cursor: canSaveKcal ? 'pointer' : 'not-allowed',
          height: 40,
          padding: '0 12px',
          borderRadius: 10,
          border: `1px solid ${canSaveKcal ? accentAlpha(0.45) : ZH.line}`,
          background: canSaveKcal
            ? `linear-gradient(180deg, ${accentAlpha(0.45)}, ${accentAlpha(0.2)})`
            : 'rgba(148,178,224,0.04)',
          color: canSaveKcal ? ZH.accent : ZH.textFaint,
          fontFamily: ZH.mono,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          opacity: canSaveKcal ? 1 : 0.55,
          textAlign: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxSizing: 'border-box',
        }}
      >
        сохранить
      </button>
    </div>
  )
}

function WaterGoalSettings() {
  const [goalMl, setGoalMl] = useState(() => loadWaterGoalMl())
  const [colorMode, setColorMode] = useState(() => loadWaterColorMode())
  const [draft, setDraft] = useState(() => String(goalMl))
  const waterColor = resolveWaterColor(colorMode)

  useEffect(() => {
    return subscribeWaterSettingsChanged(() => {
      const next = loadWaterGoalMl()
      setGoalMl(next)
      setColorMode(loadWaterColorMode())
      setDraft(String(next))
    })
  }, [])

  const parsed = parseMl(draft)
  const canSave = parsed !== null && parsed !== goalMl

  const handleSave = () => {
    if (parsed === null) return
    setGoalMl(parsed)
    saveWaterGoalMl(parsed)
  }

  return (
    <Panel style={{ padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <SysLabel color={ZH.textFaint}>Норма воды</SysLabel>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 11,
              color: waterColor,
              letterSpacing: '0.08em',
            }}
          >
            {goalMl} мл / день
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label
            style={{
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: GOAL_FIELD_GAP,
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
              aria-label="норма воды"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{
                width: GOAL_FIELD_VALUE_WIDTH,
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
            onClick={handleSave}
            disabled={!canSave}
            style={{
              all: 'unset',
              cursor: canSave ? 'pointer' : 'not-allowed',
              height: 40,
              padding: '0 12px',
              borderRadius: 10,
              textAlign: 'center',
              border: `1px solid ${canSave ? mixAlpha(waterColor, 50) : ZH.line}`,
              background: canSave
                ? `linear-gradient(180deg, ${mixAlpha(waterColor, 42)}, ${mixAlpha(waterColor, 18)})`
                : 'rgba(148,178,224,0.04)',
              color: canSave ? waterColor : ZH.textFaint,
              fontFamily: ZH.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              opacity: canSave ? 1 : 0.55,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}
          >
            сохранить
          </button>
        </div>
      </div>
    </Panel>
  )
}

function DataTab() {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('экспорт ещё не собран')
  const [importStatus, setImportStatus] = useState('импорт ещё не запускался')
  const [exportData, setExportData] = useState<ZhvushaExport | null>(null)
  const [importSummary, setImportSummary] = useState<ZhvushaImportSummary | null>(null)
  const [pendingImport, setPendingImport] = useState<{ json: string; preview: ZhvushaImportPreview } | null>(null)
  const [backupStatus, setBackupStatus] = useState<DataBackupStatus>(() => loadDataBackupStatus())
  const [integrityStatus, setIntegrityStatus] = useState('проверка ещё не запускалась')
  const [integrityReport, setIntegrityReport] = useState<DataIntegrityReport | null>(null)
  const [json, setJson] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const showProjectDiagnostics = import.meta.env.DEV

  const handleExport = async () => {
    if (busy) return
    setBusy(true)
    setStatus('собираю экспорт')
    try {
      const next = await buildDataExport()
      const nextJson = serializeDataExport(next)
      const downloaded = downloadDataExport(next, nextJson)
      const copied = await copyDataExportToClipboard(nextJson)
      setExportData(next)
      setJson(nextJson)
      setBackupStatus(rememberDataExport(next))
      hapticSelection()
      if (downloaded && copied) setStatus('экспорт собран: файл скачан, JSON скопирован')
      else if (downloaded) setStatus('экспорт собран: файл скачан')
      else if (copied) setStatus('экспорт собран: JSON скопирован')
      else setStatus('экспорт собран: JSON ниже')
    } catch {
      setStatus('не удалось собрать экспорт')
    } finally {
      setBusy(false)
    }
  }

  const handleImportFile = async (file: File | null) => {
    if (!file || busy) return
    setBusy(true)
    setImportStatus('проверяю JSON')
    try {
      const text = await file.text()
      const parsed = previewDataImport(text)
      if (!parsed.ok) {
        setPendingImport(null)
        setImportSummary(null)
        setImportStatus(parsed.message)
        return
      }
      setPendingImport({ json: text, preview: parsed.preview })
      setImportSummary(null)
      setImportStatus(`JSON проверен: ${importPreviewLine(parsed.preview)}`)
      hapticSelection()
    } catch {
      setPendingImport(null)
      setImportStatus('не удалось прочитать JSON')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleApplyImport = async () => {
    if (!pendingImport || busy) return
    setBusy(true)
    setImportStatus('применяю импорт')
    try {
      const summary = await importDataExport(pendingImport.json)
      setImportSummary(summary)
      setBackupStatus(rememberDataImport(summary))
      setPendingImport(null)
      setImportStatus(`импорт готов: ${importSummaryLine(summary)}`)
      hapticSelection()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'не удалось восстановить JSON'
      setImportStatus(message)
    } finally {
      setBusy(false)
    }
  }

  const handleIntegrityCheck = async () => {
    if (busy) return
    setBusy(true)
    setIntegrityStatus('проверяю данные')
    try {
      const report = await runDataIntegrityCheck()
      setIntegrityReport(report)
      setIntegrityStatus(report.issues.length > 0
        ? `найдено: ${report.issues.length}`
        : 'битых ссылок нет')
      hapticSelection()
    } catch {
      setIntegrityStatus('проверка не собралась')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <BackupStatusPanel status={backupStatus} />

      {showProjectDiagnostics && (
        <>
          <AppReadinessPanel backupStatus={backupStatus} />
          <QualityMapPanel />
        </>
      )}

      <StorageLocationPanel />

      <AiPrivacyPanel />

      <Panel style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <SysLabel color={ZH.textFaint}>Целостность</SysLabel>
              <span style={{ fontSize: 12, color: ZH.textDim, lineHeight: 1.4 }}>
                сломанные ссылки в дневнике и шаблонах блюд
              </span>
            </div>
            <button
              type="button"
              onClick={handleIntegrityCheck}
              disabled={busy}
              style={{
                all: 'unset',
                cursor: busy ? 'wait' : 'pointer',
                flexShrink: 0,
                height: 40,
                padding: '0 12px',
                borderRadius: 10,
                border: `1px solid ${busy ? ZH.line : accentAlpha(0.45)}`,
                background: busy
                  ? 'rgba(148,178,224,0.04)'
                  : `linear-gradient(180deg, ${accentAlpha(0.35)}, ${accentAlpha(0.14)})`,
                color: busy ? ZH.textFaint : ZH.accent,
                fontFamily: ZH.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                opacity: busy ? 0.65 : 1,
              }}
            >
              {busy ? 'проверяю' : 'проверить'}
            </button>
          </div>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${ZH.line}`,
              background: 'rgba(18,23,36,0.45)',
              fontFamily: ZH.mono,
              fontSize: 11,
              color: integrityReport?.issues.length ? ZH.warn : ZH.textDim,
              letterSpacing: '0.04em',
            }}
          >
            {integrityStatus}
          </div>
          {integrityReport && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <ExportMetric label="дни" value={integrityReport.days} />
                <ExportMetric label="записи" value={integrityReport.foodEntries} />
                <ExportMetric label="блюда" value={integrityReport.meals} />
                <ExportMetric label="позиции" value={integrityReport.mealItems} />
                <ExportMetric label="дневник" value={integrityReport.brokenFoodEntries} />
                <ExportMetric label="шаблоны" value={integrityReport.brokenMealItems} />
              </div>
              {integrityReport.groups.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ fontSize: 12, lineHeight: 1.45, color: ZH.textFaint }}>
                    Проверка ничего не меняет сама: показывает место и следующий ручной шаг.
                  </div>
                  {integrityReport.groups.map((group) => (
                    <IntegrityGroupRow key={group.kind} group={group} />
                  ))}
                </div>
              )}
              {integrityReport.issues.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {integrityReport.issues.slice(0, 4).map((issue) => (
                    <IntegrityIssueRow key={issue.id} issue={issue} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </Panel>

      <Panel style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <SysLabel color={ZH.textFaint}>Экспорт</SysLabel>
              <span style={{ fontSize: 12, color: ZH.textDim, lineHeight: 1.4 }}>
                еда, вода, заметки, цели, настройки и виджеты
              </span>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={busy}
              style={{
                all: 'unset',
                cursor: busy ? 'wait' : 'pointer',
                flexShrink: 0,
                height: 40,
                padding: '0 12px',
                borderRadius: 10,
                border: `1px solid ${busy ? ZH.line : accentAlpha(0.45)}`,
                background: busy
                  ? 'rgba(148,178,224,0.04)'
                  : `linear-gradient(180deg, ${accentAlpha(0.4)}, ${accentAlpha(0.18)})`,
                color: busy ? ZH.textFaint : ZH.accent,
                fontFamily: ZH.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                opacity: busy ? 0.65 : 1,
              }}
            >
              {busy ? 'собираю' : 'создать JSON'}
            </button>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${ZH.line}`,
              background: 'rgba(18,23,36,0.45)',
              fontFamily: ZH.mono,
              fontSize: 11,
              color: ZH.textDim,
              letterSpacing: '0.04em',
            }}
          >
            {status}
          </div>

          {exportData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <ExportMetric label="дни" value={exportData.counts.days} />
              <ExportMetric label="еда" value={exportData.counts.foodEntries} />
              <ExportMetric label="вода" value={exportData.counts.waterEntries} />
              <ExportMetric label="заметки" value={exportData.counts.notes} />
              <ExportMetric label="база" value={exportData.counts.foods + exportData.counts.meals} />
              <ExportMetric label="виджеты" value={exportData.counts.widgets} />
              <ExportMetric label="код" value={exportData.fingerprint} />
            </div>
          )}
        </div>
      </Panel>

      {json && (
        <textarea
          value={json}
          readOnly
          aria-label="JSON экспорт"
          style={{
            width: '100%',
            minHeight: 140,
            maxHeight: 220,
            resize: 'vertical',
            border: `1px solid ${ZH.line}`,
            borderRadius: 10,
            background: 'rgba(18,23,36,0.45)',
            color: ZH.textDim,
            padding: 12,
            fontFamily: ZH.mono,
            fontSize: 10,
            lineHeight: 1.45,
            outline: 'none',
            boxSizing: 'border-box',
            userSelect: 'text',
            WebkitUserSelect: 'text',
          }}
        />
      )}

      <Panel style={{ padding: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <SysLabel color={ZH.textFaint}>Восстановление</SysLabel>
              <span style={{ fontSize: 12, color: ZH.textDim, lineHeight: 1.4 }}>
                сначала показывает состав, потом добавляет без очистки текущих записей
              </span>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              style={{
                all: 'unset',
                cursor: busy ? 'wait' : 'pointer',
                flexShrink: 0,
                height: 40,
                padding: '0 12px',
                borderRadius: 10,
                border: `1px solid ${busy ? ZH.line : accentAlpha(0.45)}`,
                background: busy
                  ? 'rgba(148,178,224,0.04)'
                  : `linear-gradient(180deg, ${accentAlpha(0.35)}, ${accentAlpha(0.14)})`,
                color: busy ? ZH.textFaint : ZH.accent,
                fontFamily: ZH.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                opacity: busy ? 0.65 : 1,
              }}
            >
              выбрать JSON
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(event) => void handleImportFile(event.currentTarget.files?.[0] ?? null)}
            style={{ display: 'none' }}
          />
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: `1px solid ${ZH.line}`,
              background: 'rgba(18,23,36,0.45)',
              fontFamily: ZH.mono,
              fontSize: 11,
              color: ZH.textDim,
              letterSpacing: '0.04em',
            }}
          >
            {importStatus}
          </div>
          {pendingImport && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                <ExportMetric label="дни" value={pendingImport.preview.days} />
                <ExportMetric label="еда" value={pendingImport.preview.foodEntries} />
                <ExportMetric label="вода" value={pendingImport.preview.waterEntries} />
                <ExportMetric label="заметки" value={pendingImport.preview.notes} />
                <ExportMetric label="база" value={pendingImport.preview.foods + pendingImport.preview.meals} />
                <ExportMetric label="виджеты" value={pendingImport.preview.widgets} />
                <ExportMetric label="код" value={pendingImport.preview.fingerprint} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setPendingImport(null)
                    setImportStatus('импорт отменён')
                  }}
                  disabled={busy}
                  style={{
                    all: 'unset',
                    cursor: busy ? 'wait' : 'pointer',
                    height: 40,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: `1px solid ${ZH.line}`,
                    background: 'rgba(148,178,224,0.04)',
                    color: ZH.textDim,
                    fontFamily: ZH.mono,
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                  }}
                >
                  сбросить
                </button>
                <button
                  type="button"
                  onClick={handleApplyImport}
                  disabled={busy}
                  style={{
                    all: 'unset',
                    cursor: busy ? 'wait' : 'pointer',
                    height: 40,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: `1px solid ${busy ? ZH.line : accentAlpha(0.45)}`,
                    background: busy
                      ? 'rgba(148,178,224,0.04)'
                      : `linear-gradient(180deg, ${accentAlpha(0.35)}, ${accentAlpha(0.14)})`,
                    color: busy ? ZH.textFaint : ZH.accent,
                    fontFamily: ZH.mono,
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxSizing: 'border-box',
                  }}
                >
                  применить импорт
                </button>
              </div>
            </>
          )}
          {importSummary && !pendingImport && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <ExportMetric label="дни" value={importSummary.days} />
              <ExportMetric label="еда" value={importSummary.foodEntries} />
              <ExportMetric label="вода" value={importSummary.waterEntries} />
              <ExportMetric label="заметки" value={importSummary.notes} />
              <ExportMetric label="база" value={importSummary.foods + importSummary.meals} />
              <ExportMetric label="виджеты" value={importSummary.widgets} />
              <ExportMetric label="код" value={importSummary.fingerprint} />
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}

function QualityMapPanel() {
  return (
    <Panel style={{ padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SysLabel color={ZH.textFaint}>{QUALITY_MAP_TITLE}</SysLabel>
          <span style={{ fontSize: 12, color: ZH.textDim, lineHeight: 1.4 }}>
            {QUALITY_MAP_SUMMARY}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {QUALITY_MAP_ROWS.map((row) => (
            <QualityMapRowView key={row.command} tone={row.tone} label={row.label} command={row.command}>
              {row.text}
            </QualityMapRowView>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function QualityMapRowView({
  tone,
  label,
  command,
  children,
}: {
  tone: QualityMapTone
  label: string
  command: string
  children: string
}) {
  return (
    <div
      style={{
        minHeight: 48,
        padding: '8px 10px',
        borderRadius: 10,
        border: `1px solid ${qualityMapBorder(tone)}`,
        background: qualityMapBackground(tone),
        display: 'grid',
        gridTemplateColumns: '88px 1fr',
        gap: 9,
        alignItems: 'center',
        boxSizing: 'border-box',
      }}
    >
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: qualityMapColor(tone),
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <span
          style={{
            color: ZH.textFaint,
            fontFamily: ZH.mono,
            fontSize: 9,
            letterSpacing: '0.02em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {command}
        </span>
      </span>
      <span style={{ minWidth: 0, fontSize: 12, lineHeight: 1.4, color: ZH.textDim }}>
        {children}
      </span>
    </div>
  )
}

function qualityMapColor(tone: QualityMapTone): string {
  if (tone === 'ai') return ZH.warn
  if (tone === 'food') return FOOD_HUE
  if (tone === 'gate') return ZH.accent
  return ZH.textDim
}

function qualityMapBorder(tone: QualityMapTone): string {
  if (tone === 'ai') return mixAlpha(ZH.warn, 30)
  if (tone === 'food') return mixAlpha(FOOD_HUE, 30)
  if (tone === 'gate') return accentAlpha(0.28)
  return ZH.line
}

function qualityMapBackground(tone: QualityMapTone): string {
  if (tone === 'ai') return mixAlpha(ZH.warn, 7)
  if (tone === 'food') return mixAlpha(FOOD_HUE, 7)
  if (tone === 'gate') return accentAlpha(0.05)
  return 'rgba(148,178,224,0.04)'
}

function AppReadinessPanel({ backupStatus }: { backupStatus: DataBackupStatus }) {
  const report = buildAppReadinessReport(backupStatus)
  return (
    <Panel style={{ padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SysLabel color={ZH.textFaint}>{report.title}</SysLabel>
          <span style={{ fontSize: 12, color: ZH.textDim, lineHeight: 1.4 }}>
            {report.summary}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {report.rows.map((row, index) => (
            <AppReadinessRowView key={`${row.tone}_${index}`} tone={row.tone} label={row.label}>
              {row.text}
            </AppReadinessRowView>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function AppReadinessRowView({
  tone,
  label,
  children,
}: {
  tone: AppReadinessTone
  label: string
  children: string
}) {
  return (
    <div
      style={{
        minHeight: 38,
        padding: '8px 10px',
        borderRadius: 10,
        border: `1px solid ${appReadinessBorder(tone)}`,
        background: appReadinessBackground(tone),
        display: 'grid',
        gridTemplateColumns: '84px 1fr',
        gap: 9,
        alignItems: 'center',
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: appReadinessColor(tone),
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span style={{ minWidth: 0, fontSize: 12, lineHeight: 1.4, color: ZH.textDim }}>
        {children}
      </span>
    </div>
  )
}

function appReadinessColor(tone: AppReadinessTone): string {
  if (tone === 'ok') return ZH.accent
  if (tone === 'warn') return ZH.warn
  return ZH.textDim
}

function appReadinessBorder(tone: AppReadinessTone): string {
  if (tone === 'ok') return accentAlpha(0.24)
  if (tone === 'warn') return mixAlpha(ZH.warn, 30)
  return ZH.line
}

function appReadinessBackground(tone: AppReadinessTone): string {
  if (tone === 'ok') return accentAlpha(0.05)
  if (tone === 'warn') return mixAlpha(ZH.warn, 7)
  return 'rgba(148,178,224,0.04)'
}

function StorageLocationPanel() {
  const status = currentDataStorageStatus()
  return (
    <Panel style={{ padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <SysLabel color={ZH.textFaint}>{status.title}</SysLabel>
            <span style={{ fontSize: 12, color: ZH.textDim, lineHeight: 1.4 }}>
              {status.summary}
            </span>
          </div>
          <span
            style={{
              flexShrink: 0,
              fontFamily: ZH.mono,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.12em',
              color: storageLocationColor('primary'),
              textTransform: 'uppercase',
            }}
          >
            {status.kind}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {status.rows.map((row, index) => (
            <StorageLocationRow key={`${row.tone}_${index}`} tone={row.tone} label={row.label}>
              {row.text}
            </StorageLocationRow>
          ))}
        </div>
      </div>
    </Panel>
  )
}

function StorageLocationRow({
  tone,
  label,
  children,
}: {
  tone: DataStorageTone
  label: string
  children: string
}) {
  return (
    <div
      style={{
        minHeight: 40,
        padding: '8px 10px',
        borderRadius: 10,
        border: `1px solid ${storageLocationBorder(tone)}`,
        background: storageLocationBackground(tone),
        display: 'grid',
        gridTemplateColumns: '76px 1fr',
        gap: 9,
        alignItems: 'center',
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: storageLocationColor(tone),
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span style={{ minWidth: 0, fontSize: 12, lineHeight: 1.4, color: ZH.textDim }}>
        {children}
      </span>
    </div>
  )
}

function storageLocationColor(tone: DataStorageTone): string {
  if (tone === 'primary') return ZH.accent
  if (tone === 'fallback') return ZH.warn
  return ZH.textDim
}

function storageLocationBorder(tone: DataStorageTone): string {
  if (tone === 'primary') return accentAlpha(0.24)
  if (tone === 'fallback') return mixAlpha(ZH.warn, 30)
  return ZH.line
}

function storageLocationBackground(tone: DataStorageTone): string {
  if (tone === 'primary') return accentAlpha(0.05)
  if (tone === 'fallback') return mixAlpha(ZH.warn, 7)
  return 'rgba(148,178,224,0.04)'
}

function AiPrivacyPanel() {
  return (
    <Panel style={{ padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SysLabel color={ZH.textFaint}>{AI_PRIVACY_TITLE}</SysLabel>
          <span style={{ fontSize: 12, color: ZH.textDim, lineHeight: 1.4 }}>
            {AI_PRIVACY_SUMMARY}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {AI_PRIVACY_ROWS.map((row, index) => (
            <AiPrivacyRowView key={`${row.tone}_${index}`} tone={row.tone} label={row.label}>
              {row.text}
            </AiPrivacyRowView>
          ))}
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.45, color: ZH.textFaint }}>
          {AI_PRIVACY_NOTE}
        </div>
      </div>
    </Panel>
  )
}

function AiPrivacyRowView({
  tone,
  label,
  children,
}: {
  tone: AiPrivacyTone
  label: string
  children: string
}) {
  return (
    <div
      style={{
        minHeight: 40,
        padding: '8px 10px',
        borderRadius: 10,
        border: `1px solid ${aiPrivacyBorder(tone)}`,
        background: aiPrivacyBackground(tone),
        display: 'grid',
        gridTemplateColumns: '76px 1fr',
        gap: 9,
        alignItems: 'center',
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: aiPrivacyColor(tone),
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span style={{ minWidth: 0, fontSize: 12, lineHeight: 1.4, color: ZH.textDim }}>
        {children}
      </span>
    </div>
  )
}

function aiPrivacyColor(tone: AiPrivacyTone): string {
  if (tone === 'external') return ZH.warn
  if (tone === 'audit') return ZH.accent
  return ZH.textDim
}

function aiPrivacyBorder(tone: AiPrivacyTone): string {
  if (tone === 'external') return mixAlpha(ZH.warn, 32)
  if (tone === 'audit') return accentAlpha(0.24)
  return ZH.line
}

function aiPrivacyBackground(tone: AiPrivacyTone): string {
  if (tone === 'external') return mixAlpha(ZH.warn, 7)
  if (tone === 'audit') return accentAlpha(0.05)
  return 'rgba(148,178,224,0.04)'
}

function importPreviewLine(preview: ZhvushaImportPreview): string {
  return `${preview.days} дн. · еда ${preview.foodEntries} · вода ${preview.waterEntries} · заметки ${preview.notes} · код ${preview.fingerprint}`
}

function importSummaryLine(summary: ZhvushaImportSummary): string {
  return `${summary.days} дн. · еда ${summary.foodEntries} · вода ${summary.waterEntries} · заметки ${summary.notes} · код ${summary.fingerprint}`
}

function IntegrityGroupRow({ group }: { group: DataIntegrityGroup }) {
  return (
    <div
      style={{
        minHeight: 48,
        padding: '8px 10px',
        borderRadius: 10,
        border: `1px solid ${mixAlpha(ZH.warn, 28)}`,
        background: mixAlpha(ZH.warn, 6),
        display: 'grid',
        gridTemplateColumns: '74px 1fr auto',
        gap: 9,
        alignItems: 'center',
        boxSizing: 'border-box',
      }}
    >
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: ZH.warn,
          whiteSpace: 'nowrap',
        }}
      >
        {group.scope}
      </span>
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span
          style={{
            color: ZH.text,
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {group.label}
        </span>
        <span
          style={{
            color: ZH.textDim,
            fontSize: 11,
            lineHeight: 1.35,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {group.nextStep}
        </span>
      </span>
      <span
        style={{
          color: ZH.warn,
          fontFamily: ZH.mono,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.06em',
        }}
      >
        {group.count}
      </span>
    </div>
  )
}

function IntegrityIssueRow({ issue }: { issue: DataIntegrityIssue }) {
  return (
    <div
      style={{
        minHeight: 42,
        padding: '8px 10px',
        borderRadius: 10,
        border: `1px solid ${mixAlpha(ZH.warn, 32)}`,
        background: mixAlpha(ZH.warn, 7),
        display: 'grid',
        gridTemplateColumns: 'auto 1fr',
        gap: 9,
        alignItems: 'center',
        boxSizing: 'border-box',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: ZH.warn,
          boxShadow: `0 0 10px ${mixAlpha(ZH.warn, 55)}`,
        }}
      />
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span
          style={{
            color: ZH.text,
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {issue.title}
        </span>
        <span
          style={{
            color: ZH.textDim,
            fontFamily: ZH.mono,
            fontSize: 10,
            letterSpacing: '0.04em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {issue.detail}
        </span>
      </span>
    </div>
  )
}

function BackupStatusPanel({ status }: { status: DataBackupStatus }) {
  const exportAge = daysSince(status.lastExportedAt)
  const exportFresh = exportAge !== null && exportAge <= 7
  const exportOld = exportAge !== null && exportAge > 14
  const exportColor = exportOld ? ZH.warn : exportFresh ? ZH.accent : ZH.textDim

  return (
    <Panel style={{ padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <SysLabel color={ZH.textFaint}>Резервная копия</SysLabel>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              color: exportColor,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            {backupAgeLabel(exportAge)}
          </span>
        </div>
        <BackupLine
          label="последний экспорт"
          value={status.lastExportedAt ? formatBackupDate(status.lastExportedAt) : 'ещё нет'}
          color={exportColor}
        />
        <BackupLine
          label="в копии"
          value={status.lastExportCounts ? backupCountsLine(status.lastExportCounts) : '—'}
          color={ZH.textDim}
        />
        <BackupLine
          label="код копии"
          value={status.lastExportFingerprint ?? '—'}
          color={ZH.textDim}
        />
        <BackupLine
          label="последний импорт"
          value={status.lastImportedAt ? formatBackupDate(status.lastImportedAt) : 'ещё нет'}
          color={ZH.textDim}
        />
        <BackupLine
          label="код импорта"
          value={status.lastImportFingerprint ?? '—'}
          color={ZH.textDim}
        />
      </div>
    </Panel>
  )
}

function BackupLine({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          color: ZH.textFaint,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span
        style={{
          minWidth: 0,
          color,
          fontFamily: ZH.mono,
          fontSize: 10,
          letterSpacing: '0.04em',
          textAlign: 'right',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function backupCountsLine(counts: DataBackupCounts): string {
  return `${counts.days} дн. · еда ${counts.foodEntries} · вода ${counts.waterEntries} · заметки ${counts.notes}`
}

function backupAgeLabel(days: number | null): string {
  if (days === null) return 'нет копии'
  if (days === 0) return 'сегодня'
  if (days === 1) return 'вчера'
  return `${days}д назад`
}

function formatBackupDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function daysSince(value: string | null): number | null {
  if (!value) return null
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  const diff = Date.now() - date.getTime()
  if (diff < 0) return 0
  return Math.floor(diff / 86_400_000)
}

function ExportMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div
      style={{
        minWidth: 0,
        height: 40,
        borderRadius: 10,
        border: `1px solid ${ZH.line}`,
        background: 'rgba(148,178,224,0.04)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 12,
          fontWeight: 600,
          color: ZH.text,
          letterSpacing: '0.06em',
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 8,
          color: ZH.textFaint,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  )
}

function parseKcal(value: string): number | null {
  const n = Math.round(Number(value.replace(',', '.')))
  if (!Number.isFinite(n) || n <= 0 || n > 10000) return null
  return n
}

function parseMl(value: string): number | null {
  const n = Math.round(Number(value.replace(',', '.')))
  if (!Number.isFinite(n) || n <= 0 || n > 5000) return null
  return n
}
