import { useRef, useState } from 'react'
import { ZH } from '../design/tokens'
import { hapticImpact, hapticSelection } from '../lib/haptic'

type Variant = 'default' | 'destructive'

export type SwipeAction = {
  label: string
  onTap: () => void
  variant?: Variant
}

type Props = {
  actions: SwipeAction[]
  children: React.ReactNode
  buttonWidth?: number
}

export function SwipeRow({ actions, children, buttonWidth = 80 }: Props) {
  const [dx, setDx] = useState(0)
  const [animating, setAnimating] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [exiting, setExiting] = useState(false)

  const stateRef = useRef<{
    pointerId: number | null
    startX: number
    startY: number
    startDx: number
    valid: boolean
    moved: boolean
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    startDx: 0,
    valid: false,
    moved: false,
  })

  const totalWidth = actions.length * buttonWidth
  const openDx = -totalWidth

  const onPointerDown = (e: React.PointerEvent) => {
    stateRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startDx: dx,
      valid: true,
      moved: false,
    }
    setAnimating(false)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const s = stateRef.current
    if (!s.valid || e.pointerId !== s.pointerId) return
    const dX = e.clientX - s.startX
    const dY = e.clientY - s.startY
    if (!s.moved) {
      if (Math.abs(dY) > 8 && Math.abs(dY) > Math.abs(dX)) {
        s.valid = false
        setAnimating(true)
        setDx(s.startDx)
        return
      }
      if (Math.abs(dX) < 6) return
      s.moved = true
    }
    const target = s.startDx + dX
    setDx(Math.min(0, Math.max(openDx - 30, target)))
  }

  const onPointerUp = () => {
    const s = stateRef.current
    if (!s.valid) return
    s.valid = false
    if (!s.moved) return

    setAnimating(true)
    const midpoint = openDx / 2
    if (dx < midpoint) {
      setDx(openDx)
      if (!revealed) hapticSelection()
      setRevealed(true)
    } else {
      setDx(0)
      setRevealed(false)
    }
  }

  const onPointerCancel = () => {
    stateRef.current.valid = false
    setAnimating(true)
    setDx(revealed ? openDx : 0)
  }

  const onContentClickCapture = (e: React.MouseEvent) => {
    if (revealed) {
      e.preventDefault()
      e.stopPropagation()
      setAnimating(true)
      setDx(0)
      setRevealed(false)
      return
    }
    if (stateRef.current.moved) {
      e.preventDefault()
      e.stopPropagation()
      stateRef.current.moved = false
    }
  }

  const handleActionTap = (action: SwipeAction) => {
    setExiting(true)
    hapticImpact('medium')
    window.setTimeout(() => {
      action.onTap()
    }, 220)
  }

  return (
    <div
      className="relative overflow-hidden"
      style={{
        opacity: exiting ? 0 : 1,
        transition: 'opacity 220ms ease-out',
      }}
    >
      <div
        className="absolute inset-y-0 right-0 flex"
        style={{ width: totalWidth, background: 'rgba(8,9,15,0.9)' }}
      >
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleActionTap(a)}
            className="h-full flex items-center justify-center"
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: buttonWidth,
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: ZH.mono,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: a.variant === 'destructive' ? ZH.warn : ZH.accent,
              borderLeft: i > 0 ? `1px solid ${ZH.line}` : 'none',
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClickCapture={onContentClickCapture}
        style={{
          transform: `translateX(${dx}px)`,
          transition: animating
            ? 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)'
            : 'none',
          touchAction: 'pan-y',
          background: 'rgba(18,23,36,0.45)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
