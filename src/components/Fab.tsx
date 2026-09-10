import { useEffect, useRef, useState, type RefObject } from 'react'
import { FOOD_HUE, ZH, accentAlpha, mixAlpha } from '../design/tokens'

type FabStackProps = {
  onAdd: (tab: 'food' | 'note') => void
  onDayVoice?: (action: 'open' | 'hold-start' | 'hold-stop') => void
  dayVoiceActive?: boolean
  sheetOpen: boolean
  plusActive?: boolean
  onClose: () => void
  raised?: boolean
}

const DAY_VOICE_HOLD_MS = 420
const FAB_DARK_TEXT = ZH.bg
const FAB_GROUP_GLOW = `drop-shadow(0 0 20px ${accentAlpha(0.34)})`
const FAB_BUTTON_SHADOW =
  `0 0 0 1px ${accentAlpha(0.22)} inset, ` +
  `0 0 18px ${accentAlpha(0.3)}`

/**
 * Глобальный FAB. Одиночная кнопка «+», по тапу раскрывает два
 * круглых шорткута — «еда» и «заметка». Повторный тап (или тап вне
 * меню) сворачивает.
 */
export function FabStack({
  onAdd,
  onDayVoice,
  dayVoiceActive = false,
  sheetOpen,
  plusActive = sheetOpen,
  onClose,
  raised = false,
}: FabStackProps) {
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const dayVoiceHoldTimerRef = useRef<number | null>(null)
  const dayVoiceHeldRef = useRef(false)
  const dayVoiceRecordingRef = useRef(false)
  useDockUnderKeyboard(rootRef)

  useEffect(() => {
    if (!expanded || sheetOpen) return undefined
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && rootRef.current?.contains(target)) return
      setExpanded(false)
    }
    window.addEventListener('pointerdown', closeOnOutsidePointer, { capture: true })
    return () => window.removeEventListener('pointerdown', closeOnOutsidePointer, { capture: true })
  }, [expanded, sheetOpen])

  const collapseAnd = (action: () => void) => () => {
    setExpanded(false)
    action()
  }

  const toggle = () => {
    if (sheetOpen) {
      onClose()
      return
    }
    setExpanded((v) => !v)
  }

  const clearDayVoiceHold = () => {
    if (dayVoiceHoldTimerRef.current !== null) {
      window.clearTimeout(dayVoiceHoldTimerRef.current)
      dayVoiceHoldTimerRef.current = null
    }
  }

  const startDayVoiceHold = () => {
    if (!onDayVoice || sheetOpen) return
    dayVoiceHeldRef.current = false
    dayVoiceRecordingRef.current = false
    clearDayVoiceHold()
    dayVoiceHoldTimerRef.current = window.setTimeout(() => {
      dayVoiceHoldTimerRef.current = null
      dayVoiceHeldRef.current = true
      dayVoiceRecordingRef.current = true
      setExpanded(false)
      onDayVoice('hold-start')
    }, DAY_VOICE_HOLD_MS)
  }

  const finishDayVoiceHold = () => {
    clearDayVoiceHold()
    if (!dayVoiceRecordingRef.current) return
    dayVoiceRecordingRef.current = false
    onDayVoice?.('hold-stop')
  }

  const handleDayVoiceClick = () => {
    clearDayVoiceHold()
    if (dayVoiceHeldRef.current) {
      dayVoiceHeldRef.current = false
      return
    }
    setExpanded(false)
    onDayVoice?.('open')
  }

  return (
    <>
      <div
        ref={rootRef}
        className="fixed right-4 flex flex-col items-end gap-3 z-[25]"
        style={{
          bottom: raised
            ? 'calc(env(safe-area-inset-bottom) + 80px)'
            : 'calc(env(safe-area-inset-bottom) + 20px)',
          pointerEvents: 'none',
          transform: 'translate3d(0, 0, 0)',
          transition: 'none',
          willChange: 'transform',
        }}
      >
        <SatelliteButton
          visible={expanded && !sheetOpen}
          label="заметка"
          background={`radial-gradient(circle at 30% 30%, ${accentAlpha(0.95)}, ${accentAlpha(0.6)})`}
          borderColor={ZH.accent}
          glowColor={accentAlpha(0.4)}
          onClick={collapseAnd(() => onAdd('note'))}
          delay={40}
          glyph={<NoteGlyph />}
        />
        <SatelliteButton
          visible={expanded && !sheetOpen}
          label="еда"
          background={`radial-gradient(circle at 30% 30%, ${mixAlpha(FOOD_HUE, 95)}, ${mixAlpha(FOOD_HUE, 60)})`}
          borderColor={FOOD_HUE}
          glowColor={mixAlpha(FOOD_HUE, 40)}
          onClick={collapseAnd(() => onAdd('food'))}
          delay={0}
          glyph={<FoodGlyph />}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            filter: FAB_GROUP_GLOW,
          }}
        >
          {onDayVoice && !sheetOpen && (
            <button
              type="button"
              onClick={handleDayVoiceClick}
              onPointerDown={startDayVoiceHold}
              onPointerUp={finishDayVoiceHold}
              onPointerCancel={finishDayVoiceHold}
              onPointerLeave={finishDayVoiceHold}
              aria-label="быстрая запись голосом"
              aria-pressed={dayVoiceActive}
              style={{
                all: 'unset',
                cursor: 'pointer',
                pointerEvents: 'auto',
                height: 44,
                minWidth: 58,
                padding: '0 12px',
                borderRadius: 999,
                border: `1px solid ${ZH.accent}`,
                background: `radial-gradient(circle at 30% 30%, ${accentAlpha(0.95)}, ${accentAlpha(0.6)})`,
                boxShadow: FAB_BUTTON_SHADOW,
                color: FAB_DARK_TEXT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              }}
            >
              <DayVoiceGlyph />
              <span
                style={{
                  fontFamily: ZH.mono,
                  fontSize: 9,
                  fontWeight: 500,
                  letterSpacing: '0.12em',
                }}
              >
                день
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={toggle}
            aria-label={sheetOpen ? 'закрыть' : expanded ? 'свернуть' : 'добавить'}
            style={{
              all: 'unset',
              cursor: 'pointer',
              pointerEvents: 'auto',
              height: 56,
              width: 56,
              borderRadius: 999,
              background: `radial-gradient(circle at 30% 30%, ${accentAlpha(0.95)}, ${accentAlpha(0.6)})`,
              border: `1px solid ${ZH.accent}`,
              boxShadow: FAB_BUTTON_SHADOW,
              color: FAB_DARK_TEXT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
              transform: expanded || plusActive ? 'rotate(45deg)' : 'rotate(0deg)',
            }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M5 12h14" />
              <path
                d="M12 5v14"
                style={{
                  transformOrigin: '12px 12px',
                  transform: 'scaleY(1)',
                }}
              />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}

function useDockUnderKeyboard(ref: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const node = ref.current
    if (!node) return

    const vv = window.visualViewport
    let baseHeight = Math.max(window.innerHeight, vv?.height ?? window.innerHeight)
    let raf = 0

    const apply = () => {
      raf = 0
      baseHeight = Math.max(baseHeight, window.innerHeight, vv?.height ?? window.innerHeight)
      const visualBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
      const inset = Math.max(0, baseHeight - visualBottom)
      const keyboardLikelyOpen = inset > 80 || (isCoarsePointer() && isEditableActive())
      const offset = keyboardLikelyOpen ? Math.max(inset, window.innerHeight * 0.45) : 0
      node.style.transform = `translate3d(0, ${Math.round(offset)}px, 0)`
    }

    const schedule = () => {
      if (raf) window.cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(apply)
    }

    apply()
    vv?.addEventListener('resize', schedule)
    vv?.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    window.addEventListener('focusin', schedule)
    window.addEventListener('focusout', schedule)
    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      vv?.removeEventListener('resize', schedule)
      vv?.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      window.removeEventListener('focusin', schedule)
      window.removeEventListener('focusout', schedule)
      node.style.transform = 'translate3d(0, 0, 0)'
    }
  }, [ref])
}

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
}

function isEditableActive(): boolean {
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  return Boolean(active.closest('input, textarea, select, [contenteditable="true"]'))
}

function SatelliteButton({
  visible,
  label,
  background,
  borderColor,
  glowColor,
  onClick,
  delay,
  glyph,
}: {
  visible: boolean
  label: string
  background: string
  borderColor: string
  glowColor: string
  onClick: () => void
  delay: number
  glyph: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.6)',
        transition: `opacity 180ms ease ${delay}ms, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1) ${delay}ms`,
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: ZH.text,
          background: 'rgba(18, 23, 36, 0.85)',
          padding: '5px 10px',
          borderRadius: 999,
          border: `1px solid ${ZH.lineHi}`,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        style={{
          all: 'unset',
          cursor: 'pointer',
          height: 44,
          width: 44,
          borderRadius: 999,
          background,
          border: `1px solid ${borderColor}`,
          boxShadow: `0 4px 12px rgba(0,0,0,0.4), 0 0 16px ${glowColor}`,
          color: '#06131F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {glyph}
      </button>
    </div>
  )
}

function FoodGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      {/* Тарелка-круг с «дымком» */}
      <circle cx="12" cy="14" r="7" stroke="#06131F" strokeWidth="1.6" />
      <path
        d="M9 7c0-1.5 1-2.5 1-4 M12 7c0-1.5 1-2.5 1-4 M15 7c0-1.5 1-2.5 1-4"
        stroke="#06131F"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function NoteGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 4h8l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
        stroke="#06131F"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M15 4v4h4" stroke="#06131F" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M9 13h7 M9 16h5"
        stroke="#06131F"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function DayVoiceGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 18v3" strokeLinecap="round" />
    </svg>
  )
}
