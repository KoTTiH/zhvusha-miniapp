import { ZH, accentAlpha } from '../../design/tokens'
import { WIDGET_IDS } from '../../types/widget'
import type { WidgetId } from '../../types/widget'
import { BottomSheet } from '../BottomSheet'
import { WIDGET_REGISTRY } from './registry'

export function WidgetPicker({
  open,
  onClose,
  onToggle,
  activeTypes,
}: {
  open: boolean
  onClose: () => void
  onToggle: (type: WidgetId) => void
  /** Типы включённых виджетов. Тап по строке включает или выключает виджет. */
  activeTypes: Set<WidgetId>
}) {
  const ids = WIDGET_IDS
  return (
    <BottomSheet open={open} onClose={onClose} title="виджеты">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12 }}>
        {ids.length === 0 && (
          <div
            style={{
              padding: '24px 14px',
              textAlign: 'center',
              fontFamily: ZH.mono,
              fontSize: 12,
              color: ZH.textFaint,
              lineHeight: 1.5,
              letterSpacing: '0.04em',
            }}
          >
            пока нечего добавить
          </div>
        )}
        {ids.map((id) => {
          const entry = WIDGET_REGISTRY[id]
          if (!entry) return null
          const { meta } = entry
          const active = activeTypes.has(id)
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              aria-label={`${meta.title}. ${active ? 'включён. Нажми, чтобы выключить. ' : 'выключен. Нажми, чтобы включить. '}${meta.description}`}
              onClick={() => onToggle(id)}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '12px 14px',
                borderRadius: 10,
                border: `1px solid ${active ? accentAlpha(0.3) : ZH.line}`,
                background: active ? accentAlpha(0.05) : 'rgba(18,23,36,0.45)',
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: '4px 12px',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: ZH.mono,
                    fontSize: 13,
                    color: ZH.text,
                    fontWeight: 500,
                    letterSpacing: '0.04em',
                  }}
                >
                  {meta.title}
                </span>
                <span style={{ fontSize: 12, color: ZH.textDim, lineHeight: 1.4 }}>
                  {meta.description}
                </span>
              </div>
              <span
                style={{
                  width: 34,
                  height: 20,
                  borderRadius: 999,
                  border: `1px solid ${active ? ZH.accent : ZH.lineHi}`,
                  background: active ? accentAlpha(0.18) : 'rgba(8,9,15,0.28)',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 3,
                    left: active ? 17 : 3,
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: active ? ZH.accent : ZH.textFaint,
                    transition: 'left 160ms ease, background 160ms ease',
                  }}
                />
              </span>
            </button>
          )
        })}
      </div>
    </BottomSheet>
  )
}
