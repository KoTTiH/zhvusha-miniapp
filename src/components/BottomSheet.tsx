import { useEffect, useId, useRef, useState } from 'react'
import { ZH, accentAlpha } from '../design/tokens'

type Props = {
  open: boolean
  onClose: () => void
  title?: string
  right?: React.ReactNode
  swipeAnywhere?: boolean
  hideClose?: boolean
  ariaLabel?: string
  children: React.ReactNode
}

const CLOSE_THRESHOLD = 100
const DRAG_ACTIVATION = 6
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function BottomSheet({
  open,
  onClose,
  title,
  right,
  swipeAnywhere = false,
  hideClose = false,
  ariaLabel,
  children,
}: Props) {
  const titleId = useId()
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  const dragStartRef = useRef<{ y: number; pointerId: number } | null>(null)
  const takeOverRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  if (prevOpen !== open) {
    setPrevOpen(open)
    if (!open) setDragY(0)
  }

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusable = focusableElements(panelRef.current)
      if (focusable.length === 0) {
        e.preventDefault()
        panelRef.current?.focus({ preventScroll: true })
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return undefined
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const target = focusableElements(panel)[0] ?? panel
      target.focus({ preventScroll: true })
    })
    return () => {
      window.cancelAnimationFrame(frame)
      const previous = previousFocusRef.current
      previousFocusRef.current = null
      if (previous && document.contains(previous)) {
        previous.focus({ preventScroll: true })
      }
    }
  }, [open])

  const onPointerDown = (e: React.PointerEvent) => {
    // Не перехватываем тачи на кликабельных элементах — иначе браузер думает,
    // что это начало свайпа, и click-event не генерируется. Баг проявлялся
    // на кнопке «записать всё» внутри AiResultList.
    const target = e.target as HTMLElement | null
    if (target?.closest('button, input, textarea, select, a, [role="button"]')) return
    dragStartRef.current = { y: e.clientY, pointerId: e.pointerId }
    takeOverRef.current = false
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = dragStartRef.current
    if (!s || e.pointerId !== s.pointerId) return
    const dy = e.clientY - s.y
    if (dy <= 0) return
    if (!takeOverRef.current) {
      if (dy < DRAG_ACTIVATION) return
      if (swipeAnywhere) {
        const scrollTop = scrollRef.current?.scrollTop ?? 0
        if (scrollTop > 0) return
      }
      takeOverRef.current = true
      setDragging(true)
    }
    setDragY(Math.max(0, dy - DRAG_ACTIVATION))
  }

  const onPointerUp = () => {
    if (!dragStartRef.current) return
    dragStartRef.current = null
    if (takeOverRef.current) {
      setDragging(false)
      if (dragY > CLOSE_THRESHOLD) {
        onClose()
      } else {
        setDragY(0)
      }
    }
    takeOverRef.current = false
  }

  const onPointerCancel = () => {
    dragStartRef.current = null
    takeOverRef.current = false
    setDragging(false)
    setDragY(0)
  }

  const grabberHandlers = swipeAnywhere
    ? {}
    : {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
        style: { touchAction: 'none' as const },
      }

  const panelHandlers = swipeAnywhere
    ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
    : {}

  return (
    <>
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        aria-hidden="true"
        tabIndex={-1}
        className={`fixed inset-0 z-30 transition-opacity duration-[280ms] ease-out ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: open ? 'blur(4px)' : undefined,
          WebkitBackdropFilter: open ? 'blur(4px)' : undefined,
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        aria-hidden={!open}
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel ?? 'панель'}
        tabIndex={-1}
        {...panelHandlers}
        className={`fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl ${
          open ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          // Панель растягивается под контент, но не больше 85dvh.
          // Пустое пространство внизу при коротком содержимом — убирается.
          maxHeight: '85dvh',
          display: 'flex',
          flexDirection: 'column',
          transform: open ? `translateY(${dragY}px)` : undefined,
          transition: dragging
            ? 'none'
            : 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          background: 'rgba(18, 23, 36, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          border: `1px solid ${ZH.lineHi}`,
          borderBottom: 'none',
          boxShadow: `0 -12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px ${accentAlpha(0.12)}`,
          ...(swipeAnywhere ? { touchAction: 'none' as const } : {}),
        }}
      >
        <div
          {...grabberHandlers}
          className="flex justify-center cursor-grab active:cursor-grabbing"
          style={{ flexShrink: 0, paddingTop: 8, paddingBottom: 4 }}
        >
          <div
            style={{
              height: 4,
              width: 40,
              borderRadius: 999,
              background: 'rgba(148, 178, 224, 0.3)',
            }}
          />
        </div>
        {(title || right || !hideClose) && (
          <header
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 16px 8px',
            }}
          >
            {title && (
              <h2
                id={titleId}
                style={{
                  flex: 1,
                  fontFamily: ZH.mono,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: ZH.text,
                  margin: 0,
                }}
              >
                {title}
              </h2>
            )}
            {!title && <div style={{ flex: 1 }} aria-hidden />}
            {right}
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Закрыть"
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  height: 28,
                  width: 28,
                  borderRadius: 999,
                  border: `1px solid ${ZH.line}`,
                  color: ZH.textDim,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            )}
          </header>
        )}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: '6px 16px 0',
            // Нижний паддинг расчищает место под ZHTabBar (2 кнопки
            // System/Карта внизу) — он публикует свою высоту как
            // --zh-tabbar-h. Если таббара нет (редакторы на весь экран) —
            // fallback на чистый safe-area.
            paddingBottom:
              'calc(var(--zh-tabbar-h, env(safe-area-inset-bottom, 0px)) + 16px)',
            touchAction: 'pan-y',
            overscrollBehavior: 'contain',
          }}
        >
          {children}
        </div>
      </div>
    </>
  )
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.getAttribute('aria-hidden') === 'true') return false
    if (element.hasAttribute('disabled')) return false
    return element.tabIndex >= 0
  })
}
