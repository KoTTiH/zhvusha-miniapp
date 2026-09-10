import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Panel, SysLabel, SystemTopStripe, ZHScreen } from '../design/primitives'
import { ZH, accentAlpha } from '../design/tokens'
import {
  assistantChat,
  assistantDeleteAttachment,
  assistantListMemories,
  assistantUpdateMemory,
  assistantUploadAttachment,
  describeAiError,
  type AssistantClientContext,
  type AssistantClientDiaryDay,
  type AssistantMemory,
  type AssistantMode,
  type AssistantSafety,
  type AssistantStructuredMessage,
  type AssistantSuggestedAction,
  type AssistantUsedContext,
} from '../lib/ai'
import { dayKey } from '../lib/dates'
import { captureImageFile, releasePreview } from '../lib/imageCapture'
import { resolveEntry, roundKcal } from '../lib/nutrition'
import { telegramUserId } from '../lib/tma'
import { useCaloriesStore } from '../store/calories'
import { useNotesStore } from '../store/notes'
import type { DayMeta, Food, FoodEntry, FoodLogStatus, WaterEntry } from '../types/calorie'
import type { DayKey, Note } from '../types/note'

type ChatEntry = {
  id: string
  role: 'user' | 'assistant'
  text?: string
  message?: AssistantStructuredMessage
  safety?: AssistantSafety
  actions?: AssistantSuggestedAction[]
  usedContext?: AssistantUsedContext
  attachments?: PendingAttachment[]
  failedRequest?: FailedAssistantRequest
}

type FailedAssistantRequest = {
  message: string
  mode: AssistantMode
  attachmentIds: number[]
}

type PendingAttachment = {
  id: number
  kind: 'skin_photo' | 'photo'
  previewUrl: string
  mediaType: string
  uploading: boolean
}

const FALLBACK_CONCLUSION = 'Не получилось ответить'
const ASSISTANT_CLIENT_CONTEXT_DAYS = 14

export function ZhvushaAssistant() {
  const selectedDay = useNotesStore((s) => s.selectedDay)
  const loadNotesDay = useNotesStore((s) => s.loadDay)
  const loadNotesRange = useNotesStore((s) => s.loadRange)
  const showToast = useCaloriesStore((s) => s.showToast)
  const loadCaloriesDay = useCaloriesStore((s) => s.loadDay)
  const loadCaloriesRange = useCaloriesStore((s) => s.loadRange)
  const loadWaterDay = useCaloriesStore((s) => s.loadWaterDay)
  const loadWaterRange = useCaloriesStore((s) => s.loadWaterRange)
  const loadDayMeta = useCaloriesStore((s) => s.loadDayMeta)
  const loadDayMetaRange = useCaloriesStore((s) => s.loadDayMetaRange)
  const [threadId, setThreadId] = useState<number | null>(null)
  const [mode, setMode] = useState<AssistantMode>('health')
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [photoConsent, setPhotoConsent] = useState(loadPhotoConsent())
  const [consentPromptOpen, setConsentPromptOpen] = useState(false)
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [memories, setMemories] = useState<AssistantMemory[]>([])
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const previewUrlsRef = useRef<Set<string>>(new Set())
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const photoInputRef = useRef<HTMLInputElement | null>(null)
  const autoScrollReadyRef = useRef(false)
  const pendingPhotoKindRef = useRef<'skin_photo' | 'photo'>('photo')

  useEffect(() => {
    const controller = new AbortController()
    assistantListMemories(controller.signal)
      .then((result) => setMemories(result.memories))
      .catch(() => {
        /* Память не блокирует чат: без БД экран остаётся пригодным для просмотра. */
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      autoScrollReadyRef.current = true
    }, 350)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!autoScrollReadyRef.current) return
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [entries.length, pendingAttachments.length, sending, memoryOpen, consentPromptOpen])

  useEffect(() => {
    const previews = previewUrlsRef.current
    return () => {
      for (const url of previews) releasePreview(url)
      previews.clear()
    }
  }, [])

  const confirmedMemories = useMemo(
    () => memories.filter((memory) => memory.status === 'confirmed'),
    [memories],
  )
  const suggestedMemories = useMemo(
    () => memories.filter((memory) => memory.status === 'suggested'),
    [memories],
  )

  const assistantDay = selectedDay ?? dayKey(new Date())
  const showEmptyState = entries.length === 0 && !memoryOpen && !consentPromptOpen && !sending

  const loadAssistantDay = useCallback(async (day: DayKey): Promise<void> => {
    await Promise.all([
      loadNotesDay(day),
      loadCaloriesDay(day),
      loadWaterDay(day),
      loadDayMeta(day),
    ])
  }, [loadNotesDay, loadCaloriesDay, loadWaterDay, loadDayMeta])

  const loadAssistantContextDays = useCallback(async (days: DayKey[]): Promise<void> => {
    await Promise.all([
      loadNotesRange(days),
      loadCaloriesRange(days),
      loadWaterRange(days),
      loadDayMetaRange(days),
    ])
  }, [loadNotesRange, loadCaloriesRange, loadWaterRange, loadDayMetaRange])

  useEffect(() => {
    void loadAssistantDay(assistantDay)
  }, [assistantDay, loadAssistantDay])

  const send = async (
    textOverride?: string,
    modeOverride?: AssistantMode,
    options?: { skipUserEntry?: boolean; attachmentIds?: number[] },
  ) => {
    const text = (textOverride ?? input).trim()
    const readyAttachments = options?.skipUserEntry
      ? []
      : pendingAttachments.filter((item) => !item.uploading)
    const attachmentIds = options?.attachmentIds ?? readyAttachments.map((item) => item.id)
    if (!text && attachmentIds.length === 0) return
    const nextMode = modeOverride ?? mode
    setMode(nextMode)
    setInput('')
    if (!options?.skipUserEntry) {
      setPendingAttachments([])
      setEntries((current) => [
        ...current,
        {
          id: `u_${Date.now()}`,
          role: 'user',
          text: text || 'фото для дневника',
          attachments: readyAttachments,
        },
      ])
    }
    setSending(true)
    try {
      await hydrateAssistantStores()
      const contextDays = getAssistantContextDays(assistantDay)
      await loadAssistantContextDays(contextDays)
      const result = await assistantChat({
        threadId,
        message: text,
        mode: nextMode,
        attachmentIds,
        clientContext: buildAssistantClientContext(assistantDay, contextDays),
      })
      setThreadId(result.threadId)
      if (result.suggestedMemory.length > 0) {
        setMemories((current) => mergeMemories(result.suggestedMemory, current))
      }
      setEntries((current) => [
        ...current,
        {
          id: `a_${Date.now()}`,
          role: 'assistant',
          message: result.assistantMessage,
          safety: result.safety,
          actions: result.suggestedActions,
          usedContext: result.usedContext,
        },
      ])
    } catch (err) {
      showToast(describeAiError(err))
      setEntries((current) => [
        ...current,
        {
          id: `a_err_${Date.now()}`,
          role: 'assistant',
          message: {
            conclusion: FALLBACK_CONCLUSION,
            reasons: [],
            confidence: 'низкая',
            checks: [],
            redFlags: [],
          },
          failedRequest: { message: text, mode: nextMode, attachmentIds },
          safety: {
            level: 'health',
            disclaimer: 'Не ставлю диагнозы. При боли, резком ухудшении или тревожных симптомах обратись к врачу.',
            redFlags: ['при боли, резком ухудшении или тревожных симптомах лучше обратиться к врачу'],
          },
        },
      ])
    } finally {
      setSending(false)
    }
  }

  const addPhoto = (kind: 'skin_photo' | 'photo', consentJustAccepted = false) => {
    if (!photoConsent && !consentJustAccepted) {
      setConsentPromptOpen(true)
      return
    }
    pendingPhotoKindRef.current = kind
    window.setTimeout(() => photoInputRef.current?.click(), 0)
  }

  const handlePhotoFile = async (file: File) => {
    const kind = pendingPhotoKindRef.current
    try {
      const captured = await captureImageFile(file)
      previewUrlsRef.current.add(captured.previewUrl)
      const tempId = -Date.now()
      setPendingAttachments((current) => [
        ...current,
        {
          id: tempId,
          kind,
          previewUrl: captured.previewUrl,
          mediaType: captured.mediaType,
          uploading: true,
        },
      ])
      const uploaded = await assistantUploadAttachment({
        kind,
        data: captured.data,
        mediaType: captured.mediaType,
        metadata: { source: 'assistant-composer' },
      })
      setPendingAttachments((current) =>
        current.map((item) =>
          item.id === tempId
            ? {
                ...item,
                id: uploaded.attachment.id,
                mediaType: uploaded.attachment.mediaType,
                uploading: false,
              }
            : item,
        ),
      )
    } catch (err) {
      showToast(describePhotoError(err))
      setPendingAttachments((current) => current.filter((item) => !item.uploading))
    }
  }

  const removeAttachment = async (attachment: PendingAttachment) => {
    setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))
    releasePreview(attachment.previewUrl)
    previewUrlsRef.current.delete(attachment.previewUrl)
    if (attachment.id > 0) {
      await assistantDeleteAttachment({ id: attachment.id }).catch(() => {
        showToast('фото не удалилось')
      })
    }
  }

  const applyMemory = async (
    memory: AssistantMemory,
    status: 'confirmed' | 'dismissed',
  ) => {
    setMemories((current) =>
      current.map((item) => item.id === memory.id ? { ...item, status } : item),
    )
    try {
      const result = await assistantUpdateMemory({ memoryId: memory.id, status })
      setMemories(result.memories)
    } catch (err) {
      showToast(describeAiError(err))
    }
  }

  const acceptPhotoConsent = () => {
    savePhotoConsent()
    setPhotoConsent(true)
    setConsentPromptOpen(false)
    void addPhoto('photo', true)
  }

  const retryFailedRequest = (entry: ChatEntry) => {
    if (!entry.failedRequest || sending) return
    const failed = entry.failedRequest
    setEntries((current) => current.filter((item) => item.id !== entry.id))
    void send(failed.message, failed.mode, {
      skipUserEntry: true,
      attachmentIds: failed.attachmentIds,
    })
  }

  return (
    <ZHScreen>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          gridTemplateRows: 'auto 1fr auto',
          minHeight: 0,
        }}
      >
        <AssistantHeader
          memoryOpen={memoryOpen}
          memoryCount={confirmedMemories.length}
          onMemory={() => setMemoryOpen((value) => !value)}
        />

        <div
          ref={scrollerRef}
          className="zh-no-scrollbar"
          style={{
            minHeight: 0,
            overflowY: 'auto',
            padding: showEmptyState ? '18px 22px 18px' : '10px 22px 18px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: showEmptyState ? 'center' : 'flex-start',
            gap: 16,
            scrollbarWidth: 'none',
          }}
        >
          {showEmptyState ? (
            <EmptyAssistantState />
          ) : (
            <>
              {memoryOpen && (
                <MemoryPanel
                  confirmed={confirmedMemories}
                  suggested={suggestedMemories}
                  onApply={(memory, status) => void applyMemory(memory, status)}
                />
              )}
              {consentPromptOpen && (
                <PhotoConsentPanel
                  onAccept={acceptPhotoConsent}
                  onClose={() => setConsentPromptOpen(false)}
                />
              )}
              {entries.map((entry) => (
                <ChatBubble
                  key={entry.id}
                  entry={entry}
                  onAction={(action) => {
                    if (action.kind === 'photo') void addPhoto('photo')
                    else if (action.kind === 'memory') setMemoryOpen(true)
                  }}
                  onRetry={() => retryFailedRequest(entry)}
                />
              ))}
            </>
          )}
          {sending && <ThinkingBubble />}
        </div>

        <Composer
          input={input}
          pendingAttachments={pendingAttachments}
          sending={sending}
          onInput={setInput}
          onAddPhoto={() => void addPhoto('photo')}
          onRemoveAttachment={(attachment) => void removeAttachment(attachment)}
          onSend={() => void send()}
        />
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          aria-hidden="true"
          tabIndex={-1}
          style={hiddenFileInputStyle}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) void handlePhotoFile(file)
          }}
        />
      </div>
    </ZHScreen>
  )
}

function EmptyAssistantState() {
  return (
    <div style={emptyStateStyle}>
      <SysLabel color={ZH.textFaint}>советник по дневнику</SysLabel>
      <div style={emptyTitleStyle}>Понять питание и самочувствие</div>
      <div style={emptyTextStyle}>Смотрю на еду, воду, заметки и твои предпочтения.</div>
      <div style={emptySafetyStyle}>
        Не ставлю диагнозы. При боли, резком ухудшении или тревожных симптомах обратись к врачу.
      </div>
    </div>
  )
}

function AssistantHeader({
  memoryOpen,
  memoryCount,
  onMemory,
}: {
  memoryOpen: boolean
  memoryCount: number
  onMemory: () => void
}) {
  return (
    <SystemTopStripe
      label="жвуша"
      right={
        <button
          type="button"
          onClick={onMemory}
          style={memoryButtonStyle(memoryOpen)}
        >
          память {memoryCount > 0 ? memoryCount : ''}
        </button>
      }
    />
  )
}

function ChatBubble({
  entry,
  onAction,
  onRetry,
}: {
  entry: ChatEntry
  onAction: (action: AssistantSuggestedAction) => void
  onRetry: () => void
}) {
  const isUser = entry.role === 'user'
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        width: '100%',
        maxWidth: 660,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          width: isUser ? 'min(82%, 420px)' : '100%',
          borderRadius: isUser ? '15px 15px 5px 15px' : '15px 15px 15px 5px',
          border: isUser ? `1px solid ${accentAlpha(0.28)}` : 'none',
          background: isUser ? accentAlpha(0.14) : 'transparent',
          boxShadow: 'none',
          padding: isUser ? '10px 12px' : 0,
        }}
      >
        {entry.attachments && entry.attachments.length > 0 && (
          <AttachmentStrip attachments={entry.attachments} />
        )}
        {isUser ? (
          <div style={{ color: ZH.text, fontSize: 14, lineHeight: 1.42 }}>
            {entry.text}
          </div>
        ) : entry.failedRequest ? (
          <AssistantError onRetry={onRetry} />
        ) : entry.message ? (
          <StructuredAnswer
            message={entry.message}
            actions={entry.actions ?? []}
            onAction={onAction}
          />
        ) : null}
      </div>
    </div>
  )
}

function AssistantError({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={assistantErrorStyle}>
      <div style={assistantErrorTitleStyle}>Не получилось ответить</div>
      <div style={assistantErrorTextStyle}>
        AI сейчас недоступен или соединение оборвалось. Вопрос остался в чате.
      </div>
      <button type="button" onClick={onRetry} style={assistantErrorButtonStyle}>
        повторить
      </button>
    </div>
  )
}

function StructuredAnswer({
  message,
  actions,
  onAction,
}: {
  message: AssistantStructuredMessage
  actions: AssistantSuggestedAction[]
  onAction: (action: AssistantSuggestedAction) => void
}) {
  if (message.conclusion === FALLBACK_CONCLUSION) {
    return (
      <div style={{ color: ZH.text, fontSize: 15, lineHeight: 1.4, fontWeight: 580 }}>
        {message.conclusion}
      </div>
    )
  }
  const visibleActions = actions.filter(isFunctionalAction)
  const redFlag = message.redFlags.map((item) => item.trim()).find(Boolean)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ color: ZH.text, fontSize: 16, lineHeight: 1.42, fontWeight: 620 }}>
        {message.conclusion}
      </div>

      {redFlag && <div style={answerWarningStyle}>Если станет хуже: {redFlag}</div>}

      {visibleActions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, paddingTop: 1 }}>
          {visibleActions.map((action, index) => (
            <button
              key={`${action.kind}_${index}_${action.label}`}
              type="button"
              onClick={() => onAction(action)}
              style={smallActionStyle}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function isFunctionalAction(action: AssistantSuggestedAction): boolean {
  return action.kind === 'memory'
}

function describePhotoError(err: unknown): string {
  if (err instanceof Error) {
    if (err.message === 'file-too-large') return 'фото слишком большое'
    if (err.message.includes('/api/assistant-attachment')) return 'фото не загрузилось'
  }
  return describeAiError(err)
}

function getAssistantContextDays(selected: DayKey): DayKey[] {
  const calories = useCaloriesStore.getState()
  const notes = useNotesStore.getState()
  const days = new Set<DayKey>([selected])

  for (const day of calories.daysWithEntries) days.add(day)
  for (const day of notes.daysWithNotes) days.add(day)
  for (const [day, water] of Object.entries(calories.waterByDay)) {
    if (water.length > 0) days.add(day)
  }
  for (const [day, meta] of Object.entries(calories.dayMetaByDay)) {
    if (meta?.lazy === true || meta?.foodStatus === 'no_food' || meta?.foodStatus === 'not_logged') {
      days.add(day)
    }
  }

  const recent = Array.from(days)
    .sort((a, b) => b.localeCompare(a))
    .filter((day) => day !== selected)
    .slice(0, ASSISTANT_CLIENT_CONTEXT_DAYS - 1)
  return [selected, ...recent]
}

async function hydrateAssistantStores(): Promise<void> {
  await Promise.all([
    useNotesStore.getState().hydrate(),
    useCaloriesStore.getState().hydrate(),
  ])
}

function buildAssistantClientContext(
  selectedDay: DayKey,
  contextDays: DayKey[],
): AssistantClientContext {
  const calories = useCaloriesStore.getState()
  const notes = useNotesStore.getState()
  const diaryDays = contextDays
    .map((day) => buildClientDiaryDay(
      day,
      calories.entriesByDay[day] ?? [],
      calories.waterByDay[day] ?? [],
      notes.notesByDay[day] ?? [],
      calories.dayMetaByDay[day],
      calories.foods,
    ))
    .filter((day): day is AssistantClientDiaryDay => day !== null)
  return {
    today: dayKey(new Date()),
    selectedDay,
    visibleDays: contextDays,
    ...(diaryDays.length > 0 ? { diaryDays } : {}),
  }
}

function buildClientDiaryDay(
  day: DayKey,
  entries: FoodEntry[],
  water: WaterEntry[],
  notes: Note[],
  meta: DayMeta | null | undefined,
  foods: Record<string, Food>,
): AssistantClientDiaryDay | null {
  const foodLines = entries
    .map((entry) => resolveEntry(entry, foods))
    .filter((entry) => !entry.missing)
    .slice(0, 8)
    .map((entry) => {
      const serving = entry.servingLabel ? ` · ${entry.servingLabel}` : ''
      return `${entry.name}${serving} · ${roundKcal(entry.kcal)} ккал`
    })
  const waterMl = water.reduce((sum, entry) => sum + Math.max(0, Math.round(entry.ml)), 0)
  const noteLines = notes
    .map((note) => note.text.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .slice(0, 4)
  const lazy = meta?.lazy === true
  const foodStatus = foodStatusForContext(meta, entries.length)
  if (
    foodLines.length === 0 &&
    waterMl === 0 &&
    noteLines.length === 0 &&
    !lazy &&
    foodStatus === 'unknown'
  ) {
    return null
  }
  return {
    day,
    foods: foodLines,
    waterMl,
    notes: noteLines,
    lazy,
    ...(foodStatus !== 'unknown' ? { foodStatus } : {}),
  }
}

function foodStatusForContext(meta: DayMeta | null | undefined, entryCount: number): FoodLogStatus {
  if (entryCount > 0) return 'unknown'
  if (meta?.foodStatus === 'no_food' || meta?.foodStatus === 'not_logged') return meta.foodStatus
  return 'unknown'
}

function MemoryPanel({
  confirmed,
  suggested,
  onApply,
}: {
  confirmed: AssistantMemory[]
  suggested: AssistantMemory[]
  onApply: (memory: AssistantMemory, status: 'confirmed' | 'dismissed') => void
}) {
  return (
    <Panel
      style={{
        padding: 13,
        display: 'flex',
        flexDirection: 'column',
        gap: 11,
        borderRadius: 12,
        background: QUIET_SURFACE,
        boxShadow: 'none',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <SysLabel color={ZH.text}>память</SysLabel>
        <SysLabel>{confirmed.length} подтверждено</SysLabel>
      </div>
      {suggested.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SysLabel color={ZH.warn}>на подтверждение</SysLabel>
          {suggested.map((memory) => (
            <MemoryRow key={memory.id} memory={memory} onApply={onApply} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SysLabel>сохранено</SysLabel>
        {confirmed.length === 0 ? (
          <div style={{ color: ZH.textFaint, fontSize: 13, lineHeight: 1.45 }}>
            AI ничего не запоминает сам. Здесь будут только факты, которые ты явно подтвердил.
          </div>
        ) : (
          confirmed.map((memory) => (
            <div key={memory.id} style={memorySavedStyle}>
              {memory.text}
            </div>
          ))
        )}
      </div>
    </Panel>
  )
}

function MemoryRow({
  memory,
  onApply,
}: {
  memory: AssistantMemory
  onApply: (memory: AssistantMemory, status: 'confirmed' | 'dismissed') => void
}) {
  return (
    <div style={memoryRowStyle}>
      <div style={{ color: ZH.textDim, fontSize: 13, lineHeight: 1.43 }}>{memory.text}</div>
      <div style={{ display: 'flex', gap: 7 }}>
        <button type="button" onClick={() => onApply(memory, 'confirmed')} style={smallActionStyle}>
          запомнить
        </button>
        <button type="button" onClick={() => onApply(memory, 'dismissed')} style={ghostActionStyle}>
          не надо
        </button>
      </div>
    </div>
  )
}

function PhotoConsentPanel({ onAccept, onClose }: { onAccept: () => void; onClose: () => void }) {
  return (
    <Panel
      style={{
        padding: 13,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        borderRadius: 12,
        background: QUIET_SURFACE,
        boxShadow: 'none',
      }}
    >
      <SysLabel color={ZH.text}>фото-дневник</SysLabel>
      <div style={{ color: ZH.textDim, fontSize: 13, lineHeight: 1.45 }}>
        Фото сохраняются только после отдельного согласия. Они лежат в private Blob,
        используются для выбранного чата и могут быть удалены из сообщения перед отправкой.
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onAccept} style={smallActionStyle}>
          разрешить фото
        </button>
        <button type="button" onClick={onClose} style={ghostActionStyle}>
          не сейчас
        </button>
      </div>
    </Panel>
  )
}

function Composer({
  input,
  pendingAttachments,
  sending,
  onInput,
  onAddPhoto,
  onRemoveAttachment,
  onSend,
}: {
  input: string
  pendingAttachments: PendingAttachment[]
  sending: boolean
  onInput: (value: string) => void
  onAddPhoto: () => void
  onRemoveAttachment: (attachment: PendingAttachment) => void
  onSend: () => void
}) {
  const canSend = (input.trim().length > 0 || pendingAttachments.some((item) => !item.uploading)) && !sending
  return (
    <div
      style={{
        padding: '8px 16px calc(var(--zh-tabbar-h, 74px) + 16px)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 720,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {pendingAttachments.length > 0 && (
          <AttachmentDrafts attachments={pendingAttachments} onRemove={onRemoveAttachment} />
        )}
        <div style={composerBarStyle}>
          <button type="button" onClick={onAddPhoto} aria-label="добавить фото" style={composerIconButtonStyle}>
            +
          </button>
          <textarea
            value={input}
            onChange={(event) => onInput(event.target.value)}
            placeholder="Что хочешь понять?"
            rows={1}
            style={composerTextareaStyle}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSend()
              }
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="отправить"
            style={{
              ...composerSendButtonStyle,
              color: canSend ? ZH.bg : ZH.textFaint,
              background: canSend ? ZH.accent : 'transparent',
              cursor: canSend ? 'pointer' : 'not-allowed',
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  )
}

function AttachmentDrafts({
  attachments,
  onRemove,
}: {
  attachments: PendingAttachment[]
  onRemove: (attachment: PendingAttachment) => void
}) {
  return (
    <div
      className="zh-no-scrollbar"
      style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingTop: 1, scrollbarWidth: 'none' }}
    >
      {attachments.map((attachment) => (
        <div key={attachment.id} style={{ position: 'relative', flex: '0 0 auto' }}>
          <img
            src={attachment.previewUrl}
            alt=""
            style={{
              width: 52,
              height: 52,
              objectFit: 'cover',
              borderRadius: 11,
              border: `1px solid ${attachment.uploading ? ZH.warn : ZH.lineHi}`,
              opacity: attachment.uploading ? 0.58 : 1,
            }}
          />
          <button
            type="button"
            onClick={() => onRemove(attachment)}
            aria-label="удалить фото"
            style={removeAttachmentButtonStyle}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

function AttachmentStrip({ attachments }: { attachments: PendingAttachment[] }) {
  return (
    <div
      className="zh-no-scrollbar"
      style={{ display: 'flex', gap: 8, marginBottom: 9, overflowX: 'auto', scrollbarWidth: 'none' }}
    >
      {attachments.map((attachment) => (
        <img key={attachment.id} src={attachment.previewUrl} alt="" style={sentAttachmentStyle} />
      ))}
    </div>
  )
}

function ThinkingBubble() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={thinkingStyle}>смотрю записи</div>
    </div>
  )
}

function mergeMemories(incoming: AssistantMemory[], current: AssistantMemory[]): AssistantMemory[] {
  const byId = new Map<number, AssistantMemory>()
  for (const memory of [...incoming, ...current]) byId.set(memory.id, memory)
  return Array.from(byId.values()).sort((a, b) => b.id - a.id)
}

function consentKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:assistant_photo_consent` : 'zhvusha:anon:assistant_photo_consent'
}

function loadPhotoConsent(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(consentKey()) === '1'
}

function savePhotoConsent(): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(consentKey(), '1')
}

const QUIET_SURFACE = ZH.panel

const emptyStateStyle: CSSProperties = {
  width: '100%',
  maxWidth: 332,
  margin: '0 auto',
  minHeight: 330,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 13,
  textAlign: 'center',
}

const emptyTitleStyle: CSSProperties = {
  color: ZH.text,
  fontSize: 25,
  lineHeight: 1.12,
  fontWeight: 650,
  marginTop: 2,
}

const emptyTextStyle: CSSProperties = {
  color: ZH.textDim,
  fontSize: 14,
  lineHeight: 1.42,
  maxWidth: 286,
}

const emptySafetyStyle: CSSProperties = {
  color: ZH.textFaint,
  fontSize: 11,
  lineHeight: 1.35,
  maxWidth: 280,
}

const assistantErrorStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 8,
}

const assistantErrorTitleStyle: CSSProperties = {
  color: ZH.text,
  fontSize: 15,
  lineHeight: 1.4,
  fontWeight: 580,
}

const assistantErrorTextStyle: CSSProperties = {
  color: ZH.textDim,
  fontSize: 13,
  lineHeight: 1.42,
  maxWidth: 320,
}

const assistantErrorButtonStyle: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  minHeight: 32,
  padding: '0 11px',
  borderRadius: 9,
  border: `1px solid ${accentAlpha(0.38)}`,
  background: accentAlpha(0.12),
  color: ZH.accent,
  fontFamily: ZH.mono,
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  display: 'inline-flex',
  alignItems: 'center',
  marginTop: 2,
}

const answerWarningStyle: CSSProperties = {
  color: ZH.textDim,
  fontSize: 14,
  lineHeight: 1.42,
}

const smallActionStyle: CSSProperties = {
  all: 'unset',
  cursor: 'pointer',
  minHeight: 32,
  padding: '0 11px',
  borderRadius: 9,
  border: `1px solid ${accentAlpha(0.38)}`,
  background: accentAlpha(0.12),
  color: ZH.accent,
  fontFamily: ZH.mono,
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  display: 'inline-flex',
  alignItems: 'center',
}

const ghostActionStyle: CSSProperties = {
  ...smallActionStyle,
  border: `1px solid ${ZH.line}`,
  background: 'transparent',
  color: ZH.textDim,
}

const composerBarStyle: CSSProperties = {
  minHeight: 54,
  display: 'grid',
  gridTemplateColumns: '42px minmax(0, 1fr) 42px',
  alignItems: 'center',
  gap: 2,
  borderRadius: 27,
  border: `1px solid ${ZH.line}`,
  background: QUIET_SURFACE,
  padding: '4px 5px',
  boxSizing: 'border-box',
}

const composerTextareaStyle: CSSProperties = {
  minHeight: 44,
  maxHeight: 96,
  resize: 'none',
  overflow: 'hidden',
  border: 'none',
  background: 'transparent',
  color: ZH.text,
  outline: 'none',
  padding: '12px 4px 8px',
  font: 'inherit',
  fontSize: 15,
  lineHeight: 1.35,
  width: '100%',
  boxSizing: 'border-box',
}

const composerIconButtonStyle: CSSProperties = {
  all: 'unset',
  height: 42,
  width: 42,
  borderRadius: 999,
  color: ZH.textDim,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 30,
  fontWeight: 300,
  lineHeight: 1,
  cursor: 'pointer',
}

const composerSendButtonStyle: CSSProperties = {
  all: 'unset',
  height: 42,
  width: 42,
  borderRadius: 999,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: ZH.mono,
  fontSize: 18,
  fontWeight: 700,
}

function memoryButtonStyle(active: boolean): CSSProperties {
  return {
    all: 'unset',
    flex: '0 0 auto',
    cursor: 'pointer',
    height: 32,
    padding: '0 10px',
    borderRadius: 10,
    border: `1px solid ${active ? accentAlpha(0.44) : ZH.line}`,
    color: active ? ZH.accent : ZH.textDim,
    background: active ? accentAlpha(0.14) : 'transparent',
    fontFamily: ZH.mono,
    fontSize: 10,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
  }
}

const memoryRowStyle: CSSProperties = {
  borderRadius: 11,
  border: `1px solid ${ZH.line}`,
  background: QUIET_SURFACE,
  padding: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 9,
}

const memorySavedStyle: CSSProperties = {
  borderRadius: 10,
  border: `1px solid ${ZH.line}`,
  padding: '8px 10px',
  color: ZH.textDim,
  fontSize: 13,
  lineHeight: 1.4,
}

const removeAttachmentButtonStyle: CSSProperties = {
  all: 'unset',
  position: 'absolute',
  top: -6,
  right: -6,
  width: 20,
  height: 20,
  borderRadius: 999,
  background: ZH.bg,
  border: `1px solid ${ZH.line}`,
  color: ZH.textDim,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: ZH.mono,
  fontSize: 12,
  cursor: 'pointer',
}

const sentAttachmentStyle: CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 11,
  objectFit: 'cover',
  border: `1px solid ${ZH.line}`,
}

const thinkingStyle: CSSProperties = {
  borderRadius: '17px 17px 17px 5px',
  border: `1px solid ${ZH.line}`,
  background: QUIET_SURFACE,
  color: ZH.textFaint,
  fontFamily: ZH.mono,
  fontSize: 10,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  padding: '11px 13px',
}

const hiddenFileInputStyle: CSSProperties = {
  position: 'fixed',
  left: -9999,
  top: 0,
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
}
