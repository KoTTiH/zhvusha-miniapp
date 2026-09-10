import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Panel, SysLabel } from '../design/primitives'
import { ZH } from '../design/tokens'
import { subscribeBackButton } from '../lib/tma'
import { useCaloriesStore } from '../store/calories'
import { useNotesStore, type DayOpenTarget } from '../store/notes'
import type { Note, DayKey } from '../types/note'
import { CaloriesSection } from './CaloriesSection'
import { NotesPanel } from './NotesPanel'
import { WaterSection } from './WaterSection'

type Props = {
  day: DayKey
  rect?: DOMRect
  initialScrollTarget?: DayOpenTarget | null
  onClose: () => void
}

const ANIMATION_MS = 160

export function ExpandedDayView({ day, rect, initialScrollTarget = null, onClose }: Props) {
  const [open, setOpen] = useState(false)
  const closingRef = useRef(false)
  const logRef = useRef<HTMLDivElement>(null)
  const openGoalEditor = useCaloriesStore((s) => s.openGoalEditor)

  const notes = useNotesStore((s) => s.notesByDay[day])
  const entries = useCaloriesStore((s) => s.entriesByDay[day])
  const water = useCaloriesStore((s) => s.waterByDay[day])
  const dayMeta = useCaloriesStore((s) => s.dayMetaByDay[day])
  const loadDayMeta = useCaloriesStore((s) => s.loadDayMeta)
  const deleteWater = useCaloriesStore((s) => s.deleteWater)
  const foods = useCaloriesStore((s) => s.foods)

  const log = useMemo(() => buildLog(notes, entries, foods, water), [notes, entries, foods, water])

  useEffect(() => {
    void loadDayMeta(day)
  }, [day, loadDayMeta])

  const handleCloseRef = useRef<() => void>(() => {})
  useEffect(() => {
    handleCloseRef.current = () => {
      if (closingRef.current) return
      closingRef.current = true
      setOpen(false)
      window.setTimeout(onClose, ANIMATION_MS + 20)
    }
  }, [onClose])

  useLayoutEffect(() => {
    let r2: number | null = null
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setOpen(true))
    })
    return () => {
      cancelAnimationFrame(r1)
      if (r2 !== null) cancelAnimationFrame(r2)
    }
  }, [])

  useEffect(() => {
    return subscribeBackButton(() => handleCloseRef.current())
  }, [])

  useEffect(() => {
    if (!open || initialScrollTarget !== 'log') return
    const id = window.setTimeout(() => {
      logRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' })
    }, 20)
    return () => window.clearTimeout(id)
  }, [initialScrollTarget, log.length, open])

  const handleDeleteWater = (id: string) => {
    void deleteWater(day, id)
  }

  const transformOrigin = rect
    ? `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`
    : '50% 50%'

  return (
    <div
      className="fixed z-20 overflow-hidden shadow-2xl"
      style={{
        inset: 0,
        opacity: open ? 1 : 0,
        transform: open
          ? 'translate3d(0, 0, 0) scale(1)'
          : 'translate3d(0, 8px, 0) scale(0.99)',
        transformOrigin,
        transition:
          `opacity ${ANIMATION_MS}ms cubic-bezier(0.2,0.8,0.2,1), ` +
          `transform ${ANIMATION_MS}ms cubic-bezier(0.2,0.8,0.2,1)`,
        background: ZH.bgGradient,
        color: ZH.text,
      }}
    >
      <div className="h-full flex flex-col">
        <header
          className="flex items-center justify-between shrink-0"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top) + 14px)',
            paddingLeft: 20,
            paddingRight: 20,
            paddingBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              onClick={() => handleCloseRef.current()}
              aria-label="закрыть"
              style={{
                all: 'unset',
                width: 28,
                height: 28,
                borderRadius: 7,
                border: `1px solid ${ZH.line}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: ZH.textDim,
                fontFamily: ZH.mono,
                cursor: 'pointer',
              }}
            >
              ‹
            </button>
            <SysLabel>день</SysLabel>
          </div>
          <SysLabel color={ZH.textFaint}>{formatShortDate(day)}</SysLabel>
        </header>

        <div
          className="flex-1 overflow-y-auto"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 96px)' }}
        >
          {dayMeta?.lazy && (
            <div style={{ padding: '8px 16px 0' }}>
              <Panel
                style={{
                  padding: '11px 13px',
                  borderColor: `${ZH.warn}55`,
                  background: `${ZH.warn}12`,
                  boxShadow: `0 0 16px ${ZH.warn}16`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    color: ZH.warn,
                  }}
                >
                  <SysLabel color={ZH.warn}>примерный день</SysLabel>
                  <span style={{ fontSize: 12, color: ZH.textDim, lineHeight: 1.45 }}>
                    День записан через AI по общему описанию. Еда, вода и заметки могут быть неточными.
                  </span>
                </div>
              </Panel>
            </div>
          )}

          <div style={{ padding: '8px 16px 0' }}>
            <div style={{ padding: '0 4px 8px' }}>
              <SysLabel>еда</SysLabel>
            </div>
            <div
              style={{
                background: ZH.panel,
                border: `1px solid ${ZH.line}`,
                borderRadius: 14,
                padding: 12,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: ZH.softGlow,
              }}
            >
              <CaloriesSection
                key={day}
                day={day}
                onOpenSettings={openGoalEditor}
              />
            </div>
          </div>

          <div style={{ padding: '16px 16px 0' }}>
            <div style={{ padding: '0 4px 8px' }}>
              <SysLabel>вода</SysLabel>
            </div>
            <WaterSection day={day} showEntries={false} />
          </div>

          <div style={{ padding: '16px 16px 0' }}>
            <div style={{ padding: '0 4px 8px' }}>
              <SysLabel>заметки</SysLabel>
            </div>
            <div
              style={{
                background: ZH.panel,
                border: `1px solid ${ZH.line}`,
                borderRadius: 14,
                padding: 12,
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: ZH.softGlow,
              }}
            >
              <NotesPanel selectedDay={day} />
            </div>
          </div>

          {log.length > 0 && (
            <div ref={logRef} style={{ padding: '16px 16px 32px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0 4px 8px',
                }}
              >
                <SysLabel>лог</SysLabel>
                <SysLabel color={ZH.textFaint}>{log.length}</SysLabel>
              </div>
              <Panel style={{ padding: 0 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '60px 1fr',
                    gap: 8,
                    padding: '10px 14px',
                    fontFamily: ZH.mono,
                    fontSize: 9,
                    letterSpacing: '0.18em',
                    color: ZH.textFaint,
                    textTransform: 'uppercase',
                  }}
                >
                  <span>time</span>
                  <span>событие</span>
                </div>
                {log.map((e) => (
                  <LogRow
                    key={e.key}
                    time={e.time}
                    text={e.text}
                    onDelete={e.kind === 'water' ? () => handleDeleteWater(e.id) : undefined}
                  />
                ))}
              </Panel>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type LogEntry = {
  key: string
  id: string
  kind: 'food' | 'note' | 'water'
  time: string
  text: string
}

function buildLog(
  notes: Note[] | undefined,
  entries:
    | { id: string; createdAt: number; foodId?: string; quickAdd?: { name: string } }[]
    | undefined,
  foods: Record<string, { name: string }>,
  water: { id: string; createdAt: number; ml: number }[] | undefined,
): LogEntry[] {
  const out: LogEntry[] = []
  if (notes) {
    for (const n of notes) {
      out.push({
        key: `n_${n.id}`,
        id: n.id,
        kind: 'note',
        time: formatTime(n.createdAt),
        text: `заметка · ${truncate(n.text, 60)}`,
      })
    }
  }
  if (entries) {
    for (const e of entries) {
      const name = e.foodId ? (foods[e.foodId]?.name ?? 'продукт') : (e.quickAdd?.name ?? 'запись')
      out.push({
        key: `e_${e.id}`,
        id: e.id,
        kind: 'food',
        time: formatTime(e.createdAt),
        text: `еда · ${truncate(name, 60)}`,
      })
    }
  }
  if (water) {
    for (const e of water) {
      out.push({
        key: `w_${e.id}`,
        id: e.id,
        kind: 'water',
        time: formatTime(e.createdAt),
        text: `вода · ${e.ml} мл`,
      })
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time))
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatShortDate(day: DayKey): string {
  const [y, m, d] = day.split('-').map(Number)
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${String(y).slice(-2)}`
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

function LogRow({ time, text, onDelete }: { time: string; text: string; onDelete?: () => void }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: onDelete ? '60px 1fr 28px' : '60px 1fr',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderTop: `1px solid ${ZH.line}`,
        fontFamily: ZH.mono,
        fontSize: 11,
      }}
    >
      <span style={{ color: ZH.textFaint, letterSpacing: '0.04em' }}>{time}</span>
      <span style={{ color: ZH.text, fontSize: 12, letterSpacing: 0 }}>{text}</span>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="Удалить воду"
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 24,
            height: 24,
            borderRadius: 7,
            border: `1px solid ${ZH.line}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: ZH.textDim,
            fontFamily: ZH.mono,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
