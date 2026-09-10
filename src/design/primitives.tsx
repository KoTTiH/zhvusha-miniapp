import type { CSSProperties, ReactNode } from 'react'
import { ZH, accentAlpha, mixAlpha } from './tokens'

type PanelProps = {
  children: ReactNode
  style?: CSSProperties
  glow?: boolean
  className?: string
}

export function Panel({ children, style, glow = false, className }: PanelProps) {
  return (
    <div
      className={className}
      style={{
        background: ZH.panel,
        border: `1px solid ${ZH.line}`,
        borderRadius: 14,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        boxShadow: glow ? ZH.glow : ZH.softGlow,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

type SysLabelProps = {
  children: ReactNode
  color?: string
  style?: CSSProperties
}

export function SysLabel({ children, color = ZH.textDim, style }: SysLabelProps) {
  return (
    <span
      style={{
        fontFamily: ZH.mono,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color,
        ...style,
      }}
    >
      {children}
    </span>
  )
}

type BracketsProps = {
  color?: string
  size?: number
  inset?: number
}

export function Brackets({ color = ZH.lineHi, size = 10, inset = 6 }: BracketsProps) {
  const base: CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    borderColor: color,
    borderStyle: 'solid',
  }
  return (
    <>
      <div style={{ ...base, top: inset, left: inset, borderWidth: '1px 0 0 1px' }} />
      <div style={{ ...base, top: inset, right: inset, borderWidth: '1px 1px 0 0' }} />
      <div style={{ ...base, bottom: inset, left: inset, borderWidth: '0 0 1px 1px' }} />
      <div style={{ ...base, bottom: inset, right: inset, borderWidth: '0 1px 1px 0' }} />
    </>
  )
}

type ActivityBarProps = {
  value: number
  color?: string
  height?: number
  trackOpacity?: number
}

/**
 * Шкала активности — отображает относительный уровень активности от 0 до 100.
 * Не очки, не XP — только отражение факта без назидательной окраски.
 */
export function ActivityBar({
  value,
  color = ZH.accent,
  height = 4,
  trackOpacity = 0.08,
}: ActivityBarProps) {
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div
      style={{
        height,
        borderRadius: 999,
        background: `rgba(148,178,224,${trackOpacity})`,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${mixAlpha(color, 53)}, ${color})`,
          boxShadow: `0 0 10px ${mixAlpha(color, 60)}`,
          borderRadius: 999,
        }}
      />
    </div>
  )
}

type ZHScreenProps = {
  children: ReactNode
  style?: CSSProperties
}

export function ZHScreen({ children, style }: ZHScreenProps) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: ZH.bgGradient,
        color: ZH.text,
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            `linear-gradient(180deg, ${accentAlpha(0.06)} 0%, rgba(0,0,0,0) 20%),` +
            'linear-gradient(0deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0) 30%)',
        }}
      />
      {children}
    </div>
  )
}

type SystemTopStripeProps = {
  label?: string
  right?: ReactNode
}

export function SystemTopStripe({ label = 'SYSTEM', right }: SystemTopStripeProps) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 20px 8px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 1,
            background: ZH.accent,
            boxShadow: `0 0 8px ${ZH.accent}`,
          }}
        />
        <SysLabel color={ZH.textDim}>{label}</SysLabel>
      </div>
      {right}
    </div>
  )
}
