import { useEffect, useRef, useState } from 'react'
import { ZH, accentAlpha } from '../design/tokens'
import { DEFAULT_NOTE_COLOR, type NoteColor } from '../lib/colors'
import type { Note } from '../types/note'

type Props = {
  note: Note
  editing: boolean
  onSave: (text: string, color: NoteColor) => void
  onDelete: () => void
  onRequestEdit: () => void
  onStopEdit: () => void
  /** Подпись «топ-3 идут в календарь» — показываем только для первых трёх. */
  inTopThree: boolean
  /** Текущая заметка перетаскивается — приподнимаем визуально. */
  dragging: boolean
  /** Во время перетаскивания другой заметки — чуть гасим остальные. */
  somethingDragging: boolean
  /** Pointer-события на drag-handle: передаются из ReorderableNotes. */
  onHandlePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
}

export function NoteItem({
  note,
  editing,
  onSave,
  onDelete,
  onRequestEdit,
  onStopEdit,
  inTopThree,
  dragging,
  somethingDragging,
  onHandlePointerDown,
}: Props) {
  const [draft, setDraft] = useState(note.text)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const wasEditing = useRef(editing)
  // Цвет заметки больше не редактируется из UI — сохраняем текущее значение,
  // чтобы не обнулять его у старых заметок при обычном редактировании текста.
  const keepColor: NoteColor = note.color ?? DEFAULT_NOTE_COLOR

  useEffect(() => {
    if (wasEditing.current && !editing) {
      const trimmed = draft.trim()
      if (trimmed && trimmed !== note.text) {
        onSave(draft, keepColor)
      }
    }
    if (!wasEditing.current && editing) {
      setDraft(note.text)
    }
    wasEditing.current = editing
  }, [editing, draft, note.text, keepColor, onSave])

  function commit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== note.text) {
      onSave(draft, keepColor)
    }
    onStopEdit()
  }

  function cancel() {
    setDraft(note.text)
    onStopEdit()
  }

  if (editing) {
    return (
      <div
        style={{
          background: 'rgba(18, 23, 36, 0.55)',
          border: `1px solid ${accentAlpha(0.35)}`,
          borderRadius: 12,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: `0 0 20px ${accentAlpha(0.12)}`,
        }}
      >
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="текст заметки"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            resize: 'none',
            color: ZH.text,
            fontSize: 14,
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={commit}
            style={{
              all: 'unset',
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              textAlign: 'center',
              cursor: 'pointer',
              background: `linear-gradient(180deg, ${accentAlpha(0.8)}, ${accentAlpha(0.53)})`,
              border: `1px solid ${ZH.accent}`,
              boxShadow: `0 0 16px ${accentAlpha(0.3)}`,
            }}
          >
            <span
              style={{
                fontFamily: ZH.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: '#06131F',
              }}
            >
              сохранить
            </span>
          </button>
          <button
            type="button"
            onClick={cancel}
            style={{
              all: 'unset',
              flex: 1,
              padding: '10px 0',
              borderRadius: 10,
              textAlign: 'center',
              cursor: 'pointer',
              background: 'rgba(148,178,224,0.06)',
              border: `1px solid ${ZH.line}`,
            }}
          >
            <span
              style={{
                fontFamily: ZH.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: ZH.textDim,
              }}
            >
              отмена
            </span>
          </button>
        </div>
      </div>
    )
  }

  const borderColor = dragging
    ? accentAlpha(0.6)
    : inTopThree
      ? accentAlpha(0.28)
      : ZH.line
  return (
    <div
      className={dragging ? '' : 'animate-note-in'}
      style={{
        background: dragging ? 'rgba(18, 23, 36, 0.85)' : 'rgba(18, 23, 36, 0.45)',
        border: `1px solid ${borderColor}`,
        borderRadius: 10,
        padding: '10px 12px',
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        boxShadow: dragging
          ? `0 12px 28px rgba(0,0,0,0.45), 0 0 0 1px ${accentAlpha(0.25)}`
          : 'none',
        opacity: somethingDragging && !dragging ? 0.55 : 1,
        transition: dragging
          ? 'none'
          : 'opacity 160ms ease-out, box-shadow 160ms ease-out',
      }}
    >
      <div
        onPointerDown={onHandlePointerDown}
        aria-label="Перетащить"
        role="button"
        style={{
          flexShrink: 0,
          padding: '4px 4px',
          margin: '-2px -2px -2px -4px',
          color: dragging ? ZH.accent : ZH.textFaint,
          cursor: 'grab',
          touchAction: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          userSelect: 'none',
        }}
      >
        <DragGlyph />
      </div>
      <button
        type="button"
        onClick={onRequestEdit}
        style={{
          all: 'unset',
          flex: 1,
          cursor: 'pointer',
          color: ZH.text,
          fontSize: 14,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          textAlign: 'left',
          lineHeight: 1.4,
        }}
      >
        {note.text}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="удалить"
        style={{
          all: 'unset',
          cursor: 'pointer',
          color: ZH.warn,
          fontSize: 12,
          padding: '2px 6px',
          opacity: 0.55,
          flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  )
}

function DragGlyph() {
  return (
    <svg width="10" height="14" viewBox="0 0 10 14" aria-hidden>
      <circle cx="3" cy="3" r="1" fill="currentColor" />
      <circle cx="7" cy="3" r="1" fill="currentColor" />
      <circle cx="3" cy="7" r="1" fill="currentColor" />
      <circle cx="7" cy="7" r="1" fill="currentColor" />
      <circle cx="3" cy="11" r="1" fill="currentColor" />
      <circle cx="7" cy="11" r="1" fill="currentColor" />
    </svg>
  )
}
