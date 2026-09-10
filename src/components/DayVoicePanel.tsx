import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Panel, SysLabel } from '../design/primitives'
import { FOOD_HUE, ZH, accentAlpha, mixAlpha } from '../design/tokens'
import {
  describeAiError,
  formatAiDebugModel,
  isInsufficientTokens,
  parseDay,
  type FoodItem,
  type ParseDayResult,
} from '../lib/ai'
import { DEFAULT_NOTE_COLOR } from '../lib/colors'
import { dayKey } from '../lib/dates'
import { hapticImpact, hapticSuccess } from '../lib/haptic'
import { captureImage, releasePreview, type CapturedImage } from '../lib/imageCapture'
import { useBalanceStore } from '../lib/tokens'
import { useTypewriterPlaceholder } from '../lib/typewriter'
import { isVoiceAvailable, VoiceRecorder } from '../lib/voice'
import {
  loadWaterColorMode,
  resolveWaterColor,
  subscribeWaterSettingsChanged,
} from '../lib/water'
import { useCaloriesStore } from '../store/calories'
import { useNotesStore } from '../store/notes'
import type { NutritionEstimate, QuickAddData } from '../types/calorie'
import { BalanceSheet } from './BalanceSheet'
import { FoodDraftAiCard } from './FoodDraftControls'
import { PhotoCapture } from './PhotoCapture'

type Phase = 'idle' | 'recording' | 'transcribing' | 'parsing' | 'ready' | 'saving'
type ParsedDayBase = Extract<ParseDayResult, { foods: FoodItem[] }>
type DayFoodDraft = FoodItem & { draftId: string }
type ParsedDay = Omit<ParsedDayBase, 'foods'> & { foods: DayFoodDraft[] }

const COMPACT_CELL_HEIGHT = 40
const COMPACT_CELL_RADIUS = 10
const COMPACT_CELL_PADDING = '0 12px'
const MAX_DAY_PHOTOS = 5
const DAY_VOICE_EXAMPLES = [
  'завтрак овсянка, обед суп, вода литр',
  'утром кофе, днём рис с курицей, вечером творог',
  'фото ужина, капучино 240 мл, заметка: прогулка',
  'выпил 1500 мл воды, ел борщ и яблоко',
] as const

export function DayVoicePanel({
  framed = true,
  autoStartRecording = false,
  initialText = '',
  autoParseNonce = 0,
  helpOpen = false,
  onSaved,
}: {
  framed?: boolean
  autoStartRecording?: boolean
  initialText?: string
  autoParseNonce?: number
  helpOpen?: boolean
  onSaved?: () => void
}) {
  const today = useMemo(() => dayKey(new Date()), [])
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState(initialText)
  const [result, setResult] = useState<ParsedDay | null>(null)
  const [photos, setPhotos] = useState<CapturedImage[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [exhaustedOpen, setExhaustedOpen] = useState(false)
  const [waterColorMode, setWaterColorMode] = useState(() => loadWaterColorMode())
  const voiceRef = useRef<VoiceRecorder | null>(null)
  const autoStartedRef = useRef(false)
  const autoParsedNonceRef = useRef(0)
  const voiceAvailable = useMemo(() => isVoiceAvailable(), [])
  const waterColor = resolveWaterColor(waterColorMode)

  const showToast = useCaloriesStore((s) => s.showToast)
  const addQuickEntriesBulk = useCaloriesStore((s) => s.addQuickEntriesBulk)
  const loadFoodDay = useCaloriesStore((s) => s.loadDay)
  const loadWaterDay = useCaloriesStore((s) => s.loadWaterDay)
  const loadDayMeta = useCaloriesStore((s) => s.loadDayMeta)
  const addWater = useCaloriesStore((s) => s.addWater)
  const setDayLazy = useCaloriesStore((s) => s.setDayLazy)
  const addNote = useNotesStore((s) => s.addNote)
  const loadNoteDay = useNotesStore((s) => s.loadDay)
  const applyBalance = useBalanceStore((s) => s.applyFromResponse)

  useEffect(() => {
    const rec = voiceRef.current
    return () => rec?.stop()
  }, [])

  useEffect(() => {
    return () => {
      for (const photo of photos) releasePreview(photo.previewUrl)
    }
    // Освобождаем только при размонтировании: при обычных изменениях state
    // previewUrl ещё нужен текущей ленте превью.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    return subscribeWaterSettingsChanged(() => setWaterColorMode(loadWaterColorMode()))
  }, [])

  const busy = phase === 'transcribing' || phase === 'parsing' || phase === 'saving'
  const canParse = (text.trim().length >= 3 || photos.length > 0) && !busy && phase !== 'recording'

  const runParse = useCallback(async (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed && photos.length === 0) return
    setPhase('parsing')
    setResult(null)
    try {
      const parsed = await parseDay({
        text: trimmed,
        images: photos.length > 0
          ? photos.map((photo) => ({ data: photo.data, mediaType: photo.mediaType }))
          : null,
      })
      applyBalance(parsed.balance, parsed.unlimited)
      if (isInsufficientTokens(parsed)) {
        setExhaustedOpen(true)
        setPhase('idle')
        return
      }
      if ('error' in parsed) {
        showToast(parsed.error === 'too-large' ? 'фото слишком большое' : 'AI не собрал день')
        setPhase('idle')
        return
      }
      setResult({ ...parsed, foods: parsed.foods.map(toDayFoodDraft) })
      setPhase('ready')
      hapticImpact('light')
    } catch (e) {
      console.error('[day-voice] parse failed', e)
      showToast(describeAiError(e))
      setPhase('idle')
    }
  }, [applyBalance, photos, showToast])

  useEffect(() => {
    if (autoParseNonce <= 0 || autoParsedNonceRef.current === autoParseNonce || !initialText.trim()) return
    autoParsedNonceRef.current = autoParseNonce
    void runParse(initialText)
  }, [autoParseNonce, initialText, runParse])

  const handleVoiceToggle = useCallback(() => {
    if (busy) return
    if (phase === 'recording') {
      voiceRef.current?.stop()
      return
    }
    if (!voiceRef.current) voiceRef.current = new VoiceRecorder()
    void voiceRef.current.start({
      onStart: () => {
        setPhase('recording')
        setResult(null)
        hapticImpact('light')
      },
      onStop: () => {
        setPhase('transcribing')
      },
      onFinal: (t) => {
        setText(t)
        void runParse(t)
      },
      onError: (err) => {
        if (import.meta.env.DEV) console.warn('[day-voice] voice error:', err)
        if (err === 'insufficient-tokens') setExhaustedOpen(true)
        else if (err === 'not-allowed') showToast('микрофон не разрешён')
        else if (err === 'no-speech' || err === 'empty-transcription') showToast('не услышал')
        else if (err === 'too-large') showToast('слишком длинная запись')
        else if (err === 'unavailable' || err === 'mic-failed') showToast('голос недоступен')
        else showToast('AI не распознал')
        setPhase('idle')
      },
      onEnd: () => {
        setPhase((cur) => (cur === 'transcribing' ? 'idle' : cur))
      },
    })
  }, [busy, phase, runParse, showToast])

  useEffect(() => {
    if (!autoStartRecording) {
      autoStartedRef.current = false
      return
    }
    if (autoStartedRef.current || !voiceAvailable || busy || phase !== 'idle') return
    autoStartedRef.current = true
    handleVoiceToggle()
  }, [autoStartRecording, busy, handleVoiceToggle, phase, voiceAvailable])

  const handleSave = async () => {
    if (!result || phase === 'saving') return
    const foods = result.foods.filter((food) => food.name.trim()).map(foodToQuickAdd)
    const notes = result.notes.map((note) => note.trim()).filter(Boolean)
    const waterMl = Math.max(0, Math.round(result.waterMl))
    if (foods.length === 0 && notes.length === 0 && waterMl === 0) {
      showToast('нечего записать')
      return
    }
    setPhase('saving')
    try {
      await Promise.all([
        loadFoodDay(today),
        loadNoteDay(today),
        loadWaterDay(today),
        loadDayMeta(today),
      ])
      const writes: Promise<unknown>[] = [
        setDayLazy(today, true),
        ...notes.map((note) => addNote(today, note, DEFAULT_NOTE_COLOR)),
      ]
      if (foods.length > 0) writes.push(addQuickEntriesBulk(today, foods))
      if (waterMl > 0) writes.push(addWater(today, waterMl))
      await Promise.all(writes)
      hapticSuccess()
      showToast('День записан')
      setText('')
      setResult(null)
      for (const photo of photos) releasePreview(photo.previewUrl)
      setPhotos([])
      setPhase('idle')
      onSaved?.()
    } catch (e) {
      console.error('[day-voice] save failed', e)
      showToast('не записалось')
      setPhase('ready')
    }
  }

  const patchFood = (index: number, patch: Partial<FoodItem>) => {
    setResult((cur) => {
      if (!cur) return cur
      return {
        ...cur,
        foods: cur.foods.map((food, i) => (i === index ? applyDayFoodPatch(food, patch) : food)),
      }
    })
  }

  const removeFood = (index: number) => {
    setResult((cur) => {
      if (!cur) return cur
      return { ...cur, foods: cur.foods.filter((_, i) => i !== index) }
    })
  }

  const patchNote = (index: number, text: string) => {
    setResult((cur) => {
      if (!cur) return cur
      return { ...cur, notes: cur.notes.map((note, i) => (i === index ? text : note)) }
    })
  }

  const removeNote = (index: number) => {
    setResult((cur) => {
      if (!cur) return cur
      return { ...cur, notes: cur.notes.filter((_, i) => i !== index) }
    })
  }

  const patchWater = (waterMl: number) => {
    setResult((cur) => (cur ? { ...cur, waterMl } : cur))
  }

  const pickFromGallery = async () => {
    if (busy || photos.length >= MAX_DAY_PHOTOS) {
      if (photos.length >= MAX_DAY_PHOTOS) showToast(`максимум ${MAX_DAY_PHOTOS} фото`)
      return
    }
    try {
      const img = await captureImage({ fromCamera: false })
      if (!img) return
      setPhotos((prev) => [...prev, img])
      setResult(null)
      hapticImpact('light')
    } catch (e) {
      showToast(
        e instanceof Error && e.message === 'file-too-large'
          ? 'фото слишком большое'
          : 'не удалось загрузить фото',
      )
    }
  }

  const handleTakePhoto = () => {
    if (busy) return
    if (photos.length >= MAX_DAY_PHOTOS) {
      showToast(`максимум ${MAX_DAY_PHOTOS} фото`)
      return
    }
    setCameraOpen(true)
  }

  const handleCameraCaptured = (img: CapturedImage) => {
    setPhotos((prev) => [...prev, img])
    setResult(null)
    setCameraOpen(false)
    hapticImpact('light')
  }

  const handleRemovePhotoAt = (index: number) => {
    setPhotos((prev) => {
      const photo = prev[index]
      if (photo) releasePreview(photo.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
    setResult(null)
    if (phase === 'ready') setPhase('idle')
  }

  const totalKcal = result?.foods.reduce((sum, item) => sum + item.kcal, 0) ?? 0
  const canSaveDraft = result
    ? result.foods.some((food) => food.name.trim()) ||
      result.notes.some((note) => note.trim()) ||
      result.waterMl > 0
    : false
  const dayHint = useTypewriterPlaceholder(
    DAY_VOICE_EXAMPLES,
    phase === 'idle' && !text && !result && photos.length === 0,
  )

  const content = (
    <>
      {framed && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 1,
                background: ZH.accent,
                boxShadow: `0 0 8px ${ZH.accent}`,
              }}
            />
            <SysLabel>день голосом</SysLabel>
          </div>
          {result && (
            <span
              style={{
                fontFamily: ZH.mono,
                fontSize: 9,
                color: ZH.warn,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
              }}
            >
              AI-черновик
            </span>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <input
          type="text"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setResult(null)
            if (phase === 'ready') setPhase('idle')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void runParse(text)
          }}
          placeholder={dayHint || 'завтрак овсянка, обед суп, выпил литр воды...'}
          style={{
            flex: 1,
            height: COMPACT_CELL_HEIGHT,
            minHeight: COMPACT_CELL_HEIGHT,
            maxHeight: COMPACT_CELL_HEIGHT,
            border: `1px solid ${ZH.line}`,
            borderRadius: COMPACT_CELL_RADIUS,
            background: 'rgba(18,23,36,0.45)',
            padding: '10px 12px',
            fontSize: 12,
            lineHeight: '18px',
            color: ZH.text,
            fontFamily: 'inherit',
            outline: 'none',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        />
        {voiceAvailable && (
          <CompactIconButton
            active={phase === 'recording'}
            disabled={busy}
            color={phase === 'recording' ? ZH.warn : ZH.accent}
            onClick={handleVoiceToggle}
            ariaLabel={phase === 'recording' ? 'Остановить запись дня' : 'Записать день голосом'}
          >
            {phase === 'transcribing' || phase === 'parsing' ? <PulseGlyph /> : <MicGlyph />}
          </CompactIconButton>
        )}
        <CompactIconButton
          active={photos.length > 0}
          disabled={busy || photos.length >= MAX_DAY_PHOTOS}
          color={ZH.accent}
          onClick={handleTakePhoto}
          ariaLabel="сфотографировать еду для дня"
        >
          <CameraGlyph />
        </CompactIconButton>
        <CompactIconButton
          disabled={busy || photos.length >= MAX_DAY_PHOTOS}
          color={ZH.accent}
          onClick={() => void pickFromGallery()}
          ariaLabel="выбрать фото еды из галереи"
        >
          <GalleryGlyph />
        </CompactIconButton>
      </div>

      {photos.length > 0 && (
        <PhotoPreviewRow photos={photos} onRemove={handleRemovePhotoAt} />
      )}

      {helpOpen && <DayVoiceHelp />}

      <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr 1fr' : '1fr', gap: 8 }}>
        <button
          type="button"
          onClick={() => void runParse(text)}
          disabled={!canParse}
          style={{
            all: 'unset',
            cursor: canParse ? 'pointer' : 'not-allowed',
            height: COMPACT_CELL_HEIGHT,
            padding: COMPACT_CELL_PADDING,
            borderRadius: COMPACT_CELL_RADIUS,
            textAlign: 'center',
            border: `1px solid ${canParse ? accentAlpha(0.45) : ZH.line}`,
            background: canParse ? accentAlpha(0.08) : 'rgba(148,178,224,0.04)',
            color: canParse ? ZH.accent : ZH.textFaint,
            fontFamily: ZH.mono,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
          }}
        >
          {phaseLabel(phase)}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={phase === 'saving' || !canSaveDraft}
            style={{
              all: 'unset',
              cursor: phase === 'saving' ? 'wait' : canSaveDraft ? 'pointer' : 'not-allowed',
              height: COMPACT_CELL_HEIGHT,
              padding: COMPACT_CELL_PADDING,
              borderRadius: COMPACT_CELL_RADIUS,
              textAlign: 'center',
              border: `1px solid ${canSaveDraft ? accentAlpha(0.55) : ZH.line}`,
              background: canSaveDraft
                ? `linear-gradient(180deg, ${accentAlpha(0.78)}, ${accentAlpha(0.48)})`
                : 'rgba(148,178,224,0.04)',
              color: canSaveDraft ? '#06131F' : ZH.textFaint,
              fontFamily: ZH.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}
          >
            {phase === 'saving' ? 'пишу...' : 'записать день'}
          </button>
        )}
      </div>

      {result && (
        <div
          className="animate-fade-in"
          style={{
            borderTop: `1px solid ${ZH.line}`,
            paddingTop: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            <SummaryChip color={FOOD_HUE} label="еда" value={`${result.foods.length} · ${totalKcal}`} />
            <SummaryChip color={waterColor} label="вода" value={`${result.waterMl} мл`} />
            <SummaryChip color={ZH.accent} label="заметки" value={String(result.notes.length)} />
          </div>
          {import.meta.env.DEV && result.debugModel && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                padding: '8px 10px',
                borderRadius: 10,
                border: `1px solid ${mixAlpha(ZH.accent, 30)}`,
                background: mixAlpha(ZH.accent, 8),
              }}
            >
              <SysLabel color={ZH.accent}>dev · нейронка</SysLabel>
              <span
                style={{
                  fontFamily: ZH.mono,
                  fontSize: 10,
                  color: ZH.textDim,
                  textAlign: 'right',
                  wordBreak: 'break-all',
                }}
              >
                {formatAiDebugModel(result.debugModel)}
              </span>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.waterMl > 0 && (
              <EditableWaterRow
                color={waterColor}
                value={result.waterMl}
                onChange={patchWater}
                onRemove={() => patchWater(0)}
              />
            )}
            {result.foods.map((food, index) => (
              <EditableFoodRow
                key={food.draftId}
                food={food}
                index={index}
                onPatch={patchFood}
                onRemove={removeFood}
              />
            ))}
            {result.notes.map((note, index) => (
              <EditableNoteRow
                key={`note_${index}`}
                value={note}
                index={index}
                onChange={patchNote}
                onRemove={removeNote}
              />
            ))}
          </div>
        </div>
      )}

      <BalanceSheet
        open={exhaustedOpen}
        onClose={() => setExhaustedOpen(false)}
        exhausted
      />
      {cameraOpen && (
        <PhotoCapture
          onCaptured={handleCameraCaptured}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </>
  )

  if (!framed) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 10 }}>
        {content}
      </div>
    )
  }

  return (
    <Panel style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {content}
    </Panel>
  )
}

function phaseLabel(phase: Phase): string {
  switch (phase) {
    case 'recording':
      return 'идёт запись'
    case 'transcribing':
      return 'распознаю...'
    case 'parsing':
      return 'AI разбирает...'
    case 'ready':
      return 'разобрать заново'
    case 'saving':
      return 'сохраняю...'
    case 'idle':
      return 'разобрать день'
  }
}

function foodToQuickAdd(item: FoodItem): QuickAddData {
  const name = item.name.trim()
  const grams = item.grams > 0 ? item.grams : 100
  const per100Factor = grams / 100
  return {
    name: grams > 0 ? `${Math.round(grams)} г · ${name}` : name,
    kcal: Math.max(0, Math.round(item.kcal)),
    carbs: round1(Math.max(0, item.carbs * per100Factor)),
    fat: round1(Math.max(0, item.fat * per100Factor)),
    protein: round1(Math.max(0, item.protein * per100Factor)),
    ...(item.fiber !== undefined ? { fiber: round1(Math.max(0, item.fiber * per100Factor)) } : {}),
    estimate: estimateFromAiItem(item),
  }
}

function estimateFromAiItem(item: FoodItem): NutritionEstimate {
  return {
    source: 'ai',
    confidence: Math.max(0, Math.min(1, item.confidence)),
    ...(item.confidenceReason ? { confidenceReason: item.confidenceReason } : {}),
    portionBasis: item.portionBasis,
    ...(item.basisLabel ? { basisLabel: item.basisLabel } : {}),
    ...(item.brandDataStatus !== 'not_provided' ? { brandDataStatus: item.brandDataStatus } : {}),
    ...(item.brandDataLabel ? { brandDataLabel: item.brandDataLabel } : {}),
    dataSource: 'AI',
  }
}

function toDayFoodDraft(item: FoodItem, index: number): DayFoodDraft {
  const grams = item.grams > 0 ? item.grams : 100
  const per100Factor = 100 / grams
  return {
    ...item,
    draftId: `food_${Date.now()}_${index}`,
    grams: Math.max(0, Math.round(grams)),
    kcal: Math.max(0, Math.round(item.kcal)),
    carbs: round1(Math.max(0, item.carbs * per100Factor)),
    fat: round1(Math.max(0, item.fat * per100Factor)),
    protein: round1(Math.max(0, item.protein * per100Factor)),
    ...(item.fiber !== undefined ? { fiber: round1(Math.max(0, item.fiber * per100Factor)) } : {}),
  }
}

function applyDayFoodPatch(food: DayFoodDraft, patch: Partial<FoodItem>): DayFoodDraft {
  if (typeof patch.grams !== 'number' || typeof patch.kcal === 'number') {
    return { ...food, ...patch }
  }
  const grams = Math.max(0, Math.round(patch.grams))
  const baseGrams = food.grams > 0 ? food.grams : 100
  const kcal = Math.max(0, Math.round((food.kcal * grams) / baseGrams))
  return { ...food, ...patch, grams, kcal }
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

function DayVoiceHelp() {
  return (
    <div
      className="animate-fade-in"
      style={{
        padding: '10px 12px',
        borderRadius: COMPACT_CELL_RADIUS,
        border: `1px solid ${accentAlpha(0.25)}`,
        background: accentAlpha(0.05),
        display: 'flex',
        flexDirection: 'column',
        color: ZH.textDim,
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      Расскажи день одним куском: что ел, сколько воды выпил, что оставить
      заметкой. Можно добавить фото еды с камеры или из галереи. AI соберёт
      примерный черновик, а перед сохранением его можно проверить. Удержание
      кнопки «день» на главном экране пишет голос без открытия окна.
    </div>
  )
}

function CompactIconButton({
  active = false,
  disabled = false,
  color,
  onClick,
  ariaLabel,
  children,
}: {
  active?: boolean
  disabled?: boolean
  color: string
  onClick: () => void
  ariaLabel: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        all: 'unset',
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: COMPACT_CELL_HEIGHT,
        height: COMPACT_CELL_HEIGHT,
        flexShrink: 0,
        borderRadius: COMPACT_CELL_RADIUS,
        border: `1px solid ${active ? mixAlpha(color, 55) : ZH.line}`,
        background: active ? mixAlpha(color, 11) : 'rgba(148,178,224,0.04)',
        color: disabled ? ZH.textFaint : color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.55 : 1,
        boxSizing: 'border-box',
      }}
    >
      {children}
    </button>
  )
}

function PhotoPreviewRow({
  photos,
  onRemove,
}: {
  photos: CapturedImage[]
  onRemove: (index: number) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {photos.map((photo, index) => (
        <div
          key={`${photo.previewUrl}_${index}`}
          style={{
            position: 'relative',
            width: 56,
            height: 56,
            borderRadius: 8,
            overflow: 'hidden',
            border: `1px solid ${ZH.line}`,
            background: 'rgba(18,23,36,0.45)',
          }}
        >
          <img
            src={photo.previewUrl}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label="убрать фото"
            style={{
              all: 'unset',
              cursor: 'pointer',
              position: 'absolute',
              top: 2,
              right: 2,
              width: 18,
              height: 18,
              borderRadius: 999,
              background: 'rgba(0,0,0,0.7)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

function SummaryChip({
  color,
  label,
  value,
}: {
  color: string
  label: string
  value: string
}) {
  return (
    <div
      style={{
        border: `1px solid ${mixAlpha(color, 35)}`,
        borderRadius: COMPACT_CELL_RADIUS,
        background: mixAlpha(color, 8),
        height: COMPACT_CELL_HEIGHT,
        padding: '0 9px',
        minWidth: 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          fontFamily: ZH.mono,
          fontSize: 8,
          color: ZH.textFaint,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          marginBottom: 2,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: ZH.mono,
          fontSize: 11,
          color,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function EditableWaterRow({
  color,
  value,
  onChange,
  onRemove,
}: {
  color: string
  value: number
  onChange: (value: number) => void
  onRemove: () => void
}) {
  return (
    <div
      style={{
        border: `1px solid ${mixAlpha(color, 35)}`,
        borderRadius: COMPACT_CELL_RADIUS,
        background: mixAlpha(color, 7),
        padding: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: color,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
      <SysLabel color={color}>вода</SysLabel>
      <MiniNumberField
        label="мл"
        value={value}
        color={color}
        max={10000}
        onChange={onChange}
        style={{ flex: 1 }}
      />
      <DeleteDraftButton onClick={onRemove} ariaLabel="Удалить воду" />
    </div>
  )
}

function EditableFoodRow({
  food,
  index,
  onPatch,
  onRemove,
}: {
  food: FoodItem
  index: number
  onPatch: (index: number, patch: Partial<FoodItem>) => void
  onRemove: (index: number) => void
}) {
  const [originalFood] = useState(food)
  return (
    <FoodDraftAiCard
      original={originalFood}
      edited={food}
      onChange={(next) => onPatch(index, next)}
      onNameChange={(name) => onPatch(index, { name })}
      nameFallback={`еда ${index + 1}`}
      macroBasis="per100"
      scaleMacros={false}
      scaleKcalOnGrams
      footer={
        <button
          type="button"
          onClick={() => onRemove(index)}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '10px 0',
            textAlign: 'center',
            borderRadius: 10,
            border: `1px solid ${ZH.line}`,
            background: 'rgba(148,178,224,0.04)',
            fontFamily: ZH.mono,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: ZH.textDim,
          }}
        >
          удалить
        </button>
      }
    />
  )
}

function EditableNoteRow({
  value,
  index,
  onChange,
  onRemove,
}: {
  value: string
  index: number
  onChange: (index: number, value: string) => void
  onRemove: (index: number) => void
}) {
  return (
    <div
      style={{
        border: `1px solid ${accentAlpha(0.3)}`,
        borderRadius: COMPACT_CELL_RADIUS,
        background: accentAlpha(0.05),
        padding: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: ZH.accent,
          boxShadow: `0 0 8px ${ZH.accent}`,
          flexShrink: 0,
        }}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(index, e.target.value)}
        aria-label={`заметка ${index + 1}`}
        style={{
          flex: 1,
          minWidth: 0,
          height: COMPACT_CELL_HEIGHT,
          border: `1px solid ${ZH.line}`,
          borderRadius: COMPACT_CELL_RADIUS,
          background: 'rgba(18,23,36,0.45)',
          padding: '0 10px',
          color: ZH.text,
          fontSize: 13,
          fontFamily: 'inherit',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      <DeleteDraftButton onClick={() => onRemove(index)} ariaLabel="Удалить заметку" />
    </div>
  )
}

function MiniNumberField({
  label,
  value,
  color,
  max,
  onChange,
  style,
}: {
  label: string
  value: number
  color: string
  max: number
  onChange: (value: number) => void
  style?: CSSProperties
}) {
  return (
    <label
      style={{
        height: COMPACT_CELL_HEIGHT,
        border: `1px solid ${ZH.line}`,
        borderRadius: COMPACT_CELL_RADIUS,
        background: 'rgba(18,23,36,0.45)',
        padding: '0 8px',
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        minWidth: 0,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      <input
        type="text"
        inputMode="numeric"
        value={String(Math.round(value))}
        onChange={(e) => onChange(parseDraftNumber(e.target.value, max))}
        aria-label={label}
        style={{
          flex: 1,
          minWidth: 0,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 0,
          color: ZH.text,
          fontFamily: ZH.mono,
          fontSize: 12,
          fontWeight: 600,
          textAlign: 'right',
          boxSizing: 'border-box',
        }}
      />
      <span
        style={{
          flexShrink: 0,
          fontFamily: ZH.mono,
          fontSize: 9,
          color,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </label>
  )
}

function DeleteDraftButton({
  onClick,
  ariaLabel,
}: {
  onClick: () => void
  ariaLabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        all: 'unset',
        cursor: 'pointer',
        width: 28,
        height: 28,
        flexShrink: 0,
        borderRadius: 8,
        border: `1px solid ${ZH.line}`,
        color: ZH.textDim,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: ZH.mono,
        fontSize: 14,
        lineHeight: 1,
      }}
    >
      ×
    </button>
  )
}

function parseDraftNumber(value: string, max: number): number {
  const n = Math.round(Number(value.replace(',', '.')))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(max, n)
}

function MicGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3Z" />
      <path d="M5 11a7 7 0 0 0 14 0" strokeLinecap="round" />
      <path d="M12 18v3" strokeLinecap="round" />
    </svg>
  )
}

function PulseGlyph() {
  return (
    <span
      className="animate-pulse"
      style={{
        width: 14,
        height: 14,
        borderRadius: 999,
        border: `2px solid ${ZH.accent}`,
        boxShadow: `0 0 12px ${accentAlpha(0.5)}`,
      }}
    />
  )
}

function CameraGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 7.5 8.5 5h7L17 7.5h2.2A2.3 2.3 0 0 1 21.5 9.8v7.4a2.3 2.3 0 0 1-2.3 2.3H4.8a2.3 2.3 0 0 1-2.3-2.3V9.8a2.3 2.3 0 0 1 2.3-2.3H7Z" strokeLinejoin="round" />
      <circle cx="12" cy="13.5" r="3.2" />
    </svg>
  )
}

function GalleryGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2.2" />
      <path d="m7 16 3.2-3.2 2.4 2.4 2.2-2.2L18 16" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="15.8" cy="9.2" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}
