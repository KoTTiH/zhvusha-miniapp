import { ZH, accentAlpha } from '../design/tokens'
import type { FoodLogStatus } from '../types/calorie'

type Props = {
  status: FoodLogStatus
  compact?: boolean
  onAddFood?: () => void
  onSetStatus: (status: FoodLogStatus) => void
}

export function FoodLogStatusControls({
  status,
  compact = false,
  onAddFood,
  onSetStatus,
}: Props) {
  const copy = foodStatusCopy(status)
  if (compact) {
    return (
      <div style={compactWrapStyle}>
        <div style={compactTitleStyle}>{copy.title}</div>
        <button
          type="button"
          onClick={() => onSetStatus(status === 'no_food' ? 'unknown' : 'no_food')}
          style={compactActionStyle(status === 'no_food')}
        >
          еды не было
        </button>
      </div>
    )
  }

  return (
    <div style={fullWrapStyle}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ color: ZH.text, fontSize: 14, fontWeight: 560 }}>{copy.title}</span>
        <span style={{ color: ZH.textDim, fontSize: 12, lineHeight: 1.4 }}>{copy.text}</span>
      </div>
      <button type="button" onClick={onAddFood} style={fullPrimaryButtonStyle}>
        Добавить еду
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button
          type="button"
          onClick={() => onSetStatus(status === 'no_food' ? 'unknown' : 'no_food')}
          style={fullStatusButtonStyle(status === 'no_food')}
        >
          Еды не было
        </button>
        <button
          type="button"
          onClick={() => onSetStatus(status === 'not_logged' ? 'unknown' : 'not_logged')}
          style={fullStatusButtonStyle(status === 'not_logged')}
        >
          Не записывал
        </button>
      </div>
    </div>
  )
}

function foodStatusCopy(status: FoodLogStatus): { title: string; text: string } {
  if (status === 'no_food') {
    return {
      title: 'Отмечено: еды не было',
      text: 'Это явная отметка дня, не пустой дневник.',
    }
  }
  if (status === 'not_logged') {
    return {
      title: 'Отмечено: не записывал',
      text: 'Данные о питании за этот день остаются неизвестными.',
    }
  }
  return {
    title: 'Питание не записано',
    text: 'Не знаю, ел ты или нет. Можно отметить причину пустого дня.',
  }
}

const fullWrapStyle: React.CSSProperties = {
  borderTop: `1px solid ${ZH.line}`,
  paddingTop: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
}

const fullPrimaryButtonStyle: React.CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  height: 40,
  borderRadius: 10,
  border: `1px solid ${accentAlpha(0.42)}`,
  background: accentAlpha(0.16),
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: ZH.text,
  fontFamily: ZH.mono,
  fontSize: 10,
  fontWeight: 560,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
}

function fullStatusButtonStyle(active: boolean): React.CSSProperties {
  return {
    all: 'unset',
    cursor: 'pointer',
    minHeight: 38,
    borderRadius: 10,
    border: `1px solid ${active ? accentAlpha(0.46) : ZH.line}`,
    background: active ? accentAlpha(0.12) : ZH.panel,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 10px',
    color: active ? ZH.text : ZH.textDim,
    fontFamily: ZH.mono,
    fontSize: 10,
    fontWeight: 520,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    textAlign: 'center',
    boxSizing: 'border-box',
  }
}

const compactWrapStyle: React.CSSProperties = {
  borderTop: `1px solid ${ZH.line}`,
  paddingTop: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 7,
}

const compactTitleStyle: React.CSSProperties = {
  fontFamily: ZH.mono,
  fontSize: 9,
  fontWeight: 520,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: ZH.textFaint,
}

function compactActionStyle(active: boolean): React.CSSProperties {
  return {
    all: 'unset',
    cursor: 'pointer',
    minHeight: 32,
    borderRadius: 8,
    border: `1px solid ${active ? accentAlpha(0.5) : ZH.line}`,
    background: active ? accentAlpha(0.14) : 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 6px',
    color: active ? ZH.text : ZH.textDim,
    fontFamily: ZH.mono,
    fontSize: 9,
    fontWeight: 520,
    lineHeight: 1.1,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    textAlign: 'center',
    boxSizing: 'border-box',
    whiteSpace: 'normal',
  }
}
