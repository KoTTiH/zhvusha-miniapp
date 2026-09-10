import { useEffect } from 'react'
import { ZH, accentAlpha } from '../design/tokens'
import { useCaloriesStore } from '../store/calories'

export function Toast() {
  const toast = useCaloriesStore((s) => s.toast)
  const dismissToast = useCaloriesStore((s) => s.dismissToast)

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(dismissToast, 3000)
    return () => window.clearTimeout(id)
  }, [toast, dismissToast])

  if (!toast) return null

  return (
    <div
      className="fixed inset-x-0 flex justify-center pointer-events-none z-40 px-4"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 80px)' }}
    >
      <div
        className="pointer-events-auto animate-fade-in max-w-full"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 16px',
          borderRadius: 12,
          background: 'rgba(18, 23, 36, 0.92)',
          border: `1px solid ${ZH.lineHi}`,
          boxShadow: `0 8px 24px rgba(0,0,0,0.45), 0 0 20px ${accentAlpha(0.15)}`,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: 1,
            background: ZH.accent,
            boxShadow: `0 0 8px ${ZH.accent}`,
            flexShrink: 0,
          }}
        />
        <span
          className="truncate"
          style={{
            fontSize: 13,
            color: ZH.text,
            fontFamily: ZH.mono,
            letterSpacing: '0.02em',
          }}
        >
          {toast.message}
        </span>
        {toast.undo && (
          <button
            type="button"
            onClick={() => {
              toast.undo?.()
              dismissToast()
            }}
            style={{
              all: 'unset',
              cursor: 'pointer',
              fontFamily: ZH.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: ZH.accent,
              flexShrink: 0,
              padding: '2px 6px',
            }}
          >
            Отмена
          </button>
        )}
      </div>
    </div>
  )
}
