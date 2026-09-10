import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { ZH, accentAlpha } from './tokens'

export type ZHTab = 'system' | 'assistant' | 'map'

type Props = {
  active: ZHTab
  onChange: (tab: ZHTab) => void
}

const TABS: Array<{ id: ZHTab; label: string }> = [
  { id: 'system', label: 'System' },
  { id: 'assistant', label: 'Жвуша' },
  { id: 'map', label: 'Карта' },
]

export function ZHTabBar({ active, onChange }: Props) {
  // Паблишим фактическую высоту таббара (с safe-area) в CSS-переменную,
  // чтобы BottomSheet/прочие фикс-элементы могли от неё отталкиваться и не
  // прятать контент под табами. Пока TabBar не смонтирован (редакторы на
  // весь экран) — переменная не задана, потребители используют fallback.
  const rootRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el) return
    const root = document.documentElement
    const update = () => {
      root.style.setProperty('--zh-tabbar-h', `${el.offsetHeight}px`)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--zh-tabbar-h')
    }
  }, [])

  return (
    <div
      ref={rootRef}
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        paddingTop: 10,
        background:
          'linear-gradient(180deg, rgba(8,9,15,0) 0%, rgba(8,9,15,0.9) 40%, #08090F 100%)',
        borderTop: `1px solid ${ZH.line}`,
        display: 'flex',
        justifyContent: 'center',
        gap: 'clamp(34px, 16vw, 86px)',
        fontFamily: ZH.mono,
        zIndex: 30,
        pointerEvents: 'none',
      }}
    >
      {TABS.map((t) => {
        const isActive = t.id === active
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              all: 'unset',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              width: 62,
              padding: '6px 0',
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: 5,
                border: `1px solid ${isActive ? ZH.accent : ZH.line}`,
                boxShadow: isActive ? `0 0 10px ${accentAlpha(0.5)}` : 'none',
                position: 'relative',
                background: isActive ? ZH.accentSoft : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TabGlyph id={t.id} color={isActive ? ZH.accent : ZH.textDim} />
            </div>
            <span
              style={{
                fontSize: 9,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                fontWeight: 500,
                color: isActive ? ZH.text : ZH.textFaint,
              } satisfies CSSProperties}
            >
              {t.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function TabGlyph({ id, color }: { id: ZHTab; color: string }) {
  const common = { stroke: color, strokeWidth: 1.2, fill: 'none' as const }
  if (id === 'system') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22">
        <polygon points="11,4 17,8 17,14 11,18 5,14 5,8" {...common} />
        <circle cx="11" cy="11" r="2" fill={color} stroke="none" />
      </svg>
    )
  }
  if (id === 'assistant') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22">
        <path d="M6.5 9.5c0-2.5 1.9-4.4 4.5-4.4s4.5 1.9 4.5 4.4c0 2.7-2 4.6-4.5 4.6H8.5l-2.5 2v-6.6Z" {...common} />
        <path d="M8.4 9.8h5.2M8.4 12h3.4" {...common} />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 22 22">
      <rect x="5" y="5" width="3.5" height="3.5" {...common} />
      <rect x="9.5" y="5" width="3.5" height="3.5" {...common} />
      <rect x="14" y="5" width="3" height="3.5" {...common} />
      <rect x="5" y="9.5" width="3.5" height="3.5" fill={color} stroke="none" />
      <rect x="9.5" y="9.5" width="3.5" height="3.5" {...common} />
      <rect x="14" y="9.5" width="3" height="3.5" {...common} />
      <rect x="5" y="14" width="3.5" height="3" {...common} />
      <rect x="9.5" y="14" width="3.5" height="3" {...common} />
    </svg>
  )
}
