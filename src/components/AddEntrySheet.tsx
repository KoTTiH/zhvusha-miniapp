import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SysLabel } from '../design/primitives'
import { FOOD_HUE, ZH, accentAlpha, mixAlpha } from '../design/tokens'
import {
  AiError,
  describeAiError,
  formatAiDebugModel,
  isInsufficientTokens,
  parseFood,
  type AiDebugModel,
  type FoodItem,
} from '../lib/ai'
import { useBalanceStore } from '../lib/tokens'
import { BalanceSheet } from './BalanceSheet'
import { FoodDraftAiCard } from './FoodDraftControls'
import { hapticImpact, hapticSuccess } from '../lib/haptic'
import { captureImage, releasePreview, type CapturedImage } from '../lib/imageCapture'
import { PhotoCapture } from './PhotoCapture'
import { mealByTime, resolveEntry, roundKcal } from '../lib/nutrition'
import { foodSourceLine, quickAddSourceLine } from '../lib/nutritionEstimate'
import { useCaloriesStore } from '../store/calories'
import { useNotesStore } from '../store/notes'
import { DEFAULT_NOTE_COLOR } from '../lib/colors'
import { dayKey } from '../lib/dates'
import { FOOD_EXAMPLES, NOTE_EXAMPLES, useTypewriterPlaceholder } from '../lib/typewriter'
import { VoiceRecorder, isVoiceAvailable } from '../lib/voice'
import {
  type Food,
  type FoodEntry,
  type Meal,
  type MealType,
  type NutritionEstimate,
  type NutritionPortionBasis,
  type QuickAddData,
  type RecentItem,
  type UsualBundlePreference,
} from '../types/calorie'
import type { DayKey } from '../types/note'
import { BottomSheet } from './BottomSheet'

type TabId = 'food' | 'note'

const TAB_LABEL: Record<TabId, string> = {
  food: 'еда',
  note: 'заметка',
}

const TAB_HUE: Record<TabId, string> = {
  food: FOOD_HUE,
  note: 'var(--zh-accent)',
}

const RECENT_MEAL_META: Record<MealType, string> = {
  b: 'утро',
  l: 'день',
  d: 'вечер',
  s: 'поздно',
}
const USUAL_LOOKBACK_DAYS = 14
const USUAL_MIN_DAYS = 3
const USUAL_MIN_LEAD_DAYS = 2
const USUAL_BUNDLE_OPTIONAL_RATIO = 0.65
const SMART_HISTORY_LIMIT = 4

type FoodMatch =
  | { kind: 'food'; food: Food }
  | { kind: 'meal'; meal: Meal }

type FoodShortcut =
  | { kind: 'food'; food: Food; meta: string; key: string; recentItem?: RecentItem }
  | { kind: 'meal'; meal: Meal; meta: string; key: string }
  | { kind: 'quick'; quickAdd: QuickAddData; meta: string; key: string; recentItem?: RecentItem }
  | {
    kind: 'bundle'
    name: string
    items: QuickAddData[]
    rawItems: QuickAddData[]
    meta: string
    key: string
    preference?: UsualBundlePreference
  }

type BundleDraftItem = {
  id: string
  key: string
  quickAdd: QuickAddData
  factor: number
  included: boolean
}

type BundleDraft = {
  key: string
  name: string
  meta: string
  hasPreference: boolean
  items: BundleDraftItem[]
}

type SmartHistoryAction = {
  id: string
  label: string
  detail?: string
  createdAt: number
}

export function AddEntrySheet() {
  const addSheet = useCaloriesStore((s) => s.addSheet)
  const closeAddSheet = useCaloriesStore((s) => s.closeAddSheet)
  const open = addSheet !== null

  return (
    <BottomSheet
      open={open}
      onClose={closeAddSheet}
      swipeAnywhere
      hideClose
      ariaLabel={addSheet?.initialTab === 'note' ? 'добавить заметку' : 'добавить еду'}
    >
      {addSheet ? (
        <AddEntrySheetContent
          key={addSheet.openedAt}
          day={addSheet.day}
          initialTab={addSheet.initialTab}
        />
      ) : null}
    </BottomSheet>
  )
}

function AddEntrySheetContent({
  day,
  initialTab,
}: {
  day: DayKey
  initialTab?: TabId
}) {
  const tab: TabId = initialTab ?? 'food'
  const closeAddSheet = useCaloriesStore((s) => s.closeAddSheet)

  const now = new Date()
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(
    2,
    '0',
  )}`

  const hue = TAB_HUE[tab]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 4,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: 1,
              background: hue,
              boxShadow: `0 0 8px ${hue}`,
            }}
          />
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.22em',
              color: ZH.text,
              textTransform: 'uppercase',
            }}
          >
            {TAB_LABEL[tab]}
          </span>
        </div>
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 11,
            color: ZH.textFaint,
            letterSpacing: '0.14em',
          }}
        >
          {time}
        </span>
      </div>

      {tab === 'food' && <FoodTab day={day} onDone={closeAddSheet} />}
      {tab === 'note' && <NoteTab day={day} onDone={closeAddSheet} />}
    </div>
  )
}

function NoteTab({ day, onDone }: { day: DayKey; onDone: () => void }) {
  const addNote = useNotesStore((s) => s.addNote)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const placeholder = useTypewriterPlaceholder(NOTE_EXAMPLES, text.length === 0 && !saved)

  const disabled = text.trim().length === 0

  const handleSave = async () => {
    const trimmed = text.trim()
    if (!trimmed) return

    await addNote(day, trimmed, DEFAULT_NOTE_COLOR)
    setText('')
    setSaved(true)
    hapticSuccess()

    window.setTimeout(() => {
      onDone()
    }, 700)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            padding: '0 2px 8px',
          }}
        >
          <SysLabel>заметка</SysLabel>
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            aria-label={helpOpen ? 'скрыть подсказку' : 'как пользоваться'}
            aria-expanded={helpOpen}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 18,
              height: 18,
              borderRadius: 999,
              border: `1px solid ${helpOpen ? accentAlpha(0.5) : ZH.line}`,
              background: helpOpen ? accentAlpha(0.14) : 'transparent',
              color: helpOpen ? ZH.accent : ZH.textDim,
              fontFamily: ZH.mono,
              fontSize: 11,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ?
          </button>
        </div>
        {helpOpen && (
          <div style={{ paddingBottom: 10 }}>
            <NoteHelp />
          </div>
        )}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={5}
          style={{
            width: '100%',
            border: `1px solid ${ZH.line}`,
            borderRadius: 10,
            background: 'rgba(18,23,36,0.45)',
            padding: '12px 14px',
            fontSize: 14,
            color: ZH.text,
            fontFamily: 'inherit',
            outline: 'none',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {!saved ? (
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={disabled}
          style={{
            all: 'unset',
            padding: '14px 0',
            borderRadius: 12,
            textAlign: 'center',
            background: disabled
              ? 'rgba(148,178,224,0.06)'
              : `linear-gradient(180deg, ${accentAlpha(0.8)}, ${accentAlpha(0.53)})`,
            border: `1px solid ${disabled ? ZH.line : ZH.accent}`,
            boxShadow: disabled
              ? 'none'
              : `0 0 24px ${accentAlpha(0.4)}, 0 0 0 1px ${accentAlpha(0.13)} inset`,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: '0.22em',
              color: disabled ? ZH.textDim : '#06131F',
              textTransform: 'uppercase',
            }}
          >
            записать
          </span>
        </button>
      ) : (
        <EventLoggedPill />
      )}
    </div>
  )
}

function EventLoggedPill() {
  const hue = 'var(--zh-accent)'
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: 12,
        border: `1px solid ${accentAlpha(0.4)}`,
        background: accentAlpha(0.08),
        boxShadow: `0 0 20px ${accentAlpha(0.2)}`,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: 5,
          border: `1px solid ${hue}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path
            d="M2 6.5 L5 9 L10 3"
            stroke={hue}
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <SysLabel color={hue}>записано</SysLabel>
      </div>
    </div>
  )
}

function FoodTab({ day, onDone }: { day: DayKey; onDone: () => void }) {
  const addEntry = useCaloriesStore((s) => s.addEntry)
  const addQuickEntriesBulk = useCaloriesStore((s) => s.addQuickEntriesBulk)
  const rememberUsualBundlePreference = useCaloriesStore((s) => s.rememberUsualBundlePreference)
  const forgetUsualBundlePreference = useCaloriesStore((s) => s.forgetUsualBundlePreference)
  const removeRecent = useCaloriesStore((s) => s.removeRecent)
  const restoreRecent = useCaloriesStore((s) => s.restoreRecent)
  const replaceRecent = useCaloriesStore((s) => s.replaceRecent)
  const loadRange = useCaloriesStore((s) => s.loadRange)
  const entriesByDay = useCaloriesStore((s) => s.entriesByDay)
  const foods = useCaloriesStore((s) => s.foods)
  const meals = useCaloriesStore((s) => s.meals)
  const recent = useCaloriesStore((s) => s.recent)
  const showToast = useCaloriesStore((s) => s.showToast)
  const openScanner = useCaloriesStore((s) => s.openScanner)
  const closeAddSheet = useCaloriesStore((s) => s.closeAddSheet)
  const goalKcal = useCaloriesStore((s) => s.goal.kcal)
  const openGoalEditor = useCaloriesStore((s) => s.openGoalEditor)

  const [name, setName] = useState('')
  const [kcalPer100, setKcalPer100] = useState('')
  const [weight, setWeight] = useState('')
  const [proteinPer100, setProteinPer100] = useState('')
  const [fatPer100, setFatPer100] = useState('')
  const [carbsPer100, setCarbsPer100] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiPhotos, setAiPhotos] = useState<CapturedImage[]>([])
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceTranscribing, setVoiceTranscribing] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [exhaustedOpen, setExhaustedOpen] = useState(false)
  const [bundleDraft, setBundleDraft] = useState<BundleDraft | null>(null)
  const [smartHistory, setSmartHistory] = useState<SmartHistoryAction[]>([])
  const [quickOpen, setQuickOpen] = useState(false)
  const applyBalance = useBalanceStore((s) => s.applyFromResponse)
  const foodPlaceholder = useTypewriterPlaceholder(
    FOOD_EXAMPLES,
    name.length === 0 && aiPhotos.length === 0,
  )
  const MAX_PHOTOS = 5
  // Результат AI-анализа: массив блюд (от 1 до 12). UI адаптируется —
  // для одного показывает подробную карточку, для нескольких — список
  // мини-карточек с общей суммой.
  const [aiHits, setAiHits] = useState<FoodItem[] | null>(null)
  // Редактируемые копии — пользователь правит вес/ккал/макро прямо в
  // карточке. Originals (aiHits) храним для пересчёта по scale-чипам (½×, 2×).
  const [aiEdited, setAiEdited] = useState<FoodItem[] | null>(null)
  // Оригинальные вход парса — нужны для refine (повторный AI-запрос с
  // уточнением «+ масло», «+ большая порция»). Фото из aiOriginalImages
  // освобождаются на confirm/dismiss, а не сразу после parse.
  const [aiOriginalDesc, setAiOriginalDesc] = useState('')
  const [aiOriginalImages, setAiOriginalImages] = useState<CapturedImage[]>([])
  const [aiAnalysisId, setAiAnalysisId] = useState<number | null>(null)
  const [aiDebugModel, setAiDebugModel] = useState<AiDebugModel | null>(null)
  const [aiRefineBusy, setAiRefineBusy] = useState(false)
  const voiceRef = useRef<VoiceRecorder | null>(null)
  const smartHistorySeq = useRef(0)
  const voiceAvailable = useMemo(() => isVoiceAvailable(), [])
  const shortcutMeal = useMemo(() => mealByTime(), [])
  const usualDays = useMemo(() => previousDayKeys(day, USUAL_LOOKBACK_DAYS), [day])

  useEffect(() => {
    const rec = voiceRef.current
    return () => {
      rec?.stop()
    }
  }, [])

  useEffect(() => {
    return () => {
      for (const p of aiPhotos) releasePreview(p.previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadRange(usualDays)
  }, [loadRange, usualDays])

  const trimmedName = name.trim()

  const recordSmartHistory = useCallback((label: string, detail?: string) => {
    const createdAt = Date.now()
    smartHistorySeq.current += 1
    const action: SmartHistoryAction = {
      id: `${createdAt}_${smartHistorySeq.current}`,
      label,
      ...(detail ? { detail } : {}),
      createdAt,
    }
    setSmartHistory((prev) => [action, ...prev].slice(0, SMART_HISTORY_LIMIT))
  }, [])

  const matches = useMemo<FoodMatch[]>(() => {
    const q = trimmedName.toLowerCase()
    if (!q) return []
    const items: FoodMatch[] = []
    for (const f of Object.values(foods)) {
      if (f.archived) continue
      if (f.name.toLowerCase().includes(q)) items.push({ kind: 'food', food: f })
    }
    for (const m of Object.values(meals)) {
      if (m.name.toLowerCase().includes(q)) items.push({ kind: 'meal', meal: m })
    }
    items.sort((a, b) => {
      const an = a.kind === 'food' ? a.food.name : a.meal.name
      const bn = b.kind === 'food' ? b.food.name : b.meal.name
      return an.localeCompare(bn, 'ru')
    })
    return items.slice(0, 8)
  }, [trimmedName, foods, meals])
  const showMatches = !aiHits && trimmedName.length > 0 && matches.length > 0

  const shortcuts = useMemo<FoodShortcut[]>(() => {
    const q = trimmedName.toLowerCase()
    if (!q || aiHits || matches.length > 0) return []
    return buildFoodShortcuts(
      recent.entries,
      recent.usualBundlePrefs ?? [],
      foods,
      meals,
      shortcutMeal,
      entriesByDay,
      usualDays,
    ).filter((item) => shortcutMatchesQuery(item, q))
  }, [trimmedName, aiHits, matches.length, recent, foods, meals, shortcutMeal, entriesByDay, usualDays])

  const handlePickFood = useCallback(
    async (food: Food) => {
      const serving = food.servings[0]
      if (!serving) {
        showToast('у продукта нет порций')
        return
      }
      await addEntry(day, { kind: 'food', foodId: food.id, servingId: serving.id })
      hapticSuccess()
      onDone()
    },
    [day, addEntry, showToast, onDone],
  )

  const handlePickMeal = useCallback(
    async (meal: Meal) => {
      await addEntry(day, { kind: 'mealTemplate', mealId: meal.id })
      hapticSuccess()
      onDone()
    },
    [day, addEntry, onDone],
  )

  const handlePickShortcut = useCallback(
    async (item: FoodShortcut) => {
      if (item.kind === 'food') {
        await handlePickFood(item.food)
        return
      }
      if (item.kind === 'meal') {
        await handlePickMeal(item.meal)
        return
      }
      if (item.kind === 'bundle') {
        setBundleDraft(createBundleDraft(item))
        recordSmartHistory('открыт обычный приём', item.name)
        hapticImpact('light')
        return
      }
      await addEntry(day, { kind: 'quick', data: item.quickAdd })
      hapticSuccess()
      onDone()
    },
    [day, addEntry, handlePickFood, handlePickMeal, onDone, recordSmartHistory],
  )

  const handleRemoveShortcutRecent = useCallback(
    async (item: FoodShortcut) => {
      const recentItem = shortcutRecentItem(item)
      if (!recentItem) return
      const title = shortcutTitle(item)
      try {
        await removeRecent(recentItem)
        setBundleDraft(null)
        recordSmartHistory('убрано из быстро', title)
        showToast('убрано из быстро', async () => {
          await restoreRecent(recentItem)
          recordSmartHistory('возвращено в быстро', title)
        })
        hapticImpact('light')
      } catch (e) {
        console.warn('[recent] remove failed', e)
        showToast('не удалось убрать из быстро')
      }
    },
    [recordSmartHistory, removeRecent, restoreRecent, showToast],
  )

  const handleRestoreShortcutPortion = useCallback(
    async (item: FoodShortcut) => {
      const recentItem = shortcutRecentItem(item)
      const quickAdd = recentItem?.quickAdd
      if (!recentItem || !quickAdd) return
      const restored = restoreQuickAddPortion(quickAdd)
      if (!restored) return
      const nextRecent: RecentItem = { ...recentItem, quickAdd: restored }
      const title = shortcutTitle(item)
      try {
        await replaceRecent(recentItem, nextRecent)
        setBundleDraft(null)
        recordSmartHistory('порция возвращена', title)
        showToast('порция возвращена', async () => {
          await replaceRecent(nextRecent, recentItem)
          recordSmartHistory('правка порции возвращена', title)
        })
        hapticImpact('light')
      } catch (e) {
        console.warn('[recent] restore portion failed', e)
        showToast('не удалось вернуть порцию')
      }
    },
    [recordSmartHistory, replaceRecent, showToast],
  )

  const handleBundleFactorChange = useCallback((id: string, factor: number) => {
    const item = bundleDraft?.items.find((entry) => entry.id === id)
    setBundleDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map((item) => (item.id === id ? { ...item, factor } : item)),
      }
    })
    if (item) recordSmartHistory(`порция ${formatBundleFactor(factor)}×`, item.quickAdd.name)
  }, [bundleDraft, recordSmartHistory])

  const handleBundleItemRemove = useCallback((id: string) => {
    const item = bundleDraft?.items.find((entry) => entry.id === id)
    setBundleDraft((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map((item) => (item.id === id ? { ...item, included: false } : item)),
      }
    })
    if (item) recordSmartHistory('позиция снята', item.quickAdd.name)
  }, [bundleDraft, recordSmartHistory])

  const handleBundleConfirm = useCallback(async () => {
    const draft = bundleDraft
    if (!draft) return
    const items = visibleBundleDraftItems(draft)
      .map((item) => scaleQuickAdd(item.quickAdd, item.factor))
      .filter((item) => item.kcal > 0)
    if (items.length === 0) {
      showToast('нечего записать')
      return
    }
    if (isBundleDraftEdited(draft)) {
      try {
        await rememberUsualBundlePreference(bundlePreferenceFromDraft(draft))
      } catch (e) {
        console.warn('[usual-bundle] preference save failed', e)
      }
    }
    await addQuickEntriesBulk(day, items)
    setBundleDraft(null)
    hapticSuccess()
    onDone()
  }, [day, addQuickEntriesBulk, bundleDraft, onDone, rememberUsualBundlePreference, showToast])

  const handleBundleReset = useCallback(async () => {
    const draft = bundleDraft
    if (!draft?.hasPreference) return
    try {
      await forgetUsualBundlePreference(draft.key)
      setBundleDraft(resetBundleDraft(draft))
      recordSmartHistory('правка обычного приёма сброшена', draft.name)
      showToast('правка обычного приёма сброшена')
      hapticImpact('light')
    } catch (e) {
      console.warn('[usual-bundle] preference reset failed', e)
      showToast('не удалось сбросить правку')
    }
  }, [bundleDraft, forgetUsualBundlePreference, recordSmartHistory, showToast])

  const parsedCcp = Number(kcalPer100.replace(',', '.'))
  const parsedWeight = Number(weight.replace(',', '.'))
  const parsedProteinPer100 = Number(proteinPer100.replace(',', '.'))
  const parsedFatPer100 = Number(fatPer100.replace(',', '.'))
  const parsedCarbsPer100 = Number(carbsPer100.replace(',', '.'))
  const hasCcp = Number.isFinite(parsedCcp) && parsedCcp > 0
  const hasWeight = Number.isFinite(parsedWeight) && parsedWeight > 0
  const showMacroFields = hasCcp && hasWeight
  const effectiveProtein = showMacroFields && Number.isFinite(parsedProteinPer100) && parsedProteinPer100 > 0
    ? round1((parsedProteinPer100 * parsedWeight) / 100)
    : undefined
  const effectiveFat = showMacroFields && Number.isFinite(parsedFatPer100) && parsedFatPer100 > 0
    ? round1((parsedFatPer100 * parsedWeight) / 100)
    : undefined
  const effectiveCarbs = showMacroFields && Number.isFinite(parsedCarbsPer100) && parsedCarbsPer100 > 0
    ? round1((parsedCarbsPer100 * parsedWeight) / 100)
    : undefined
  const hasManualMacros = effectiveProtein !== undefined || effectiveFat !== undefined || effectiveCarbs !== undefined
  const effectiveKcal = hasCcp
    ? hasWeight
      ? Math.round((parsedCcp * parsedWeight) / 100)
      : Math.round(parsedCcp)
    : 0
  const canQuickAdd = effectiveKcal > 0

  const handleQuickAdd = async () => {
    if (!canQuickAdd) return
    const trimmed = name.trim()
    const autoName = hasWeight ? `${parsedWeight} г` : 'быстрая запись'
    await addEntry(day, {
      kind: 'quick',
      data: {
        name: trimmed || autoName,
        kcal: effectiveKcal,
        ...(effectiveCarbs !== undefined ? { carbs: effectiveCarbs } : {}),
        ...(effectiveFat !== undefined ? { fat: effectiveFat } : {}),
        ...(effectiveProtein !== undefined ? { protein: effectiveProtein } : {}),
        estimate: {
          source: 'manual',
          portionBasis: hasWeight ? 'stated_weight' : 'unknown',
          basisLabel: hasManualMacros ? 'этикетка вручную' : hasWeight ? 'вес вручную' : 'ккал вручную',
          dataSource: 'ручной ввод',
        },
      },
    })
    hapticSuccess()
    onDone()
  }

  const pickFromGallery = async () => {
    if (aiBusy) return
    if (aiPhotos.length >= MAX_PHOTOS) {
      showToast(`максимум ${MAX_PHOTOS} фото`)
      return
    }
    try {
      const img = await captureImage({ fromCamera: false })
      if (!img) return
      setAiPhotos((prev) => [...prev, img])
      hapticImpact('light')
    } catch (e) {
      const msg =
        e instanceof Error && e.message === 'file-too-large'
          ? 'фото слишком большое'
          : 'не удалось загрузить фото'
      showToast(msg)
    }
  }
  const handleTakePhoto = () => {
    if (aiBusy) return
    if (aiPhotos.length >= MAX_PHOTOS) {
      showToast(`максимум ${MAX_PHOTOS} фото`)
      return
    }
    setCameraOpen(true)
  }
  const handlePickPhoto = () => void pickFromGallery()
  const handleCameraCaptured = (img: CapturedImage) => {
    setAiPhotos((prev) => [...prev, img])
    setCameraOpen(false)
    hapticImpact('light')
  }

  const handleRemovePhotoAt = (idx: number) => {
    setAiPhotos((prev) => {
      const p = prev[idx]
      if (p) releasePreview(p.previewUrl)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleScanExactProduct = useCallback(() => {
    closeAddSheet()
    openScanner('addEntry', day)
  }, [closeAddSheet, day, openScanner])

  const handleVoiceToggle = () => {
    if (aiBusy || voiceTranscribing) return
    if (voiceActive) {
      voiceRef.current?.stop()
      return
    }
    if (!voiceRef.current) voiceRef.current = new VoiceRecorder()
    void voiceRef.current.start({
      onStart: () => {
        setVoiceActive(true)
        hapticImpact('light')
      },
      onStop: () => {
        // Пишущий момент закончился — идёт транскрипция. Блокируем кнопку
        // на этот промежуток, чтобы юзер не стартанул новую запись поверх.
        setVoiceActive(false)
        setVoiceTranscribing(true)
      },
      onFinal: (t) => {
        setBundleDraft(null)
        // Дописываем к тому, что уже есть в поле (юзер мог набрать вручную
        // до нажатия микрофона, или сделать несколько попыток голоса подряд).
        setName((prev) => {
          const base = prev.trim()
          return base ? `${base} ${t}`.trim() : t
        })
        hapticImpact('light')
      },
      onError: (err) => {
        if (import.meta.env.DEV) console.warn('[voice] error:', err)
        if (err === 'insufficient-tokens') setExhaustedOpen(true)
        else if (err === 'not-allowed') showToast('микрофон не разрешён')
        else if (err === 'no-speech' || err === 'empty-transcription') showToast('не услышал')
        else if (err === 'too-large') showToast('слишком длинная запись')
        else if (err === 'unavailable' || err === 'mic-failed') showToast('голос недоступен')
        else if (import.meta.env.DEV) showToast(`voice: ${err.slice(0, 80)}`)
        else showToast('AI не распознал')
      },
      onEnd: () => {
        setVoiceActive(false)
        setVoiceTranscribing(false)
      },
    })
  }

  const handleAiParse = async () => {
    const desc = name.trim()
    if ((!desc && aiPhotos.length === 0) || aiBusy) return
    if (voiceActive) voiceRef.current?.stop()
    setBundleDraft(null)
    setAiBusy(true)
    setAiHits(null)
    setAiEdited(null)
    setAiAnalysisId(null)
    setAiDebugModel(null)
    try {
      const result = await parseFood({
        text: desc || undefined,
        images:
          aiPhotos.length > 0
            ? aiPhotos.map((p) => ({ data: p.data, mediaType: p.mediaType }))
            : null,
        billing: { mode: 'primary' },
      })
      applyBalance(result.balance, result.unlimited)
      setAiDebugModel(result.debugModel ?? null)
      if (isInsufficientTokens(result)) {
        setExhaustedOpen(true)
        return
      }
      if ('error' in result) {
        showToast('AI не понял описание')
        return
      }
      // Перекладываем фото из «к парсу» в «отправлены». Превью НЕ
      // освобождаем — нужны для refine. Освобождаются на confirm/dismiss.
      setAiOriginalImages(aiPhotos)
      setAiOriginalDesc(desc)
      setAiPhotos([])
      setAiHits(result.items)
      setAiEdited(result.items.map(cloneFoodItem))
      setAiAnalysisId(result.analysisId ?? null)
      hapticImpact('light')
    } catch (e) {
      const base = describeAiError(e)
      // Детали ошибки (status, message из AiError) утекать в prod-тост не должны —
      // пользователю они ничем не помогут, а могут содержать провайдерские подробности.
      // В dev оставляем — без них дебажить AI-фейлы невозможно.
      const devReveal = import.meta.env.DEV
      const detail =
        devReveal && e instanceof AiError
          ? ` · ${e.status ?? '??'}: ${e.message.slice(0, 160)}`
          : devReveal && e instanceof Error
            ? ` · ${e.message.slice(0, 160)}`
            : ''
      console.error('[ai-parse] fail', e)
      showToast(base + detail)
    } finally {
      setAiBusy(false)
    }
  }

  /**
   * Повторный AI-анализ с уточнением: исправляет систематическую ошибку
   * фотосканеров на скрытых ингредиентах (масло, соусы, заправки) — типичная
   * погрешность 100–300 ккал. Уточнения накапливаются: следующий refine
   * добавляется к уже уточнённому описанию, а не заменяет его.
   */
  const handleRefineAi = async (extra: string) => {
    const ext = extra.trim()
    if (!ext || aiRefineBusy) return
    if (aiOriginalImages.length === 0 && !aiOriginalDesc) return
    setAiRefineBusy(true)
    try {
      const text = aiOriginalDesc ? `${aiOriginalDesc} · ${ext}` : ext
      const result = await parseFood({
        text,
        images:
          aiOriginalImages.length > 0
            ? aiOriginalImages.map((p) => ({ data: p.data, mediaType: p.mediaType }))
            : null,
        billing: { mode: 'refine', parentAnalysisId: aiAnalysisId },
      })
      applyBalance(result.balance, result.unlimited)
      setAiDebugModel((prev) => result.debugModel ?? prev)
      if (isInsufficientTokens(result)) {
        setExhaustedOpen(true)
        return
      }
      if ('error' in result) {
        showToast('AI не понял уточнение')
        return
      }
      setAiHits(result.items)
      setAiEdited(result.items.map(cloneFoodItem))
      setAiAnalysisId(result.analysisId ?? aiAnalysisId)
      setAiOriginalDesc(text)
      hapticImpact('light')
    } catch (e) {
      console.error('[ai-refine] fail', e)
      showToast(describeAiError(e))
    } finally {
      setAiRefineBusy(false)
    }
  }

  const releaseAiOriginals = () => {
    for (const p of aiOriginalImages) releasePreview(p.previewUrl)
    setAiOriginalImages([])
    setAiOriginalDesc('')
    setAiAnalysisId(null)
    setAiDebugModel(null)
  }

  const handleConfirmAi = async () => {
    const edited = aiEdited
    if (!edited || edited.length === 0) return
    // AI-разбор не пополняет библиотеку продуктов: туда попадают только ручные
    // карточки и штрихкоды, где есть явный источник данных.
    // AI-результат пишем одним batch — иначе 10 последовательных setItem в
    // CloudStorage упираются в rate-limit Telegram и роняют «server returned...».
    const quickItems: QuickAddData[] = edited.map((item) => ({
      name: item.grams > 0 ? `${item.grams} г · ${item.name}` : item.name,
      kcal: Math.round(item.kcal),
      carbs: round1(item.carbs),
      fat: round1(item.fat),
      protein: round1(item.protein),
      ...(item.fiber !== undefined ? { fiber: round1(item.fiber) } : {}),
      estimate: estimateFromAiItem(item),
    }))
    hapticSuccess()
    releaseAiOriginals()
    onDone()
    try {
      await addQuickEntriesBulk(day, quickItems)
    } catch (e) {
      console.error('[ai-confirm] bulk persist failed', e)
      showToast('не записалось: ' + (e instanceof Error ? e.message.slice(0, 120) : 'unknown'))
    }
  }

  const handleDismissAi = () => {
    releaseAiOriginals()
    setAiHits(null)
    setAiEdited(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {goalKcal <= 0 && (
        <button
          type="button"
          onClick={() => {
            closeAddSheet()
            openGoalEditor()
          }}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '8px 12px',
            borderRadius: 10,
            border: `1px dashed ${accentAlpha(0.4)}`,
            background: accentAlpha(0.05),
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: ZH.accent,
              flex: 1,
            }}
          >
            цель по калориям не задана
          </span>
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              letterSpacing: '0.14em',
              color: ZH.accent,
              textTransform: 'uppercase',
            }}
          >
            настроить →
          </span>
        </button>
      )}
      {/* Поле «что ел» — единое для автокомплита, AI и ручного ввода */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <SysLabel color={ZH.textDim}>что ел</SysLabel>
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            aria-label={helpOpen ? 'скрыть подсказку' : 'как пользоваться'}
            aria-expanded={helpOpen}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 18,
              height: 18,
              borderRadius: 999,
              border: `1px solid ${helpOpen ? accentAlpha(0.5) : ZH.line}`,
              background: helpOpen ? accentAlpha(0.14) : 'transparent',
              color: helpOpen ? ZH.accent : ZH.textDim,
              fontFamily: ZH.mono,
              fontSize: 11,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ?
          </button>
        </div>
        {helpOpen && <FoodHelp />}
        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
          <textarea
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setBundleDraft(null)
            }}
            placeholder={foodPlaceholder || 'яблоко, курица, pasta carbonara…'}
            rows={2}
            style={{
              flex: 1,
              border: `1px solid ${ZH.line}`,
              borderRadius: 10,
              background: 'rgba(18,23,36,0.45)',
              padding: '10px 12px',
              fontSize: 14,
              color: ZH.text,
              fontFamily: 'inherit',
              outline: 'none',
              resize: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            {voiceAvailable && (
              <IconButton
                active={voiceActive}
                onClick={handleVoiceToggle}
                ariaLabel={
                  voiceActive
                    ? 'остановить запись'
                    : voiceTranscribing
                      ? 'распознаю'
                      : 'голос'
                }
                disabled={aiBusy || voiceTranscribing}
              >
                {voiceTranscribing ? <VoicePulse /> : <MicIcon />}
              </IconButton>
            )}
            <IconButton
              active={aiPhotos.length > 0}
              onClick={handleTakePhoto}
              ariaLabel="сфотографировать"
              disabled={aiBusy || aiPhotos.length >= MAX_PHOTOS}
            >
              <CameraIcon />
            </IconButton>
            <IconButton
              onClick={handlePickPhoto}
              ariaLabel="выбрать фото из галереи"
              disabled={aiBusy || aiPhotos.length >= MAX_PHOTOS}
            >
              <GalleryIcon />
            </IconButton>
          </div>
        </div>
        {aiPhotos.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {aiPhotos.map((p, i) => (
              <div
                key={i}
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
                  src={p.previewUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <button
                  type="button"
                  onClick={() => handleRemovePhotoAt(i)}
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
        )}
        {/* Автокомплит по своим продуктам и блюдам — только когда есть запрос и совпадения. */}
        {showMatches && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SysLabel color={ZH.textFaint}>свои</SysLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {matches.map((m) => (
                <MatchRowWrapper
                  key={m.kind === 'food' ? `f_${m.food.id}` : `m_${m.meal.id}`}
                  item={m}
                  onPickFood={handlePickFood}
                  onPickMeal={handlePickMeal}
                />
              ))}
            </div>
          </div>
        )}
        {!aiHits && !showMatches && (
          <div
            style={{
              fontSize: 11,
              color: ZH.textFaint,
              lineHeight: 1.4,
              letterSpacing: '0.02em',
            }}
          >
            Обычную еду можно писать, говорить или фоткать: AI оценит. Точный продукт лучше
            сканировать по штрих-коду или вводить цифры с этикетки.
          </div>
        )}
      </div>

      {/* Быстрые совпадения из недавних — тоже только по набранному тексту. */}
      {shortcuts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            type="button"
            aria-expanded={quickOpen}
            aria-controls="food-quick-shortcuts"
            aria-label={quickOpen ? 'свернуть быстро' : 'показать быстро'}
            onClick={() => setQuickOpen((open) => !open)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              minHeight: 40,
              borderRadius: 10,
              border: `1px solid ${ZH.line}`,
              background: 'rgba(18,23,36,0.35)',
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              alignItems: 'center',
              gap: 8,
              padding: '0 12px',
            }}
          >
            <SysLabel color={ZH.textFaint}>быстро</SysLabel>
            <span
              style={{
                fontFamily: ZH.mono,
                fontSize: 10,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: ZH.textFaint,
              }}
            >
              {shortcuts.length}
            </span>
            <span
              aria-hidden
              style={{
                fontFamily: ZH.mono,
                fontSize: 11,
                color: ZH.textDim,
              }}
            >
              {quickOpen ? '−' : '+'}
            </span>
          </button>
          {quickOpen && (
            <div
              id="food-quick-shortcuts"
              style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
            >
              {shortcuts.map((item) => (
                <ShortcutRowWrapper
                  key={item.key}
                  item={item}
                  onPick={handlePickShortcut}
                  onRemoveRecent={handleRemoveShortcutRecent}
                  onRestorePortion={handleRestoreShortcutPortion}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {quickOpen && smartHistory.length > 0 && (
        <SmartHistoryLog actions={smartHistory} />
      )}

      {bundleDraft && (
        <BundleDraftCard
          draft={bundleDraft}
          onFactorChange={handleBundleFactorChange}
          onRemoveItem={handleBundleItemRemove}
          onReset={bundleDraft.hasPreference ? () => void handleBundleReset() : undefined}
          onCancel={() => setBundleDraft(null)}
          onConfirm={() => void handleBundleConfirm()}
        />
      )}

      {/* AI-результат: одна карточка при одном блюде, список при нескольких. */}
      {import.meta.env.DEV && aiDebugModel && aiHits && (
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
            {formatAiDebugModel(aiDebugModel)}
          </span>
        </div>
      )}
      {aiHits && aiEdited && aiHits.length === 1 && (
        <AiResultCard
          original={aiHits[0]}
          edited={aiEdited[0]}
          onChange={(next) => setAiEdited([next])}
          title="ai разобрал"
          enableRefine
          refineBusy={aiRefineBusy}
          onRefine={(t) => void handleRefineAi(t)}
          onConfirm={() => void handleConfirmAi()}
          onDismiss={handleDismissAi}
        />
      )}
      {aiHits && aiEdited && aiHits.length > 1 && (
        <AiResultList
          originals={aiHits}
          editedList={aiEdited}
          onChangeAt={(idx, next) => {
            setAiEdited((prev) => {
              if (!prev) return prev
              const arr = prev.slice()
              arr[idx] = next
              return arr
            })
          }}
          refineBusy={aiRefineBusy}
          onRefine={(t) => void handleRefineAi(t)}
          onConfirm={() => void handleConfirmAi()}
          onDismiss={handleDismissAi}
          onRemove={(idx) => {
            if (!aiHits || !aiEdited) return
            const nextHits = aiHits.filter((_, i) => i !== idx)
            const nextEdited = aiEdited.filter((_, i) => i !== idx)
            if (nextHits.length === 0) {
              handleDismissAi()
              return
            }
            setAiHits(nextHits)
            setAiEdited(nextEdited)
          }}
        />
      )}

      {/* Абстрактную еду разбирает AI. Точные продукты идут через штрих-код, этикетку или ручной ввод. */}
      {!aiHits && (trimmedName.length >= 3 || aiPhotos.length > 0) && matches.length === 0 && (
        <button
          type="button"
          onClick={() => void handleAiParse()}
          disabled={aiBusy}
          style={{
            all: 'unset',
            cursor: aiBusy ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 12px',
            borderRadius: 10,
            border: `1px dashed ${accentAlpha(0.45)}`,
            background: accentAlpha(0.05),
          }}
        >
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: ZH.accent,
            }}
          >
            {aiBusy
              ? 'AI определяет…'
              : trimmedName
                ? `разобрать через AI «${trimmedName}»`
                : 'разобрать фото через AI'}
          </span>
        </button>
      )}

      {/* Ручной ввод КБЖУ — для случаев когда юзер знает цифры с упаковки */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SysLabel color={ZH.textDim}>новая запись</SysLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          <QuickField label="ккал/100г" value={kcalPer100} onChange={setKcalPer100} placeholder="0" />
          <QuickField label="вес, г" value={weight} onChange={setWeight} placeholder="0" />
        </div>
        {showMacroFields && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <QuickField label="бел/100г" value={proteinPer100} onChange={setProteinPer100} placeholder="0" />
            <QuickField label="жир/100г" value={fatPer100} onChange={setFatPer100} placeholder="0" />
            <QuickField label="угл/100г" value={carbsPer100} onChange={setCarbsPer100} placeholder="0" />
          </div>
        )}
        <button
          type="button"
          onClick={() => void handleQuickAdd()}
          disabled={!canQuickAdd}
          style={{
            all: 'unset',
            cursor: canQuickAdd ? 'pointer' : 'not-allowed',
            padding: '12px 14px',
            borderRadius: 10,
            textAlign: 'center',
            border: `1px solid ${canQuickAdd ? mixAlpha(FOOD_HUE, 45) : ZH.line}`,
            background: canQuickAdd
              ? `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 55)}, ${mixAlpha(FOOD_HUE, 25)})`
              : 'rgba(148,178,224,0.04)',
            boxShadow: canQuickAdd ? `0 0 14px ${mixAlpha(FOOD_HUE, 25)}` : 'none',
            fontFamily: ZH.mono,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: canQuickAdd ? '#06131F' : ZH.textFaint,
            opacity: canQuickAdd ? 1 : 0.5,
          }}
        >
          {effectiveKcal > 0 ? `+ ${effectiveKcal} ккал` : 'записать'}
        </button>
      </div>

      <BarcodeScanButton onClick={handleScanExactProduct} />

      {cameraOpen && (
        <PhotoCapture
          onCaptured={handleCameraCaptured}
          onClose={() => setCameraOpen(false)}
        />
      )}

      <BalanceSheet
        open={exhaustedOpen}
        onClose={() => setExhaustedOpen(false)}
        exhausted
      />
    </div>
  )
}

function NoteHelp() {
  return (
    <div
      className="animate-fade-in"
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${accentAlpha(0.25)}`,
        background: accentAlpha(0.05),
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <HelpRow label="Что это">
        Заметка — короткая строчка про день: событие, мысль, факт. Без оценки и без целей.
      </HelpRow>
      <HelpRow label="Когда">
        Записывай тогда, когда хочется зафиксировать момент. Не обязательно каждый день.
      </HelpRow>
      <HelpRow label="Где видно">
        Полный список — в окне дня. Верхние три попадают в клетку календаря в режиме «заметки».
      </HelpRow>
      <HelpRow label="Порядок">
        В окне дня у каждой заметки есть стрелки ▲▼ — подвинь нужную вверх, чтобы она
        появилась в календаре.
      </HelpRow>
      <HelpRow label="Правка">
        Тап по тексту — редактировать. Пустая заметка удаляется сама.
      </HelpRow>
    </div>
  )
}

function FoodHelp() {
  return (
    <div
      className="animate-fade-in"
      style={{
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${accentAlpha(0.25)}`,
        background: accentAlpha(0.05),
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <HelpRow label="Точный">
        Упаковка, батончик, готовый продукт: сканируй штрих-код или перепиши цифры с этикетки.
      </HelpRow>
      <HelpRow label="Обычный">
        Киви, гречка, котлета, суп: фото, голос или текст. AI оценит порцию и КБЖУ.
      </HelpRow>
      <HelpRow label="Бренд">
        Название бренда помогает распознать продукт, но без штрих-кода или этикетки это оценка.
      </HelpRow>
      <HelpRow label="Вручную">
        Поля «ккал/100г» и «вес» нужны, если цифры уже есть перед глазами.
      </HelpRow>
      <div
        style={{
          marginTop: 2,
          fontSize: 10,
          color: ZH.textFaint,
          lineHeight: 1.45,
          fontFamily: ZH.mono,
          letterSpacing: '0.02em',
        }}
      >
        способы можно комбинировать: фото + текст, голос + уточнение руками.
      </div>
    </div>
  )
}

function HelpRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
      <span
        style={{
          flexShrink: 0,
          width: 68,
          fontFamily: ZH.mono,
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ZH.accent,
        }}
      >
        {label}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: 12,
          color: ZH.textDim,
          lineHeight: 1.45,
          letterSpacing: '0.01em',
        }}
      >
        {children}
      </span>
    </div>
  )
}

function BarcodeScanButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        padding: '12px 14px',
        borderRadius: 10,
        border: `1px solid ${mixAlpha(FOOD_HUE, 45)}`,
        background: `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 18)}, ${mixAlpha(FOOD_HUE, 8)})`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        boxShadow: `0 0 16px ${mixAlpha(FOOD_HUE, 15)}`,
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 5v14 M8 5v14 M12 5v14 M16 5v14 M20 5v14"
          stroke={FOOD_HUE}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.18em',
          color: FOOD_HUE,
          textTransform: 'uppercase',
        }}
      >
        сканировать штрих-код
      </span>
    </button>
  )
}

function buildFoodShortcuts(
  recent: RecentItem[],
  bundlePrefs: UsualBundlePreference[],
  foods: Record<string, Food>,
  meals: Record<string, Meal>,
  currentMeal: MealType,
  entriesByDay: Record<DayKey, FoodEntry[]>,
  usualDays: DayKey[],
): FoodShortcut[] {
  const list: FoodShortcut[] = []
  const seen = new Set<string>()

  const push = (item: FoodShortcut) => {
    if (seen.has(item.key)) return
    seen.add(item.key)
    list.push(item)
  }

  const usual = buildUsualBundleShortcut(entriesByDay, usualDays, foods, currentMeal, bundlePrefs) ??
    buildUsualSingleShortcut(entriesByDay, usualDays, foods, currentMeal)
  if (usual) push(usual)

  for (const item of sortRecentForMeal(recent, currentMeal)) {
    if (item.foodId) {
      const food = foods[item.foodId]
      if (food && !food.archived) {
        push({
          kind: 'food',
          food,
          meta: recentMeta(item, currentMeal),
          key: `f:${food.id}`,
          recentItem: item,
        })
        continue
      }
    }
    if (item.quickAdd) {
      push({
        kind: 'quick',
        quickAdd: item.quickAdd,
        meta: recentMeta(item, currentMeal),
        key: quickShortcutKey(item.quickAdd),
        recentItem: item,
      })
    }
  }

  for (const food of Object.values(foods)) {
    if (!food.favourite || food.archived) continue
    push({ kind: 'food', food, meta: 'избранное', key: `f:${food.id}` })
    if (list.length >= 8) break
  }

  for (const meal of Object.values(meals)) {
    if (!meal.favourite) continue
    push({ kind: 'meal', meal, meta: 'избранное блюдо', key: `m:${meal.id}` })
    if (list.length >= 8) break
  }

  return list.slice(0, 8)
}

function buildUsualBundleShortcut(
  entriesByDay: Record<DayKey, FoodEntry[]>,
  days: DayKey[],
  foods: Record<string, Food>,
  currentMeal: MealType,
  bundlePrefs: UsualBundlePreference[],
): FoodShortcut | null {
  const byDay = days.map((day) => ({
    day,
    items: (entriesByDay[day] ?? [])
      .filter((entry) => entryMeal(entry) === currentMeal)
      .map((entry) => ({ entry, shortcut: shortcutFromEntry(entry, foods) }))
      .filter((item): item is {
        entry: FoodEntry
        shortcut: Extract<FoodShortcut, { kind: 'quick' }>
      } => item.shortcut?.kind === 'quick'),
  }))
  const candidates = new Map<string, {
    count: number
    lastUsedAt: number
    quickAdd: QuickAddData
    days: Set<DayKey>
  }>()

  for (const { day, items } of byDay) {
    const seenToday = new Set<string>()
    for (const item of items) {
      const key = quickShortcutKey(item.shortcut.quickAdd)
      if (seenToday.has(key)) continue
      seenToday.add(key)
      const existing = candidates.get(key)
      if (existing) {
        existing.count += 1
        existing.lastUsedAt = Math.max(existing.lastUsedAt, item.entry.createdAt)
        existing.days.add(day)
      } else {
        candidates.set(key, {
          count: 1,
          lastUsedAt: item.entry.createdAt,
          quickAdd: item.shortcut.quickAdd,
          days: new Set([day]),
        })
      }
    }
  }

  const [anchor] = Array.from(candidates.values()).sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count
    return b.lastUsedAt - a.lastUsedAt
  })
  if (!anchor || anchor.count < USUAL_MIN_DAYS) return null
  const anchorDays = anchor.days
  const rawBundleItems = Array.from(candidates.values())
    .map((candidate) => ({
      candidate,
      coDays: countIntersection(anchorDays, candidate.days),
    }))
    .filter(({ candidate, coDays }) => {
      if (candidate === anchor) return true
      return coDays >= USUAL_MIN_DAYS && coDays / anchor.count >= USUAL_BUNDLE_OPTIONAL_RATIO
    })
    .sort((a, b) => {
      if (a.candidate === anchor) return -1
      if (b.candidate === anchor) return 1
      if (a.coDays !== b.coDays) return b.coDays - a.coDays
      return b.candidate.lastUsedAt - a.candidate.lastUsedAt
    })
    .map(({ candidate }) => candidate.quickAdd)
  if (rawBundleItems.length < 2) return null
  const rawKey = `bundle:${rawBundleItems.map(quickShortcutKey).join('|')}`
  const preference = bundlePrefs.find((item) => item.key === rawKey)
  const bundleItems = applyUsualBundlePreference(rawBundleItems, preference)
  if (bundleItems.length === 0) return null
  const baseMeta = `обычный приём · ${formatDaysCount(anchor.count)}`
  return {
    kind: 'bundle',
    name: bundleName(bundleItems),
    items: bundleItems,
    rawItems: rawBundleItems,
    meta: preference ? `${baseMeta} · правка ${formatShortDate(preference.updatedAt)}` : baseMeta,
    key: rawKey,
    ...(preference ? { preference } : {}),
  }
}

function applyUsualBundlePreference(
  items: QuickAddData[],
  preference?: UsualBundlePreference,
): QuickAddData[] {
  if (!preference) return items
  const prefByKey = new Map(preference.items.map((item) => [item.key, item]))
  return items.flatMap((item) => {
    const pref = prefByKey.get(quickShortcutKey(item))
    if (!pref) return [item]
    if (!pref.included) return []
    return [scaleQuickAdd(item, pref.factor)]
  })
}

function countIntersection<T>(left: Set<T>, right: Set<T>): number {
  let count = 0
  for (const item of left) {
    if (right.has(item)) count += 1
  }
  return count
}

function buildUsualSingleShortcut(
  entriesByDay: Record<DayKey, FoodEntry[]>,
  days: DayKey[],
  foods: Record<string, Food>,
  currentMeal: MealType,
): FoodShortcut | null {
  const candidates = new Map<string, {
    count: number
    lastUsedAt: number
    shortcut: FoodShortcut
  }>()

  for (const day of days) {
    const seenToday = new Set<string>()
    for (const entry of entriesByDay[day] ?? []) {
      if (entryMeal(entry) !== currentMeal) continue
      const shortcut = shortcutFromEntry(entry, foods)
      if (!shortcut || seenToday.has(shortcut.key)) continue
      seenToday.add(shortcut.key)
      const existing = candidates.get(shortcut.key)
      if (existing) {
        existing.count += 1
        existing.lastUsedAt = Math.max(existing.lastUsedAt, entry.createdAt)
      } else {
        candidates.set(shortcut.key, { count: 1, lastUsedAt: entry.createdAt, shortcut })
      }
    }
  }

  const [top, second] = Array.from(candidates.values()).sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count
    return b.lastUsedAt - a.lastUsedAt
  })
  if (!top || top.count < USUAL_MIN_DAYS) return null
  if (second && top.count < second.count + USUAL_MIN_LEAD_DAYS) return null
  return {
    ...top.shortcut,
    meta: `обычно в это время · ${formatDaysCount(top.count)}`,
  }
}

function shortcutFromEntry(
  entry: FoodEntry,
  foods: Record<string, Food>,
): FoodShortcut | null {
  const resolved = resolveEntry(entry, foods)
  if (resolved.missing || resolved.kcal <= 0) return null
  const quickAdd: QuickAddData = {
    name: shortcutNameFromEntry(resolved),
    kcal: Math.round(resolved.kcal),
    carbs: round1(resolved.carbs),
    fat: round1(resolved.fat),
    protein: round1(resolved.protein),
    ...(resolved.fiber > 0 ? { fiber: round1(resolved.fiber) } : {}),
    ...(resolved.alcohol > 0 ? { alcohol: round1(resolved.alcohol) } : {}),
    ...(resolved.estimate ? { estimate: resolved.estimate } : {}),
  }
  return {
    kind: 'quick',
    quickAdd,
    meta: '',
    key: quickShortcutKey(quickAdd),
  }
}

function shortcutNameFromEntry(resolved: ReturnType<typeof resolveEntry>): string {
  if (resolved.isQuick) return formatQuantityName(resolved.name, resolved.entry.quantity)
  const serving = resolved.servingLabel.trim()
  const base = serving ? `${resolved.name} · ${serving}` : resolved.name
  return formatQuantityName(base, resolved.entry.quantity)
}

function formatQuantityName(name: string, quantity: number): string {
  if (quantity === 1) return name
  const rounded = Math.round(quantity * 100) / 100
  const formatted = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
  return `${name} · ${formatted}×`
}

function entryMeal(entry: FoodEntry): MealType {
  return entry.meal ?? mealByTime(new Date(entry.createdAt))
}

function sortRecentForMeal(recent: RecentItem[], currentMeal: MealType): RecentItem[] {
  return recent.slice().sort((a, b) => {
    const aSameMeal = recentMeal(a) === currentMeal
    const bSameMeal = recentMeal(b) === currentMeal
    if (aSameMeal !== bSameMeal) return aSameMeal ? -1 : 1
    if (a.usageCount !== b.usageCount) return b.usageCount - a.usageCount
    return recentTs(b) - recentTs(a)
  })
}

function recentMeal(item: RecentItem): MealType {
  return mealByTime(new Date(recentTs(item)))
}

function recentTs(item: RecentItem): number {
  return Number.isFinite(item.lastUsedAt) ? item.lastUsedAt : 0
}

function recentMeta(item: RecentItem, currentMeal: MealType): string {
  const base = recentMeal(item) === currentMeal
    ? 'в это время'
    : `недавнее · ${RECENT_MEAL_META[recentMeal(item)]}`
  return item.usageCount > 1 ? `${base} · ${item.usageCount}×` : base
}

function quickShortcutKey(quickAdd: QuickAddData): string {
  return `q:${quickAdd.name.toLowerCase()}:${quickAdd.kcal}`
}

function formatDaysCount(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} день`
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} дня`
  }
  return `${count} дней`
}

function formatShortDate(ts: number): string {
  const date = new Date(ts)
  if (!Number.isFinite(ts) || Number.isNaN(date.getTime())) return 'дата?'
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = String(date.getFullYear()).slice(-2)
  return `${day}.${month}.${year}`
}

function withoutBundlePreferenceMeta(meta: string): string {
  return meta.replace(/ · (твоя правка|правка \d{2}\.\d{2}\.\d{2}|правка дата\?)$/, '')
}

function previousDayKeys(anchor: DayKey, count: number): DayKey[] {
  const [year, month, dayOfMonth] = anchor.split('-').map(Number)
  const base = new Date(year, month - 1, dayOfMonth)
  const out: DayKey[] = []
  for (let i = count; i >= 1; i--) {
    const d = new Date(base)
    d.setDate(d.getDate() - i)
    out.push(dayKey(d))
  }
  return out
}

function QuickField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div
      style={{
        minWidth: 0,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '8px 10px',
        border: `1px solid ${ZH.line}`,
        borderRadius: 10,
        background: 'rgba(18,23,36,0.45)',
      }}
    >
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 9,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: ZH.textFaint,
        }}
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 0,
          color: ZH.text,
          fontSize: 14,
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function SmartHistoryLog({ actions }: { actions: SmartHistoryAction[] }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px 10px',
        borderRadius: 10,
        border: `1px solid ${ZH.line}`,
        background: mixAlpha(ZH.panel, 55),
      }}
    >
      <SysLabel color={ZH.textFaint}>журнал быстро</SysLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {actions.map((action) => (
          <div
            key={action.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto',
              gap: 8,
              alignItems: 'center',
              minHeight: 18,
            }}
          >
            <span
              style={{
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 11,
                color: ZH.textDim,
              }}
            >
              <span style={{ color: ZH.text }}>{action.label}</span>
              {action.detail ? ` · ${action.detail}` : ''}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontFamily: ZH.mono,
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: ZH.textFaint,
              }}
            >
              {smartHistoryTime(action.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ShortcutRowWrapper({
  item,
  onPick,
  onRemoveRecent,
  onRestorePortion,
}: {
  item: FoodShortcut
  onPick: (item: FoodShortcut) => void
  onRemoveRecent?: (item: FoodShortcut) => void
  onRestorePortion?: (item: FoodShortcut) => void
}) {
  const handlePick = useCallback(() => {
    void onPick(item)
  }, [item, onPick])
  const handleRemoveRecent = useCallback(() => {
    void onRemoveRecent?.(item)
  }, [item, onRemoveRecent])
  const handleRestorePortion = useCallback(() => {
    void onRestorePortion?.(item)
  }, [item, onRestorePortion])
  return (
    <ShortcutRow
      item={item}
      onPick={handlePick}
      onRemoveRecent={shortcutRecentItem(item) ? handleRemoveRecent : undefined}
      onRestorePortion={canRestoreShortcutPortion(item) ? handleRestorePortion : undefined}
    />
  )
}

const ShortcutRow = memo(function ShortcutRow({
  item,
  onPick,
  onRemoveRecent,
  onRestorePortion,
}: {
  item: FoodShortcut
  onPick: () => void
  onRemoveRecent?: () => void
  onRestorePortion?: () => void
}) {
  const isFood = item.kind === 'food'
  const isMeal = item.kind === 'meal'
  const isBundle = item.kind === 'bundle'
  const name = shortcutTitle(item)
  const summary = isFood
    ? foodShortcutSummary(item.food)
    : isMeal
      ? `${item.meal.items.length} поз.`
      : isBundle
        ? bundleSummary(item.items)
        : `${roundKcal(item.quickAdd.kcal)} ккал`
  const source = isFood
    ? foodSourceLine(item.food)
    : isMeal
      ? ''
      : isBundle
        ? ''
        : quickAddSourceLine(item.quickAdd)

  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 4 }}>
      <button
        type="button"
        onClick={onPick}
        style={{
          all: 'unset',
          cursor: 'pointer',
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '9px 12px',
          borderRadius: 10,
          border: `1px solid ${ZH.line}`,
          background: 'rgba(18,23,36,0.35)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              color: ZH.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
          <div
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              color: ZH.textFaint,
              letterSpacing: '0.04em',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.meta}
            {source ? ` · ${source}` : ''}
            {summary ? ` · ${summary}` : ''}
          </div>
        </div>
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 11,
            fontWeight: 600,
            color: FOOD_HUE,
          }}
        >
          +
        </span>
      </button>
      {onRestorePortion ? (
        <button
          type="button"
          onClick={onRestorePortion}
          aria-label={`вернуть базовую порцию ${name}`}
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 58,
            flexShrink: 0,
            borderRadius: 10,
            border: `1px solid ${mixAlpha(FOOD_HUE, 35)}`,
            background: 'rgba(18,23,36,0.35)',
            color: FOOD_HUE,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: ZH.mono,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          вернуть
        </button>
      ) : null}
      {onRemoveRecent ? (
        <button
          type="button"
          onClick={onRemoveRecent}
          aria-label={`убрать ${name} из быстро`}
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 36,
            flexShrink: 0,
            borderRadius: 10,
            border: `1px solid ${ZH.line}`,
            background: 'rgba(18,23,36,0.35)',
            color: ZH.textDim,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 15,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  )
})

function shortcutTitle(item: FoodShortcut): string {
  if (item.kind === 'food') return item.food.name
  if (item.kind === 'meal') return item.meal.name
  if (item.kind === 'bundle') return item.name
  return item.quickAdd.name
}

function shortcutMatchesQuery(item: FoodShortcut, query: string): boolean {
  return shortcutTitle(item).toLowerCase().includes(query)
}

function smartHistoryTime(createdAt: number): string {
  const ageSec = Math.max(0, Math.floor((Date.now() - createdAt) / 1000))
  if (ageSec < 60) return 'сейчас'
  const ageMin = Math.min(99, Math.floor(ageSec / 60))
  return `${ageMin}м`
}

function shortcutRecentItem(item: FoodShortcut): RecentItem | undefined {
  return item.kind === 'food' || item.kind === 'quick' ? item.recentItem : undefined
}

function canRestoreShortcutPortion(item: FoodShortcut): boolean {
  const quickAdd = item.kind === 'quick' ? item.recentItem?.quickAdd : undefined
  return quickAdd ? restoreQuickAddPortion(quickAdd) !== null : false
}

function foodShortcutSummary(food: Food): string {
  const serving = food.servings[0]
  if (!serving) return 'продукт'
  const kcal = roundKcal(serving.kcal)
  return serving.grams ? `${kcal} ккал / ${serving.grams} г` : `${kcal} ккал`
}

function bundleName(items: QuickAddData[]): string {
  const names = items.map((item) => item.name)
  if (names.length <= 2) return names.join(' + ')
  return `${names.slice(0, 2).join(' + ')} + ещё ${names.length - 2}`
}

function bundleSummary(items: QuickAddData[]): string {
  const total = items.reduce((sum, item) => sum + item.kcal, 0)
  return `${items.length} поз. · ∑ ${roundKcal(total)} ккал`
}

function createBundleDraft(item: Extract<FoodShortcut, { kind: 'bundle' }>): BundleDraft {
  const prefByKey = new Map((item.preference?.items ?? []).map((pref) => [pref.key, pref]))
  return {
    key: item.key,
    name: item.name,
    meta: item.meta,
    hasPreference: item.preference !== undefined,
    items: item.rawItems.map((quickAdd, index) => {
      const key = quickShortcutKey(quickAdd)
      const pref = prefByKey.get(key)
      return {
        id: `${key}:${index}`,
        key,
        quickAdd,
        factor: pref?.factor ?? 1,
        included: pref?.included ?? true,
      }
    }),
  }
}

function resetBundleDraft(draft: BundleDraft): BundleDraft {
  const items = draft.items.map((item) => ({
    ...item,
    factor: 1,
    included: true,
  }))
  return {
    ...draft,
    name: bundleName(items.map((item) => item.quickAdd)),
    meta: withoutBundlePreferenceMeta(draft.meta),
    hasPreference: false,
    items,
  }
}

function bundlePreferenceFromDraft(draft: BundleDraft): UsualBundlePreference {
  return {
    key: draft.key,
    updatedAt: Date.now(),
    items: draft.items.map((item) => ({
      key: item.key,
      factor: item.factor,
      included: item.included,
    })),
  }
}

function isBundleDraftEdited(draft: BundleDraft): boolean {
  return draft.items.some((item) => !item.included || Math.abs(item.factor - 1) >= 0.01)
}

function visibleBundleDraftItems(draft: BundleDraft): BundleDraftItem[] {
  return draft.items.filter((item) => item.included)
}

function BundleDraftCard({
  draft,
  onFactorChange,
  onRemoveItem,
  onReset,
  onCancel,
  onConfirm,
}: {
  draft: BundleDraft
  onFactorChange: (id: string, factor: number) => void
  onRemoveItem: (id: string) => void
  onReset?: () => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const visibleItems = visibleBundleDraftItems(draft)
  const scaledItems = visibleItems.map((item) => scaleQuickAdd(item.quickAdd, item.factor))
  const totalKcal = scaledItems.reduce((sum, item) => sum + item.kcal, 0)
  const canSave = scaledItems.length > 0 && totalKcal > 0

  return (
    <div
      className="animate-fade-in"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '12px 12px 10px',
        borderRadius: 12,
        border: `1px solid ${mixAlpha(FOOD_HUE, 45)}`,
        background: `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 10)}, ${mixAlpha(FOOD_HUE, 4)})`,
        boxShadow: `0 0 14px ${mixAlpha(FOOD_HUE, 10)}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <SysLabel color={FOOD_HUE}>обычный приём перед записью</SysLabel>
          <div
            style={{
              marginTop: 4,
              fontSize: 13,
              color: ZH.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {draft.name}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 5,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              color: ZH.textFaint,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            {draft.meta}
          </span>
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              aria-label="сбросить сохранённую правку обычного приёма"
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '4px 7px',
                borderRadius: 999,
                border: `1px solid ${ZH.line}`,
                fontFamily: ZH.mono,
                fontSize: 9,
                fontWeight: 600,
                color: ZH.textDim,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              сбросить правку
            </button>
          ) : null}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {visibleItems.length > 0 ? (
          visibleItems.map((item) => (
            <BundleDraftRow
              key={item.id}
              item={item}
              onFactorChange={(factor) => onFactorChange(item.id, factor)}
              onRemove={() => onRemoveItem(item.id)}
            />
          ))
        ) : (
          <div
            style={{
              padding: '10px 0',
              fontSize: 12,
              color: ZH.textFaint,
              textAlign: 'center',
            }}
          >
            состав пустой
          </div>
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          paddingTop: 2,
          fontFamily: ZH.mono,
          fontSize: 10,
          color: ZH.textFaint,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        <span>{scaledItems.length} поз.</span>
        <span>∑ {roundKcal(totalKcal)} ккал</span>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            all: 'unset',
            flex: 1,
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
          отмена
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canSave}
          aria-label="записать обычный приём"
          style={{
            all: 'unset',
            flex: 1,
            cursor: canSave ? 'pointer' : 'not-allowed',
            padding: '10px 0',
            textAlign: 'center',
            borderRadius: 10,
            border: `1px solid ${canSave ? mixAlpha(FOOD_HUE, 50) : ZH.line}`,
            background: canSave
              ? `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 55)}, ${mixAlpha(FOOD_HUE, 25)})`
              : 'rgba(148,178,224,0.04)',
            boxShadow: canSave ? `0 0 14px ${mixAlpha(FOOD_HUE, 25)}` : 'none',
            fontFamily: ZH.mono,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: canSave ? '#06131F' : ZH.textFaint,
            opacity: canSave ? 1 : 0.5,
          }}
        >
          записать
        </button>
      </div>
    </div>
  )
}

function BundleDraftRow({
  item,
  onFactorChange,
  onRemove,
}: {
  item: BundleDraftItem
  onFactorChange: (factor: number) => void
  onRemove: () => void
}) {
  const scaled = scaleQuickAdd(item.quickAdd, item.factor)
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: '8px 9px',
        borderRadius: 10,
        border: `1px solid ${ZH.line}`,
        background: 'rgba(18,23,36,0.36)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              color: ZH.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.quickAdd.name}
          </div>
          <div
            style={{
              marginTop: 2,
              fontFamily: ZH.mono,
              fontSize: 10,
              color: ZH.textFaint,
              letterSpacing: '0.04em',
            }}
          >
            {formatBundleFactor(item.factor)}× · {roundKcal(scaled.kcal)} ккал
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`убрать ${item.quickAdd.name}`}
          style={{
            all: 'unset',
            cursor: 'pointer',
            width: 24,
            height: 24,
            borderRadius: 999,
            border: `1px solid ${ZH.line}`,
            color: ZH.textDim,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {BUNDLE_FACTORS.map((factor) => {
          const active = Math.abs(item.factor - factor) < 0.01
          return (
            <button
              key={factor}
              type="button"
              onClick={() => onFactorChange(factor)}
              aria-label={`порция ${item.quickAdd.name} ${formatBundleFactor(factor)}×`}
              style={{
                all: 'unset',
                cursor: 'pointer',
                padding: '5px 10px',
                borderRadius: 999,
                border: `1px solid ${active ? mixAlpha(FOOD_HUE, 55) : ZH.line}`,
                background: active
                  ? `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 35)}, ${mixAlpha(FOOD_HUE, 14)})`
                  : 'rgba(148,178,224,0.04)',
                fontFamily: ZH.mono,
                fontSize: 11,
                fontWeight: 500,
                color: active ? '#06131F' : ZH.textDim,
                letterSpacing: '0.04em',
              }}
            >
              {formatBundleFactor(factor)}×
            </button>
          )
        })}
      </div>
    </div>
  )
}

const BUNDLE_FACTORS = [0.5, 1, 1.5, 2] as const

function scaleQuickAdd(quickAdd: QuickAddData, factor: number): QuickAddData {
  const roundedFactor = Math.max(0, factor)
  const suffix = roundedFactor === 1 ? '' : ` · ${formatBundleFactor(roundedFactor)}×`
  return {
    name: `${quickAdd.name}${suffix}`,
    kcal: Math.max(0, Math.round(quickAdd.kcal * roundedFactor)),
    ...(quickAdd.carbs !== undefined ? { carbs: round1(quickAdd.carbs * roundedFactor) } : {}),
    ...(quickAdd.fat !== undefined ? { fat: round1(quickAdd.fat * roundedFactor) } : {}),
    ...(quickAdd.protein !== undefined ? { protein: round1(quickAdd.protein * roundedFactor) } : {}),
    ...(quickAdd.fiber !== undefined ? { fiber: round1(quickAdd.fiber * roundedFactor) } : {}),
    ...(quickAdd.alcohol !== undefined ? { alcohol: round1(quickAdd.alcohol * roundedFactor) } : {}),
    ...(quickAdd.estimate
      ? {
        estimate: roundedFactor === 1
          ? quickAdd.estimate
          : {
            ...quickAdd.estimate,
            portionBasis: 'user_edit',
            basisLabel: 'ручная правка порции',
            ...originalPortionFields(quickAdd.estimate),
          },
      }
      : roundedFactor === 1
        ? {}
        : {
          estimate: {
            source: 'manual',
            portionBasis: 'user_edit',
            basisLabel: 'ручная правка порции',
            dataSource: 'ручной ввод',
          },
        }),
  }
}

function restoreQuickAddPortion(quickAdd: QuickAddData): QuickAddData | null {
  if (quickAdd.estimate?.basisLabel !== 'ручная правка порции') return null
  const parsed = parsePortionFactorSuffix(quickAdd.name)
  if (!parsed || parsed.factor <= 0 || Math.abs(parsed.factor - 1) < 0.01) return null
  const restoredEstimate = restoreOriginalPortionFields(quickAdd.estimate)
  return {
    ...quickAdd,
    name: parsed.name,
    kcal: Math.max(0, Math.round(quickAdd.kcal / parsed.factor)),
    ...(quickAdd.carbs !== undefined ? { carbs: round1(quickAdd.carbs / parsed.factor) } : {}),
    ...(quickAdd.fat !== undefined ? { fat: round1(quickAdd.fat / parsed.factor) } : {}),
    ...(quickAdd.protein !== undefined ? { protein: round1(quickAdd.protein / parsed.factor) } : {}),
    ...(quickAdd.fiber !== undefined ? { fiber: round1(quickAdd.fiber / parsed.factor) } : {}),
    ...(quickAdd.alcohol !== undefined ? { alcohol: round1(quickAdd.alcohol / parsed.factor) } : {}),
    estimate: restoredEstimate,
  }
}

function originalPortionFields(estimate: NutritionEstimate): {
  originalPortionBasis?: NutritionPortionBasis
  originalBasisLabel?: string
} {
  const originalPortionBasis = estimate.originalPortionBasis ??
    (estimate.portionBasis !== 'user_edit' ? estimate.portionBasis : undefined)
  const originalBasisLabel = estimate.originalBasisLabel ??
    (estimate.basisLabel !== 'ручная правка порции' ? estimate.basisLabel : undefined)
  return {
    ...(originalPortionBasis ? { originalPortionBasis } : {}),
    ...(originalBasisLabel ? { originalBasisLabel } : {}),
  }
}

function restoreOriginalPortionFields(estimate: NutritionEstimate): NutritionEstimate {
  const {
    originalPortionBasis,
    originalBasisLabel,
    ...rest
  } = estimate
  return {
    ...rest,
    portionBasis: originalPortionBasis ?? 'unknown',
    basisLabel: originalBasisLabel ?? 'базовая порция',
  }
}

function parsePortionFactorSuffix(name: string): { name: string; factor: number } | null {
  const match = name.match(/^(.*) · ([0-9]+(?:,[0-9]+)?)×$/)
  if (!match) return null
  const factor = Number(match[2].replace(',', '.'))
  if (!Number.isFinite(factor)) return null
  return { name: match[1], factor }
}

function formatBundleFactor(factor: number): string {
  const rounded = Math.round(factor * 10) / 10
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded).replace('.', ',')
}

/** Обёртка, чтобы стабилизировать onPick через ref на item+handlers. */
function MatchRowWrapper({
  item,
  onPickFood,
  onPickMeal,
}: {
  item: FoodMatch
  onPickFood: (f: Food) => void
  onPickMeal: (m: Meal) => void
}) {
  const onPick = useCallback(() => {
    if (item.kind === 'food') onPickFood(item.food)
    else onPickMeal(item.meal)
  }, [item, onPickFood, onPickMeal])
  return <MatchRow item={item} onPick={onPick} />
}

const MatchRow = memo(function MatchRow({
  item,
  onPick,
}: {
  item: FoodMatch
  onPick: () => void
}) {
  const isFood = item.kind === 'food'
  const name = isFood ? item.food.name : item.meal.name
  const kcal = isFood ? roundKcal(item.food.servings[0]?.kcal ?? 0) : null
  const grams = isFood ? (item.food.servings[0]?.grams ?? null) : null
  const kind = isFood ? 'продукт' : 'блюдо'
  const source = isFood ? foodSourceLine(item.food) : ''
  return (
    <button
      type="button"
      onClick={onPick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        borderRadius: 10,
        border: `1px solid ${ZH.line}`,
        background: 'rgba(18,23,36,0.45)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            color: ZH.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: ZH.mono,
            fontSize: 10,
            color: ZH.textFaint,
            letterSpacing: '0.04em',
            marginTop: 2,
          }}
        >
          {kind}
          {source ? ` · ${source}` : ''}
          {kcal != null && grams != null ? ` · ${kcal} ккал / ${grams} г` : ''}
          {kcal != null && grams == null ? ` · ${kcal} ккал` : ''}
        </div>
      </div>
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 11,
          fontWeight: 600,
          color: FOOD_HUE,
        }}
      >
        +
      </span>
    </button>
  )
})

/**
 * Карточка-результат AI-анализа одного блюда. Прозрачность + контроль:
 * показывает то, что AI определил (название, ккал, КБЖУ/100г, confidence),
 * и даёт юзеру управление — scale-чипы (½×, 2×) для быстрой коррекции
 * порции, ✎ для ручного ввода значений, refine-bar для повторного парса
 * с уточнением (фикс скрытых калорий: масло, соус, способ готовки).
 */
function AiResultCard({
  original,
  edited,
  onChange,
  title = 'ai разобрал',
  enableRefine = true,
  refineBusy,
  onRefine,
  onConfirm,
  onDismiss,
}: {
  original: FoodItem
  edited: FoodItem
  onChange: (next: FoodItem) => void
  title?: string
  enableRefine?: boolean
  refineBusy: boolean
  onRefine: (extra: string) => void
  onConfirm: () => void
  onDismiss: () => void
}) {
  const veryLow = edited.confidence < VERY_LOW_CONF
  return (
    <FoodDraftAiCard
      original={original}
      edited={edited}
      onChange={onChange}
      title={title}
      onNameChange={(name) => onChange({ ...edited, name })}
      scaleKcalOnGrams
      afterControls={enableRefine ? <RefineBar busy={refineBusy} onRefine={onRefine} /> : undefined}
      footer={
        <>
          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
            <button
              type="button"
              onClick={onDismiss}
              style={{
                all: 'unset',
                flex: 1,
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
              отмена
            </button>
            <button
              type="button"
              onClick={onConfirm}
              style={{
                all: 'unset',
                flex: 1,
                cursor: 'pointer',
                padding: '10px 0',
                textAlign: 'center',
                borderRadius: 10,
                border: `1px solid ${veryLow ? mixAlpha(ZH.warn, 45) : mixAlpha(FOOD_HUE, 50)}`,
                background: veryLow
                  ? `linear-gradient(180deg, ${mixAlpha(ZH.warn, 20)}, ${mixAlpha(ZH.warn, 8)})`
                  : `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 55)}, ${mixAlpha(FOOD_HUE, 25)})`,
                boxShadow: veryLow ? 'none' : `0 0 14px ${mixAlpha(FOOD_HUE, 25)}`,
                fontFamily: ZH.mono,
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: veryLow ? ZH.warn : '#06131F',
              }}
            >
              {veryLow ? 'записать как есть' : 'записать'}
            </button>
          </div>
        </>
      }
    />
  )
}

function round1(x: number): number {
  return Math.round(x * 10) / 10
}

// Ниже 80% показываем пользовательский фидбэк: что добавить, чтобы AI считал точнее.
const LOW_CONF = 0.8
// Ниже 0.5 — AI честно угадывает типовые значения без опоры на факт (нет бренда,
// нет веса, нет визуального якоря). Такие данные недостоверны — в запись их
// пускаем, но с явным предупреждением, чтобы пользователь не принял их за истину.
const VERY_LOW_CONF = 0.5

function cloneFoodItem(item: FoodItem): FoodItem {
  return { ...item }
}

function estimateFromAiItem(item: FoodItem): NutritionEstimate {
  return {
    source: item.estimateSource ?? 'ai',
    confidence: Math.max(0, Math.min(1, item.confidence)),
    ...(item.confidenceReason ? { confidenceReason: item.confidenceReason } : {}),
    portionBasis: item.portionBasis,
    ...(item.basisLabel ? { basisLabel: item.basisLabel } : {}),
    ...(item.brandDataStatus !== 'not_provided' ? { brandDataStatus: item.brandDataStatus } : {}),
    ...(item.brandDataLabel ? { brandDataLabel: item.brandDataLabel } : {}),
    dataSource: item.dataSource ?? 'AI',
  }
}

const REFINE_CHIPS: { label: string; payload: string }[] = [
  { label: '+ масло', payload: 'с добавлением масла при готовке' },
  { label: '+ соус', payload: 'с соусом / заправкой' },
  { label: '+ майонез', payload: 'с майонезом' },
  { label: '+ жарено', payload: 'обжарено в масле' },
  { label: '+ больше', payload: 'порция в 1.5 раза больше обычной' },
  { label: '+ меньше', payload: 'порция меньше обычной' },
]

/**
 * Повторный AI-парс для уточнений, которые реально влияют на точность:
 * скрытое масло, соус, способ готовки, размер порции или свой комментарий.
 */
function RefineBar({ busy, onRefine }: { busy: boolean; onRefine: (extra: string) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const expanded = open || busy
  const submitFree = () => {
    const t = text.trim()
    if (!t) return
    onRefine(t)
    setText('')
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 10,
        border: `1px dashed ${ZH.line}`,
        background: 'rgba(148,178,224,0.03)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={expanded ? 'свернуть уточнения' : 'добавить уточнение к еде'}
        aria-expanded={expanded}
        style={{
          all: 'unset',
          cursor: busy ? 'wait' : 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 9,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: busy ? ZH.accent : ZH.textFaint,
          }}
        >
          {busy ? 'AI пересчитывает…' : 'добавить уточнение'}
        </span>
        <span
          aria-hidden="true"
          style={{
            fontFamily: ZH.mono,
            fontSize: 10,
            color: ZH.textDim,
            letterSpacing: '0.06em',
          }}
        >
          {expanded ? '▴' : '▾'}
        </span>
      </button>
      {expanded && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {REFINE_CHIPS.map((c) => (
              <button
                key={c.label}
                type="button"
                disabled={busy}
                onClick={() => onRefine(c.payload)}
                style={{
                  all: 'unset',
                  cursor: busy ? 'wait' : 'pointer',
                  padding: '4px 9px',
                  borderRadius: 999,
                  border: `1px solid ${ZH.line}`,
                  background: 'rgba(8,9,15,0.45)',
                  fontFamily: ZH.mono,
                  fontSize: 10,
                  color: busy ? ZH.textFaint : ZH.textDim,
                  letterSpacing: '0.04em',
                  opacity: busy ? 0.5 : 1,
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="что уточнить: вес, соус, масло, способ готовки"
              disabled={busy}
              style={{
                flex: 1,
                background: 'rgba(8,9,15,0.45)',
                border: `1px solid ${ZH.line}`,
                borderRadius: 8,
                padding: '7px 10px',
                outline: 'none',
                color: ZH.text,
                fontSize: 12,
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={submitFree}
              disabled={busy || text.trim().length === 0}
              style={{
                all: 'unset',
                cursor: busy || text.trim().length === 0 ? 'not-allowed' : 'pointer',
                padding: '0 12px',
                borderRadius: 8,
                border: `1px solid ${mixAlpha(FOOD_HUE, 45)}`,
                background: `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 35)}, ${mixAlpha(FOOD_HUE, 14)})`,
                fontFamily: ZH.mono,
                fontSize: 10,
                fontWeight: 500,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: '#06131F',
                display: 'flex',
                alignItems: 'center',
                opacity: busy || text.trim().length === 0 ? 0.5 : 1,
              }}
            >
              пересчитать
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Список блюд из AI-анализа с суммой сверху, общим refine bar в подвале
 * и per-item редактированием через раскрытие строки.
 */
function AiResultList({
  originals,
  editedList,
  onChangeAt,
  refineBusy,
  onRefine,
  onConfirm,
  onDismiss,
  onRemove,
}: {
  originals: FoodItem[]
  editedList: FoodItem[]
  onChangeAt: (idx: number, next: FoodItem) => void
  refineBusy: boolean
  onRefine: (extra: string) => void
  onConfirm: () => void
  onDismiss: () => void
  onRemove: (idx: number) => void
}) {
  const totalKcal = editedList.reduce((s, h) => s + h.kcal, 0)
  const avgConf = editedList.reduce((s, h) => s + h.confidence, 0) / Math.max(1, editedList.length)
  const anyLow = editedList.some((h) => h.confidence < LOW_CONF)
  const anyVeryLow = editedList.some((h) => h.confidence < VERY_LOW_CONF)
  const [activeIndex, setActiveIndex] = useState<number | null>(() => {
    if (editedList.length === 1) return 0
    const firstLow = editedList.findIndex((h) => h.confidence < LOW_CONF)
    return firstLow >= 0 ? firstLow : null
  })
  const selectedIndex = activeIndex !== null && activeIndex < editedList.length ? activeIndex : null
  const activeEdited = selectedIndex !== null ? editedList[selectedIndex] : undefined
  const activeOriginal = selectedIndex !== null ? (originals[selectedIndex] ?? activeEdited) : undefined
  const activeTitle =
    selectedIndex !== null && editedList.length > 1
      ? `ai разобрал · ${selectedIndex + 1}/${editedList.length}`
      : 'ai разобрал'
  const changeActive = (next: FoodItem) => {
    if (selectedIndex !== null) onChangeAt(selectedIndex, next)
  }
  const changeActiveName = (name: string) => {
    if (selectedIndex !== null && activeEdited) onChangeAt(selectedIndex, { ...activeEdited, name })
  }
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '14px 14px 12px',
        borderRadius: 12,
        border: `1px solid ${mixAlpha(FOOD_HUE, 55)}`,
        background: `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 10)}, ${mixAlpha(FOOD_HUE, 4)})`,
        boxShadow: `0 0 16px ${mixAlpha(FOOD_HUE, 12)}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <SysLabel color={FOOD_HUE}>ai разобрал · {editedList.length}</SysLabel>
        <span
          style={{
            fontFamily: ZH.mono,
            fontSize: 10,
            letterSpacing: '0.12em',
            color: anyLow ? ZH.warn : ZH.textFaint,
            textTransform: 'uppercase',
          }}
        >
          ∑ {roundKcal(totalKcal)} ккал · {Math.round(avgConf * 100)}%
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {editedList.map((h, i) => (
          <EditableHitRow
            key={i}
            edited={h}
            active={selectedIndex === i}
            onToggle={() => setActiveIndex((current) => (current === i ? null : i))}
            onRemove={() => onRemove(i)}
            onBeforeRemove={() => {
              setActiveIndex((current) => {
                if (current === null) return null
                if (current === i) return null
                return current > i ? current - 1 : current
              })
            }}
          />
        ))}
      </div>
      {activeEdited && activeOriginal && (
        <FoodDraftAiCard
          original={activeOriginal}
          edited={activeEdited}
          onChange={changeActive}
          title={activeTitle}
          onNameChange={changeActiveName}
          scaleKcalOnGrams
          afterControls={<RefineBar busy={refineBusy} onRefine={onRefine} />}
        />
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
        <button
          type="button"
          onClick={onDismiss}
          style={{
            all: 'unset',
            flex: 1,
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
          отмена
        </button>
        <button
          type="button"
          onClick={onConfirm}
          style={{
            all: 'unset',
            flex: 1,
            cursor: 'pointer',
            padding: '10px 0',
            textAlign: 'center',
            borderRadius: 10,
            border: `1px solid ${anyVeryLow ? mixAlpha(ZH.warn, 45) : mixAlpha(FOOD_HUE, 50)}`,
            background: anyVeryLow
              ? `linear-gradient(180deg, ${mixAlpha(ZH.warn, 20)}, ${mixAlpha(ZH.warn, 8)})`
              : `linear-gradient(180deg, ${mixAlpha(FOOD_HUE, 55)}, ${mixAlpha(FOOD_HUE, 25)})`,
            boxShadow: anyVeryLow ? 'none' : `0 0 14px ${mixAlpha(FOOD_HUE, 25)}`,
            fontFamily: ZH.mono,
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: anyVeryLow ? ZH.warn : '#06131F',
          }}
        >
          {anyVeryLow ? 'записать как есть' : 'записать всё'}
        </button>
      </div>
    </div>
  )
}

/**
 * Компактная строка AI-анализа. Подробный разбор рендерится отдельно под списком,
 * чтобы не собирать вложенные карточки и не дублировать подсказки.
 */
function EditableHitRow({
  edited,
  active,
  onToggle,
  onBeforeRemove,
  onRemove,
}: {
  edited: FoodItem
  active: boolean
  onToggle: () => void
  onBeforeRemove: () => void
  onRemove: () => void
}) {
  const lowConf = edited.confidence < LOW_CONF
  const activeColor = lowConf ? ZH.warn : FOOD_HUE
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 9,
        border: `1px solid ${
          active ? mixAlpha(activeColor, 45) : lowConf ? mixAlpha(ZH.warn, 26) : ZH.line
        }`,
        background: active ? mixAlpha(activeColor, 8) : 'rgba(18,23,36,0.34)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active}
        style={{
          all: 'unset',
          cursor: 'pointer',
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div
          style={{
            fontSize: 13,
            color: ZH.text,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {edited.name}
        </div>
        <div
          style={{
            fontFamily: ZH.mono,
            fontSize: 10,
            color: lowConf ? ZH.warn : ZH.textFaint,
            letterSpacing: '0.04em',
          }}
        >
          {edited.grams > 0 ? `${edited.grams} г · ` : ''}
          {roundKcal(edited.kcal)} ккал · {Math.round(edited.confidence * 100)}%
          {active ? ' · ▴' : ' · ▾'}
        </div>
      </button>
      <button
        type="button"
        onClick={() => {
          onBeforeRemove()
          onRemove()
        }}
        aria-label="убрать"
        style={{
          all: 'unset',
          cursor: 'pointer',
          width: 22,
          height: 22,
          borderRadius: 999,
          border: `1px solid ${ZH.line}`,
          color: ZH.textDim,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}

function IconButton({
  active,
  disabled,
  onClick,
  ariaLabel,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  const color = active ? ZH.accent : ZH.textDim
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{
        all: 'unset',
        cursor: disabled ? 'not-allowed' : 'pointer',
        width: 28,
        height: 28,
        flexShrink: 0,
        borderRadius: 8,
        border: `1px solid ${active ? accentAlpha(0.5) : ZH.line}`,
        background: active ? accentAlpha(0.14) : 'transparent',
        boxShadow: active ? `0 0 10px ${accentAlpha(0.32)}` : 'none',
        color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}

function MicIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect
        x="5"
        y="1.5"
        width="4"
        height="7"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M3 7.2 C3 9.4 4.9 10.8 7 10.8 C9.1 10.8 11 9.4 11 7.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
      />
      <line x1="7" y1="10.8" x2="7" y2="12.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect
        x="1"
        y="3.8"
        width="12"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <rect
        x="4.7"
        y="2"
        width="3"
        height="2"
        rx="0.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="7" cy="7.8" r="2.3" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

function GalleryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect
        x="1.5"
        y="2.5"
        width="11"
        height="9"
        rx="1.2"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="5" cy="5.5" r="1" stroke="currentColor" strokeWidth="1.1" fill="none" />
      <path
        d="M2 10 L5.5 7 L8 9 L10 7.5 L12.5 10"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/**
 * Три пульсирующие точки — индикатор «идёт распознавание голоса».
 * Использует глобальный `@keyframes pulse` из index.css.
 */
function VoicePulse() {
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'center' }}>
      {[0, 0.12, 0.24].map((delay, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: 3,
            borderRadius: 999,
            background: 'currentColor',
            animation: `pulse 0.9s ease-in-out ${delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}
