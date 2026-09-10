import { useEffect, useRef, useState } from 'react'
import { SysLabel } from '../design/primitives'
import { ZH, accentAlpha } from '../design/tokens'
import { DEFAULT_NOTE_COLOR } from '../lib/colors'
import { hapticSelection } from '../lib/haptic'
import { NOTE_EXAMPLES, useTypewriterPlaceholder } from '../lib/typewriter'
import { useNotesStore } from '../store/notes'
import type { DayKey, Note } from '../types/note'
import { NoteItem } from './NoteItem'

type Props = { selectedDay: DayKey }

export function NotesPanel({ selectedDay }: Props) {
  const notes = useNotesStore((s) => s.notesByDay[selectedDay])
  const loading = useNotesStore((s) => s.loadingDays.has(selectedDay))
  const loadDay = useNotesStore((s) => s.loadDay)
  const addNote = useNotesStore((s) => s.addNote)
  const updateNote = useNotesStore((s) => s.updateNote)
  const deleteNote = useNotesStore((s) => s.deleteNote)
  const setNotesOrder = useNotesStore((s) => s.setNotesOrder)
  const calendarMode = useNotesStore((s) => s.calendarMode)

  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const anyEditing = editingId !== null
  const hasNotes = (notes?.length ?? 0) > 0
  const placeholder = useTypewriterPlaceholder(
    NOTE_EXAMPLES,
    draft.length === 0 && !anyEditing,
  )

  useEffect(() => {
    void loadDay(selectedDay)
  }, [selectedDay, loadDay])

  async function handleAdd() {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    await addNote(selectedDay, text, DEFAULT_NOTE_COLOR)
  }

  return (
    <section
      className="flex flex-col gap-3 animate-fade-in"
      style={{ color: ZH.text }}
    >
      {!anyEditing && (
        <div className="flex flex-col gap-2 animate-fade-in">
          <div style={{ paddingLeft: 2 }}>
            <SysLabel color={ZH.textDim}>новая заметка</SysLabel>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleAdd()
              }}
              placeholder={placeholder}
              style={{
                flex: 1,
                background: 'rgba(18, 23, 36, 0.45)',
                border: `1px solid ${ZH.line}`,
                borderRadius: 10,
                padding: '10px 14px',
                fontSize: 14,
                color: ZH.text,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!draft.trim()}
              style={{
                all: 'unset',
                padding: '0 16px',
                borderRadius: 10,
                cursor: draft.trim() ? 'pointer' : 'not-allowed',
                background: draft.trim()
                  ? `linear-gradient(180deg, ${accentAlpha(0.8)}, ${accentAlpha(0.53)})`
                  : 'rgba(148,178,224,0.06)',
                border: `1px solid ${draft.trim() ? ZH.accent : ZH.line}`,
                boxShadow: draft.trim() ? `0 0 18px ${accentAlpha(0.3)}` : 'none',
                opacity: draft.trim() ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: ZH.mono,
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: draft.trim() ? '#06131F' : ZH.textDim,
                }}
              >
                записать
              </span>
            </button>
          </div>
        </div>
      )}

      {loading && !notes && (
        <div className="flex flex-col gap-2" aria-hidden>
          <div
            className="animate-skeleton"
            style={{ height: 44, borderRadius: 10, background: 'rgba(148,178,224,0.05)' }}
          />
          <div
            className="animate-skeleton"
            style={{
              height: 44,
              borderRadius: 10,
              background: 'rgba(148,178,224,0.05)',
              animationDelay: '120ms',
            }}
          />
        </div>
      )}
      {notes && notes.length === 0 && (
        <div
          style={{
            padding: '24px 0',
            textAlign: 'center',
            color: ZH.textDim,
            fontSize: 13,
            fontFamily: ZH.mono,
            letterSpacing: '0.04em',
          }}
        >
          заметок за день нет
        </div>
      )}
      {notes && notes.length > 0 && (
        <ReorderableNotes
          notes={notes}
          editingId={editingId}
          onEdit={setEditingId}
          onSave={(id, text, color) => void updateNote(selectedDay, id, text, color)}
          onDelete={(id) => void deleteNote(selectedDay, id)}
          onCommitOrder={(orderedIds) => void setNotesOrder(selectedDay, orderedIds)}
        />
      )}

      {hasNotes && calendarMode === 'notes' && (
        <div
          style={{
            fontFamily: ZH.mono,
            fontSize: 10,
            color: ZH.textFaint,
            letterSpacing: '0.08em',
            paddingLeft: 2,
            lineHeight: 1.4,
          }}
        >
          верхние 3 видны в клетке календаря. перетащи нужную вверх за ⋮⋮-ручку.
        </div>
      )}
    </section>
  )
}

/**
 * Список заметок с touch-drag-реордером. Pointer события живут на маленькой
 * drag-handle слева у каждой заметки — по down мы начинаем «тянуть» этот
 * элемент, на move пересчитываем его целевой индекс по пересечению с rect
 * других заметок, на up — фиксируем новый порядок и шлём его наружу.
 *
 * Локальный state `order` — источник истины во время перетаскивания. После
 * up он заменяет external notes через onCommitOrder и приходит назад через
 * пропсы — useEffect его синхронизирует обратно.
 */
function ReorderableNotes({
  notes,
  editingId,
  onEdit,
  onSave,
  onDelete,
  onCommitOrder,
}: {
  notes: Note[]
  editingId: string | null
  onEdit: (id: string | null) => void
  onSave: (id: string, text: string, color: Note['color']) => void
  onDelete: (id: string) => void
  onCommitOrder: (orderedIds: string[]) => void
}) {
  const [order, setOrder] = useState<Note[]>(notes)
  const [lastNotes, setLastNotes] = useState<Note[]>(notes)
  const [dragId, setDragId] = useState<string | null>(null)
  // Ключ — note.id, value — DOMNode. Нужен для pointermove, чтобы по Y-координате
  // курсора понимать, в какой «слот» пользователь дотянул заметку.
  const nodesRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const orderRef = useRef(order)
  useEffect(() => {
    orderRef.current = order
  })

  // Синхронизация с внешним источником без useEffect — на ту же прогонку
  // рендера переиспользуем условный setState (pattern: «Adjusting state when
  // a prop changes» из React docs). Пока тянем заметку — внешний порядок
  // игнорируем, чтобы не затереть текущий preview.
  if (notes !== lastNotes && dragId === null) {
    setLastNotes(notes)
    setOrder(notes)
  }

  const handleHandleDown =
    (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
      // Игнорим правую кнопку мыши и точки стилуса на редактируемой карточке.
      if (e.button !== undefined && e.button !== 0) return
      if (editingId === id) return
      e.preventDefault()
      setDragId(id)
      hapticSelection()
      const target = e.currentTarget
      try {
        target.setPointerCapture(e.pointerId)
      } catch {
        /* ignore — PointerCapture может быть уже захвачен */
      }

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        const y = ev.clientY
        const cur = orderRef.current
        const idx = cur.findIndex((n) => n.id === id)
        if (idx < 0) return
        // Ищем ячейку, чей rect содержит курсор по вертикали.
        let targetIdx = idx
        for (let i = 0; i < cur.length; i++) {
          const node = nodesRef.current.get(cur[i].id)
          if (!node) continue
          const r = node.getBoundingClientRect()
          if (y >= r.top && y <= r.bottom) {
            targetIdx = i
            break
          }
          // Клампы: выше всех — в начало, ниже всех — в конец.
          if (i === 0 && y < r.top) targetIdx = 0
          if (i === cur.length - 1 && y > r.bottom) targetIdx = cur.length - 1
        }
        if (targetIdx !== idx) {
          const next = cur.slice()
          const [moved] = next.splice(idx, 1)
          next.splice(targetIdx, 0, moved)
          setOrder(next)
        }
      }

      const finish = (ev: PointerEvent) => {
        if (ev.pointerId !== e.pointerId) return
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', finish)
        window.removeEventListener('pointercancel', finish)
        try {
          target.releasePointerCapture(e.pointerId)
        } catch {
          /* ignore */
        }
        const finalOrder = orderRef.current
        setDragId(null)
        // Применяем, только если порядок реально изменился.
        const changed = finalOrder.some((n, i) => n.id !== notes[i]?.id)
        if (changed) onCommitOrder(finalOrder.map((n) => n.id))
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
    }

  return (
    <div className="flex flex-col gap-2">
      {order.map((n, i) => (
        <div
          key={n.id}
          ref={(el) => {
            if (el) nodesRef.current.set(n.id, el)
            else nodesRef.current.delete(n.id)
          }}
        >
          <NoteItem
            note={n}
            editing={editingId === n.id}
            inTopThree={i < 3}
            dragging={dragId === n.id}
            somethingDragging={dragId !== null}
            onSave={(text, color) => onSave(n.id, text, color)}
            onDelete={() => onDelete(n.id)}
            onRequestEdit={() => onEdit(n.id)}
            onStopEdit={() => onEdit(null)}
            onHandlePointerDown={handleHandleDown(n.id)}
          />
        </div>
      ))}
    </div>
  )
}
