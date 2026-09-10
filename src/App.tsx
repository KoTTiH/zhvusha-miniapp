import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { BottomSheet } from './components/BottomSheet'
import { FabStack } from './components/Fab'
import { Toast } from './components/Toast'
import { ZHTabBar, type ZHTab } from './design/ZHTabBar'
import { ZH } from './design/tokens'
import { SystemWindow } from './screens/SystemWindow'
import { normalizeBarcode } from './lib/barcode'
import { newCalorieId } from './lib/calorieStorage'
import { dayKey, monthGrid, startOfMonth } from './lib/dates'
import { hapticImpact } from './lib/haptic'
import { useCaloriesStore } from './store/calories'
import { useNotesStore } from './store/notes'
import { useThemeStore } from './store/theme'
import { useWidgetsStore } from './store/widgets'
import type { DayKey } from './types/note'
import type { Food, NutritionEstimate, Serving } from './types/calorie'
import type { VoiceRecorder } from './lib/voice'

const AddEntrySheet = lazy(() =>
  import('./components/AddEntrySheet').then((module) => ({ default: module.AddEntrySheet })),
)
const BarcodeScanner = lazy(() =>
  import('./components/BarcodeScanner').then((module) => ({ default: module.BarcodeScanner })),
)
const BalanceSheet = lazy(() =>
  import('./components/BalanceSheet').then((module) => ({ default: module.BalanceSheet })),
)
const DayVoicePanel = lazy(() =>
  import('./components/DayVoicePanel').then((module) => ({ default: module.DayVoicePanel })),
)
const ExpandedDayView = lazy(() =>
  import('./components/ExpandedDayView').then((module) => ({ default: module.ExpandedDayView })),
)
const FoodEditorScreen = lazy(() =>
  import('./components/FoodEditorScreen').then((module) => ({ default: module.FoodEditorScreen })),
)
const GoalEditorScreen = lazy(() =>
  import('./components/GoalEditorScreen').then((module) => ({ default: module.GoalEditorScreen })),
)
const MealEditorScreen = lazy(() =>
  import('./components/MealEditorScreen').then((module) => ({ default: module.MealEditorScreen })),
)
const ScanResultSheet = lazy(() =>
  import('./components/ScanResultSheet').then((module) => ({ default: module.ScanResultSheet })),
)
const ZHMap = lazy(() =>
  import('./screens/ZHMap').then((module) => ({ default: module.ZHMap })),
)
const ZhvushaAssistant = lazy(() =>
  import('./screens/ZhvushaAssistant').then((module) => ({ default: module.ZhvushaAssistant })),
)

export default function App() {
  const hydrate = useNotesStore((s) => s.hydrate)
  const loadDay = useNotesStore((s) => s.loadDay)
  const loadNotesRange = useNotesStore((s) => s.loadRange)
  const notesHydrated = useNotesStore((s) => s.hydrated)
  const selectedDay = useNotesStore((s) => s.selectedDay)
  const openedDay = useNotesStore((s) => s.openedDay)
  const openedDayTarget = useNotesStore((s) => s.openedDayTarget)
  const openDay = useNotesStore((s) => s.openDay)
  const closeDay = useNotesStore((s) => s.closeDay)
  const hydrateCalories = useCaloriesStore((s) => s.hydrate)
  const hydrateWidgets = useWidgetsStore((s) => s.hydrate)
  const loadCaloriesRange = useCaloriesStore((s) => s.loadRange)
  const loadWaterRange = useCaloriesStore((s) => s.loadWaterRange)
  const loadDayMetaRange = useCaloriesStore((s) => s.loadDayMetaRange)
  const caloriesHydrated = useCaloriesStore((s) => s.hydrated)
  const widgetsHydrated = useWidgetsStore((s) => s.hydrated)
  const hasWidgets = useWidgetsStore((s) => s.widgets.length > 0)
  const hydrateTheme = useThemeStore((s) => s.hydrate)
  const editorFoodId = useCaloriesStore((s) => s.editorFoodId)
  const editorMealId = useCaloriesStore((s) => s.editorMealId)
  const editorGoalOpen = useCaloriesStore((s) => s.editorGoalOpen)
  const openAddSheet = useCaloriesStore((s) => s.openAddSheet)
  const closeAddSheet = useCaloriesStore((s) => s.closeAddSheet)
  const addSheet = useCaloriesStore((s) => s.addSheet)
  const closeScanner = useCaloriesStore((s) => s.closeScanner)
  const scanner = useCaloriesStore((s) => s.scanner)
  const findFoodByBarcode = useCaloriesStore((s) => s.findFoodByBarcode)
  const showScanResult = useCaloriesStore((s) => s.showScanResult)
  const openFoodEditorWith = useCaloriesStore((s) => s.openFoodEditorWith)
  const upsertFood = useCaloriesStore((s) => s.upsertFood)
  const showToast = useCaloriesStore((s) => s.showToast)
  const scanResultOpen = useCaloriesStore((s) => s.scanResult !== null)

  const [expandRect, setExpandRect] = useState<DOMRect | null>(null)
  const [tab, setTab] = useState<ZHTab>('system')
  const [dayVoiceOpen, setDayVoiceOpen] = useState(false)
  const [dayVoiceInitialText, setDayVoiceInitialText] = useState('')
  const [dayVoiceAutoParseNonce, setDayVoiceAutoParseNonce] = useState(0)
  const [dayVoiceSessionKey, setDayVoiceSessionKey] = useState(0)
  const [dayVoiceHelpOpen, setDayVoiceHelpOpen] = useState(false)
  const [dayVoiceHoldRecording, setDayVoiceHoldRecording] = useState(false)
  const [dayVoiceExhaustedOpen, setDayVoiceExhaustedOpen] = useState(false)
  const [assistantMounted, setAssistantMounted] = useState(false)
  const quickDayVoiceRef = useRef<VoiceRecorder | null>(null)
  const quickDayVoiceStartingRef = useRef(false)
  const quickDayVoiceStopAfterStartRef = useRef(false)
  const initialCalendarDays = useMemo(
    () => monthGrid(startOfMonth(new Date())).map((d) => dayKey(d)),
    [],
  )

  useLayoutEffect(() => {
    hydrateWidgets()
  }, [hydrateWidgets])

  useEffect(() => {
    hydrateTheme()
    void hydrate()
    void hydrateCalories()
  }, [hydrate, hydrateCalories, hydrateTheme])

  useEffect(() => {
    if (!notesHydrated || !caloriesHydrated) return
    void loadNotesRange(initialCalendarDays)
    void loadCaloriesRange(initialCalendarDays)
    void loadWaterRange(initialCalendarDays)
    void loadDayMetaRange(initialCalendarDays)
  }, [
    notesHydrated,
    caloriesHydrated,
    initialCalendarDays,
    loadNotesRange,
    loadCaloriesRange,
    loadWaterRange,
    loadDayMetaRange,
  ])

  useEffect(() => {
    return () => quickDayVoiceRef.current?.stop()
  }, [])

  useEffect(() => {
    if (selectedDay) void loadDay(selectedDay)
  }, [selectedDay, loadDay])

  const handleDayTap = (day: DayKey, rect: DOMRect) => {
    setExpandRect(rect)
    openDay(day)
  }

  const handleExpandedClose = () => {
    closeDay()
    setExpandRect(null)
  }

  const handleTabChange = (next: ZHTab) => {
    if (next === 'assistant') setAssistantMounted(true)
    if (openedDay) {
      closeDay()
      setExpandRect(null)
    }
    if (addSheet) closeAddSheet()
    if (dayVoiceOpen) {
      closeDayVoiceSheet()
    }
    setTab(next)
  }

  const handleAddFab = (initialTab: 'food' | 'note') => {
    if (dayVoiceOpen) closeDayVoiceSheet()
    const today = dayKey(new Date())
    const day = tab === 'system' ? today : openedDay ?? selectedDay ?? today
    openAddSheet(day, initialTab)
  }

  const closeDayVoiceSheet = () => {
    setDayVoiceOpen(false)
    setDayVoiceInitialText('')
    setDayVoiceHelpOpen(false)
    setDayVoiceSessionKey((n) => n + 1)
  }

  const handleQuickDayVoiceError = (err: string) => {
    if (import.meta.env.DEV) console.warn('[quick-day-hold] voice error:', err)
    if (err === 'insufficient-tokens') setDayVoiceExhaustedOpen(true)
    else if (err === 'not-allowed') showToast('микрофон не разрешён')
    else if (err === 'no-speech' || err === 'empty-transcription') showToast('не услышал')
    else if (err === 'too-large') showToast('слишком длинная запись')
    else if (err === 'unavailable' || err === 'mic-failed') showToast('голос недоступен')
    else showToast('AI не распознал')
  }

  const startQuickDayVoiceHold = () => {
    if (!isQuickVoiceAvailable()) {
      showToast('голос недоступен')
      return
    }
    if (quickDayVoiceStartingRef.current || quickDayVoiceRef.current?.isActive()) return
    if (addSheet) closeAddSheet()
    closeDayVoiceSheet()
    quickDayVoiceStartingRef.current = true
    quickDayVoiceStopAfterStartRef.current = false
    setDayVoiceHoldRecording(true)
    void startQuickDayVoiceRecorder()
  }

  const startQuickDayVoiceRecorder = async () => {
    try {
      if (!quickDayVoiceRef.current) {
        const { VoiceRecorder } = await import('./lib/voice')
        quickDayVoiceRef.current = new VoiceRecorder()
      }
      const recorder = quickDayVoiceRef.current
      const started = await recorder.start({
        onStart: () => {
          quickDayVoiceStartingRef.current = false
          if (quickDayVoiceStopAfterStartRef.current) {
            quickDayVoiceStopAfterStartRef.current = false
            recorder.stop()
            return
          }
          hapticImpact('light')
        },
        onStop: () => {
          hapticImpact('light')
        },
        onFinal: (t) => {
          const text = t.trim()
          if (!text) return
          setDayVoiceInitialText(text)
          setDayVoiceSessionKey((n) => n + 1)
          setDayVoiceHelpOpen(false)
          setDayVoiceOpen(true)
          setDayVoiceAutoParseNonce((n) => n + 1)
        },
        onError: handleQuickDayVoiceError,
        onEnd: () => {
          quickDayVoiceStartingRef.current = false
          quickDayVoiceStopAfterStartRef.current = false
          setDayVoiceHoldRecording(false)
        },
      })
      if (!started) {
        quickDayVoiceStartingRef.current = false
        quickDayVoiceStopAfterStartRef.current = false
        setDayVoiceHoldRecording(false)
      }
    } catch {
      quickDayVoiceStartingRef.current = false
      quickDayVoiceStopAfterStartRef.current = false
      setDayVoiceHoldRecording(false)
      handleQuickDayVoiceError('unavailable')
    }
  }

  const stopQuickDayVoiceHold = () => {
    const recorder = quickDayVoiceRef.current
    if (recorder?.isActive()) {
      recorder.stop()
      return
    }
    if (quickDayVoiceStartingRef.current) {
      quickDayVoiceStopAfterStartRef.current = true
      return
    }
    setDayVoiceHoldRecording(false)
  }

  const handleDayVoiceFab = (action: 'open' | 'hold-start' | 'hold-stop') => {
    if (action === 'hold-start') {
      startQuickDayVoiceHold()
      return
    }
    if (action === 'hold-stop') {
      stopQuickDayVoiceHold()
      return
    }
    if (addSheet) closeAddSheet()
    setDayVoiceInitialText('')
    setDayVoiceSessionKey((n) => n + 1)
    setDayVoiceHelpOpen(false)
    setDayVoiceOpen(true)
  }

  const handleAddScanDetected = async (code: string) => {
    const normalized = normalizeBarcode(code)
    if (!/^\d{8,14}$/.test(normalized)) {
      showToast('Код не распознан')
      closeScanner()
      return
    }
    const day = scanner?.day ?? openedDay ?? selectedDay ?? dayKey(new Date())
    const local = findFoodByBarcode(normalized)
    if (local) {
      closeScanner()
      showScanResult(local, day)
      return
    }

    closeScanner()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 4000)
    try {
      const { lookupBarcode } = await import('./lib/openFoodFacts')
      const off = await lookupBarcode(normalized, controller.signal)
      window.clearTimeout(timeout)
      if (off) {
        const now = Date.now()
        const estimate: NutritionEstimate = {
          source: 'barcode',
          confidence: off.per100g.kcalEstimated ? 0.88 : 0.95,
          portionBasis: 'label',
          basisLabel: off.per100g.kcalEstimated
            ? 'ккал рассчитаны по БЖУ'
            : 'этикетка Open Food Facts',
          dataSource: 'Open Food Facts',
        }
        const serving: Serving = {
          id: newCalorieId('s'),
          label: '100 г',
          grams: 100,
          kcal: off.per100g.kcal,
          carbs: off.per100g.carbs,
          fat: off.per100g.fat,
          protein: off.per100g.protein,
          ...(off.per100g.fiber !== undefined ? { fiber: off.per100g.fiber } : {}),
        }
        const food: Food = {
          id: newCalorieId('f'),
          name: off.name,
          barcode: normalized,
          servings: [serving],
          estimate,
          favourite: false,
          archived: false,
          createdAt: now,
          updatedAt: now,
          ...(off.brand !== undefined ? { brand: off.brand } : {}),
        }
        await upsertFood(food)
        showScanResult(food, day)
      } else {
        openFoodEditorWith({ barcode: normalized })
        showToast('Код сохранён, заполните вручную')
      }
    } catch {
      window.clearTimeout(timeout)
      openFoodEditorWith({ barcode: normalized })
      showToast('Код сохранён, заполните вручную')
    }
  }

  const editorOpen = editorFoodId !== null || editorMealId !== null || editorGoalOpen
  const addScannerOpen = scanner !== null && scanner.mode === 'addEntry'
  const showGlobalFab = widgetsHydrated && hasWidgets && tab !== 'assistant'
  const keepAssistantMounted = assistantMounted || tab === 'assistant'

  return (
    <>
      {editorFoodId ? (
        <Suspense fallback={<FullscreenFallback />}>
          <FoodEditorScreen key={editorFoodId} />
        </Suspense>
      ) : editorMealId ? (
        <Suspense fallback={<FullscreenFallback />}>
          <MealEditorScreen key={editorMealId} />
        </Suspense>
      ) : editorGoalOpen ? (
        <Suspense fallback={<FullscreenFallback />}>
          <GoalEditorScreen />
        </Suspense>
      ) : (
        <main className="h-dvh relative overflow-hidden" style={{ background: ZH.bg }}>
          {tab === 'system' && <SystemWindow />}
          {tab === 'map' && (
            <Suspense fallback={<MapFallback />}>
              <ZHMap onDayTap={handleDayTap} />
            </Suspense>
          )}
          {keepAssistantMounted && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: tab === 'assistant' ? 'block' : 'none',
              }}
            >
              <Suspense fallback={tab === 'assistant' ? <AssistantFallback /> : null}>
                <ZhvushaAssistant />
              </Suspense>
            </div>
          )}
          {showGlobalFab && (
            <FabStack
              onAdd={handleAddFab}
              onDayVoice={handleDayVoiceFab}
              dayVoiceActive={dayVoiceHoldRecording}
              sheetOpen={addSheet !== null || dayVoiceOpen}
              plusActive={addSheet !== null}
              onClose={() => {
                if (addSheet) closeAddSheet()
                if (dayVoiceOpen) closeDayVoiceSheet()
              }}
              raised
            />
          )}
          {addSheet && (
            <Suspense fallback={null}>
              <AddEntrySheet />
            </Suspense>
          )}
          <BottomSheet
            open={dayVoiceOpen}
            onClose={closeDayVoiceSheet}
            title="быстрая запись дня"
            right={
              <button
                type="button"
                onClick={() => setDayVoiceHelpOpen((v) => !v)}
                aria-label="подсказка"
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  height: 28,
                  width: 28,
                  borderRadius: 999,
                  border: `1px solid ${ZH.line}`,
                  color: dayVoiceHelpOpen ? ZH.accent : ZH.textDim,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: ZH.mono,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                ?
              </button>
            }
            swipeAnywhere
          >
            {dayVoiceOpen ? (
              <Suspense fallback={<SheetFallback />}>
                <DayVoicePanel
                  key={dayVoiceSessionKey}
                  framed={false}
                  initialText={dayVoiceInitialText}
                  autoParseNonce={dayVoiceAutoParseNonce}
                  helpOpen={dayVoiceHelpOpen}
                  onSaved={() => {
                    closeDayVoiceSheet()
                  }}
                />
              </Suspense>
            ) : null}
          </BottomSheet>
          <ZHTabBar active={tab} onChange={handleTabChange} />
        </main>
      )}
      {!editorOpen && openedDay && (
        <Suspense fallback={null}>
          <ExpandedDayView
            key={openedDay}
            day={openedDay}
            rect={expandRect ?? undefined}
            initialScrollTarget={openedDayTarget}
            onClose={handleExpandedClose}
          />
        </Suspense>
      )}
      {!editorOpen && addScannerOpen && (
        <Suspense fallback={<ScannerFallback />}>
          <BarcodeScanner
            onDetected={(code) => void handleAddScanDetected(code)}
            onClose={closeScanner}
          />
        </Suspense>
      )}
      {scanResultOpen && (
        <Suspense fallback={null}>
          <ScanResultSheet />
        </Suspense>
      )}
      {dayVoiceExhaustedOpen && (
        <Suspense fallback={null}>
          <BalanceSheet
            open={dayVoiceExhaustedOpen}
            onClose={() => setDayVoiceExhaustedOpen(false)}
            exhausted
          />
        </Suspense>
      )}
      <Toast />
    </>
  )
}

function FullscreenFallback() {
  return (
    <main
      className="h-dvh relative overflow-hidden"
      style={{
        background: ZH.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ZH.textFaint,
        fontFamily: ZH.mono,
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      загрузка
    </main>
  )
}

function SheetFallback() {
  return (
    <div
      style={{
        padding: '18px 4px 28px',
        color: ZH.textFaint,
        fontFamily: ZH.mono,
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        textAlign: 'center',
      }}
    >
      загрузка
    </div>
  )
}

function ScannerFallback() {
  return (
    <div
      className="fixed inset-0 z-40"
      style={{
        background: ZH.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ZH.textDim,
        fontFamily: ZH.mono,
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      запуск камеры
    </div>
  )
}

function MapFallback() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ZH.textFaint,
        fontFamily: ZH.mono,
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      загрузка карты
    </div>
  )
}

function AssistantFallback() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ZH.textFaint,
        fontFamily: ZH.mono,
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
      }}
    >
      загрузка жвуши
    </div>
  )
}

function isQuickVoiceAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (!navigator.mediaDevices?.getUserMedia) return false
  if (typeof MediaRecorder === 'undefined') return false
  return true
}
