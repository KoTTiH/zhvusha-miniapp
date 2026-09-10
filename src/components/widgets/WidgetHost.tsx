import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { ZH } from '../../design/tokens'
import { hapticImpact } from '../../lib/haptic'

const LONG_PRESS_MS = 450
const CONTROL_SIZE = 40

export type WidgetDropPlacement = 'before' | 'after'

/**
 * Обёртка одного виджета на главном экране. Long-press → переход в режим
 * редактирования. В режиме — справа сверху контролы порядка, drag-handle и удаление.
 */
export function WidgetHost({
  id,
  label,
  editing,
  canMoveUp = false,
  canMoveDown = false,
  dragging = false,
  dropPlacement = null,
  onEnterEditing,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragMove,
  onDragEnd,
  children,
}: {
  id: string
  label: string
  editing: boolean
  canMoveUp?: boolean
  canMoveDown?: boolean
  dragging?: boolean
  dropPlacement?: WidgetDropPlacement | null
  onEnterEditing: () => void
  onRemove: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onDragStart?: () => void
  onDragMove?: (clientX: number, clientY: number) => void
  onDragEnd?: () => void
  children: ReactNode
}) {
  const timerRef = useRef<number | null>(null)
  const firedRef = useRef(false)
  const dragPointerRef = useRef<number | null>(null)
  const widgetAriaLabel = editing
    ? `${label}: режим настройки`
    : `${label}: Enter или пробел — настроить виджеты`

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (editing) return
    if (isInteractiveTarget(event.target)) return
    firedRef.current = false
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      firedRef.current = true
      hapticImpact('medium')
      onEnterEditing()
    }, LONG_PRESS_MS)
  }

  const cancel = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!editing) return
    event.preventDefault()
    event.stopPropagation()
    dragPointerRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    hapticImpact('light')
    onDragStart?.()
  }

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragPointerRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    onDragMove?.(event.clientX, event.clientY)
  }

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (dragPointerRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    dragPointerRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    onDragEnd?.()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing) return
    if (isInteractiveTarget(event.target)) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      hapticImpact('medium')
      onEnterEditing()
    }
  }

  return (
    <div
      data-widget-id={id}
      role="group"
      aria-label={widgetAriaLabel}
      tabIndex={editing ? -1 : 0}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerMove={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'relative',
        outline: editing ? `1px dashed ${ZH.lineHi}` : 'none',
        outlineOffset: editing ? 4 : 0,
        borderRadius: 14,
        opacity: dragging ? 0.6 : 1,
        boxShadow:
          dropPlacement === 'before'
            ? `0 -3px 0 ${ZH.warn}`
            : dropPlacement === 'after'
              ? `0 3px 0 ${ZH.warn}`
              : 'none',
        transition: 'outline-offset 140ms ease, opacity 120ms ease, box-shadow 120ms ease',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {children}
      {editing && (
        <div
          style={{
            position: 'absolute',
            top: -10,
            right: -10,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            zIndex: 10,
          }}
        >
          <ControlButton label="Выше" disabled={!canMoveUp} onClick={onMoveUp}>
            ↑
          </ControlButton>
          <ControlButton label="Ниже" disabled={!canMoveDown} onClick={onMoveDown}>
            ↓
          </ControlButton>
          <ControlButton
            label="Перетащить виджет"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            dragHandle
          >
            ↕
          </ControlButton>
          <ControlButton label="Удалить виджет" danger onClick={onRemove}>
            ×
          </ControlButton>
        </div>
      )}
    </div>
  )
}

function ControlButton({
  label,
  disabled = false,
  danger = false,
  dragHandle = false,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  children,
}: {
  label: string
  disabled?: boolean
  danger?: boolean
  dragHandle?: boolean
  onClick?: () => void
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove?: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel?: (event: PointerEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        if (!disabled) onClick?.()
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (!disabled) onPointerDown?.(e)
      }}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{
        all: 'unset',
        cursor: disabled ? 'not-allowed' : dragHandle ? 'grab' : 'pointer',
        width: CONTROL_SIZE,
        height: CONTROL_SIZE,
        borderRadius: 999,
        background: danger ? ZH.warn : 'rgba(18,23,36,0.92)',
        border: danger ? `1px solid ${ZH.warn}` : `1px solid ${ZH.lineHi}`,
        color: danger ? ZH.bg : disabled ? ZH.textFaint : ZH.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: ZH.mono,
        fontSize: danger ? 16 : 13,
        fontWeight: 700,
        lineHeight: 1,
        opacity: disabled ? 0.4 : 1,
        boxShadow: danger
          ? `0 2px 6px rgba(0,0,0,0.5), 0 0 10px ${ZH.warn}`
          : '0 2px 6px rgba(0,0,0,0.45)',
        touchAction: dragHandle ? 'none' : 'manipulation',
      }}
    >
      {children}
    </button>
  )
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(target.closest('button, input, textarea, select, a, label, [contenteditable="true"]'))
}
