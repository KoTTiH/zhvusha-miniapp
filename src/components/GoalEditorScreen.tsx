import { useEffect, useMemo, useRef, useState } from 'react'
import { Brackets, SysLabel } from '../design/primitives'
import { FOOD_HUE, ZH, accentAlpha } from '../design/tokens'
import { KCAL_PER_G } from '../lib/nutrition'
import { isInsideTelegram, subscribeBackButton } from '../lib/tma'
import { useCaloriesStore } from '../store/calories'
import type { Goal, TdeeProfile } from '../types/calorie'

const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Сидячая' },
  { value: 1.375, label: 'Лёгкая' },
  { value: 1.55, label: 'Средняя' },
  { value: 1.725, label: 'Высокая' },
  { value: 1.9, label: 'Макс.' },
] as const

const MODIFIERS = [
  { value: 0, label: 'Держать' },
  { value: -500, label: 'Худеть' },
  { value: 300, label: 'Набирать' },
] as const

const DEFAULT_PROFILE: TdeeProfile = {
  sex: 'm',
  age: 30,
  weight: 70,
  height: 175,
  activity: 1.375,
  modifier: 0,
}

function computeTdee(p: TdeeProfile): number {
  const bmr = p.sex === 'm'
    ? 10 * p.weight + 6.25 * p.height - 5 * p.age + 5
    : 10 * p.weight + 6.25 * p.height - 5 * p.age - 161
  return Math.round(bmr * p.activity + p.modifier)
}

type MacroKey = 'carbs' | 'fat' | 'protein'

const KCAL_PER: Record<MacroKey, number> = {
  carbs: KCAL_PER_G.carbs,
  fat: KCAL_PER_G.fat,
  protein: KCAL_PER_G.protein,
}

export function GoalEditorScreen() {
  const goal = useCaloriesStore((s) => s.goal)
  const setGoal = useCaloriesStore((s) => s.setGoal)
  const close = useCaloriesStore((s) => s.closeGoalEditor)
  const insideTg = isInsideTelegram()

  const [draft, setDraft] = useState<Goal>(() => ({ ...goal }))
  const [tdeeOpen, setTdeeOpen] = useState(false)
  const [profile, setProfile] = useState<TdeeProfile>(() => goal.profile ?? DEFAULT_PROFILE)

  useEffect(() => subscribeBackButton(close), [close])

  const computed = computeTdee(profile)
  const profileValid =
    profile.age > 0 && profile.weight > 0 && profile.height > 0 && computed > 0

  const applyTdee = () => {
    if (!profileValid) return
    setDraft((d) => ({ ...d, kcal: computed, profile }))
  }

  const sum = draft.carbsPct + draft.fatPct + draft.proteinPct
  const sumOk = Math.abs(sum - 100) <= 1

  const grams = useMemo(() => computeGrams(draft), [draft])

  const setKcal = (v: number) => setDraft((d) => ({ ...d, kcal: Math.max(0, Math.round(v)) }))

  const setPct = (key: MacroKey, v: number) => {
    const pct = Math.max(0, Math.round(v))
    setDraft((d) => {
      if (key === 'carbs') return { ...d, carbsPct: pct }
      if (key === 'fat') return { ...d, fatPct: pct }
      return { ...d, proteinPct: pct }
    })
  }

  const setGrams = (key: MacroKey, g: number) => {
    if (draft.kcal <= 0) return
    const pct = Math.max(0, Math.round((g * KCAL_PER[key] / draft.kcal) * 100))
    setPct(key, pct)
  }

  const handleSave = async () => {
    await setGoal(draft)
    close()
  }

  const updateProfile = (patch: Partial<TdeeProfile>) =>
    setProfile((p) => ({ ...p, ...patch }))

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
          <SysLabel color={ZH.text}>Цель</SysLabel>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          aria-label="Сохранить"
          style={saveBtnStyle(true)}
        >
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#06131F',
            }}
          >
            Сохранить
          </span>
        </button>
      </header>

      <section style={{ ...panelStyle, gap: 12 }}>
        <Brackets color={ZH.lineHi} size={7} inset={4} />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={miniLabelStyle}>Калории в день</span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(8,9,15,0.55)',
              border: `1px solid ${ZH.line}`,
              borderRadius: 10,
              padding: '0 12px',
            }}
          >
            <NumberField
              value={draft.kcal}
              onChange={setKcal}
              style={{
                height: 40,
                width: '100%',
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: 16,
                color: ZH.text,
                fontFamily: ZH.mono,
              }}
            />
            <span
              style={{
                flexShrink: 0,
                fontSize: 11,
                color: ZH.textDim,
                fontFamily: ZH.mono,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              ккал
            </span>
          </div>
        </label>
        <button
          type="button"
          onClick={() => setTdeeOpen((v) => !v)}
          aria-expanded={tdeeOpen}
          style={{
            all: 'unset',
            cursor: 'pointer',
            fontFamily: ZH.mono,
            fontSize: 11,
            color: ZH.accent,
            letterSpacing: '0.06em',
            textAlign: 'left',
          }}
        >
          {tdeeOpen ? 'Свернуть калькулятор ▴' : 'Рассчитать автоматически ▾'}
        </button>
        {tdeeOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <Chip active={profile.sex === 'm'} onClick={() => updateProfile({ sex: 'm' })}>
                Мужчина
              </Chip>
              <Chip active={profile.sex === 'f'} onClick={() => updateProfile({ sex: 'f' })}>
                Женщина
              </Chip>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <MiniField
                label="Возраст"
                value={profile.age}
                onChange={(v) => updateProfile({ age: v })}
              />
              <MiniField
                label="Вес, кг"
                value={profile.weight}
                onChange={(v) => updateProfile({ weight: v })}
              />
              <MiniField
                label="Рост, см"
                value={profile.height}
                onChange={(v) => updateProfile({ height: v })}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ ...miniLabelStyle, textAlign: 'center' }}>Активность</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {ACTIVITY_LEVELS.map((a) => (
                  <Chip
                    key={a.value}
                    active={profile.activity === a.value}
                    onClick={() => updateProfile({ activity: a.value })}
                    small
                  >
                    {a.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ ...miniLabelStyle, textAlign: 'center' }}>Цель</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {MODIFIERS.map((m) => (
                  <Chip
                    key={m.value}
                    active={profile.modifier === m.value}
                    onClick={() => updateProfile({ modifier: m.value })}
                  >
                    {m.label}
                  </Chip>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={applyTdee}
              disabled={!profileValid}
              style={{
                all: 'unset',
                cursor: profileValid ? 'pointer' : 'not-allowed',
                height: 40,
                borderRadius: 10,
                textAlign: 'center',
                background: profileValid
                  ? `linear-gradient(180deg, ${accentAlpha(0.8)}, ${accentAlpha(0.53)})`
                  : 'rgba(148,178,224,0.06)',
                border: `1px solid ${profileValid ? ZH.accent : ZH.line}`,
                boxShadow: profileValid ? `0 0 14px ${accentAlpha(0.3)}` : 'none',
                opacity: profileValid ? 1 : 0.5,
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
                  color: profileValid ? '#06131F' : ZH.textDim,
                }}
              >
                Применить {computed} ккал
              </span>
            </button>
            <p
              style={{
                margin: 0,
                fontSize: 10,
                color: ZH.textFaint,
                textAlign: 'center',
                fontFamily: ZH.mono,
                letterSpacing: '0.06em',
              }}
            >
              Mifflin-St Jeor · BMR × активность + модификатор
            </p>
          </div>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            paddingLeft: 4,
            paddingRight: 4,
            minWidth: 0,
          }}
        >
          <SysLabel>Макронутриенты</SysLabel>
          <span
            style={{
              flexShrink: 0,
              fontSize: 11,
              fontFamily: ZH.mono,
              color: sumOk ? ZH.textDim : ZH.warn,
            }}
          >
            Σ {sum}% {sumOk ? '✓' : '(норм.)'}
          </span>
        </div>
        <div style={{ ...panelStyle, gap: 10 }}>
          <MacroRow
            label="Углеводы"
            pct={draft.carbsPct}
            grams={grams.carbsG}
            onPctChange={(v) => setPct('carbs', v)}
            onGramsChange={(v) => setGrams('carbs', v)}
          />
          <MacroRow
            label="Жиры"
            pct={draft.fatPct}
            grams={grams.fatG}
            onPctChange={(v) => setPct('fat', v)}
            onGramsChange={(v) => setGrams('fat', v)}
          />
          <MacroRow
            label="Белки"
            pct={draft.proteinPct}
            grams={grams.proteinG}
            onPctChange={(v) => setPct('protein', v)}
            onGramsChange={(v) => setGrams('protein', v)}
          />
        </div>
      </section>

      <p
        style={{
          margin: 0,
          paddingLeft: 4,
          fontSize: 11,
          color: ZH.textDim,
          fontFamily: ZH.mono,
          letterSpacing: '0.02em',
        }}
      >
        Значения — в процентах; при смене ккал граммы пересчитаются автоматически.
      </p>
    </main>
  )
}

function MacroRow({
  label,
  pct,
  grams,
  onPctChange,
  onGramsChange,
}: {
  label: string
  pct: number
  grams: number
  onPctChange: (v: number) => void
  onGramsChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <span
        style={{
          flexShrink: 0,
          width: 72,
          fontSize: 13,
          color: ZH.text,
          fontFamily: ZH.mono,
        }}
      >
        {label}
      </span>
      <NumInput value={pct} suffix="%" onChange={onPctChange} />
      <span style={{ flexShrink: 0, fontSize: 13, color: ZH.textFaint }}>≈</span>
      <NumInput value={grams} suffix="г" onChange={onGramsChange} />
    </div>
  )
}

function NumInput({
  value,
  suffix,
  onChange,
}: {
  value: number
  suffix: string
  onChange: (v: number) => void
}) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'rgba(8,9,15,0.55)',
        border: `1px solid ${ZH.line}`,
        borderRadius: 10,
        padding: '0 10px',
      }}
    >
      <NumberField
        value={value}
        onChange={onChange}
        style={{
          height: 34,
          width: '100%',
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: ZH.text,
          fontFamily: ZH.mono,
          fontSize: 13,
          textAlign: 'center',
        }}
      />
      <span style={{ flexShrink: 0, fontSize: 11, color: ZH.textDim, fontFamily: ZH.mono }}>
        {suffix}
      </span>
    </div>
  )
}

/**
 * Числовой инпут с локальным string-state. Причина — сломанный UX нативного
 * number-инпута: (1) при стирании «0» из props перезаписывает пустую строку
 * обратно в «0», убрать его невозможно; (2) браузерный select-all при фокусе
 * на мобиле мешает дописывать, а не заменять.
 *
 * Пока поле в фокусе — text живёт сам по себе. На blur синхронизируемся с
 * числом из props (если разошлись из-за округления извне).
 */
function NumberField({
  value,
  onChange,
  style,
}: {
  value: number
  onChange: (v: number) => void
  style?: React.CSSProperties
}) {
  const [text, setText] = useState(() => (value > 0 ? String(value) : ''))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (focusedRef.current) return
    setText(value > 0 ? String(value) : '')
  }, [value])

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={text}
      placeholder="0"
      onFocus={() => {
        focusedRef.current = true
      }}
      onBlur={() => {
        focusedRef.current = false
        setText(value > 0 ? String(value) : '')
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, '')
        setText(raw)
        onChange(raw === '' ? 0 : Number(raw))
      }}
      style={style}
    />
  )
}

function computeGrams(goal: Goal): { carbsG: number; fatG: number; proteinG: number } {
  return {
    carbsG: Math.round((goal.kcal * goal.carbsPct / 100) / KCAL_PER.carbs),
    fatG: Math.round((goal.kcal * goal.fatPct / 100) / KCAL_PER.fat),
    proteinG: Math.round((goal.kcal * goal.proteinPct / 100) / KCAL_PER.protein),
  }
}

function Chip({
  active,
  onClick,
  children,
  small = false,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  small?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        height: 34,
        width: '100%',
        boxSizing: 'border-box',
        padding: `0 ${small ? 4 : 10}px`,
        borderRadius: 10,
        background: active
          ? `linear-gradient(180deg, ${accentAlpha(0.5)}, ${accentAlpha(0.3)})`
          : 'rgba(8,9,15,0.55)',
        border: `1px solid ${active ? ZH.accent : ZH.line}`,
        boxShadow: active ? `0 0 12px ${accentAlpha(0.25)}` : 'none',
        color: active ? ZH.text : ZH.textDim,
        fontSize: small ? 11 : 12,
        fontFamily: ZH.mono,
        fontWeight: 500,
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  )
}

function MiniField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    // minWidth:0 — без него input держит intrinsic-ширину и колонка 1fr
    // вылазит за сетку на узких экранах (Telegram на iPhone SE).
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
      <span style={miniLabelStyle}>{label}</span>
      <NumberField
        value={value}
        onChange={onChange}
        style={{
          width: '100%',
          minWidth: 0,
          height: 40,
          background: 'rgba(8,9,15,0.55)',
          border: `1px solid ${ZH.line}`,
          borderRadius: 10,
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

const miniLabelStyle: React.CSSProperties = {
  fontFamily: ZH.mono,
  fontSize: 10,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: ZH.textDim,
}
