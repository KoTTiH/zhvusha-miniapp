import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const errors = []
const keptWidgetIds = ['calories-today', 'water-today']
const removedWidgetIds = [
  'fact-frame-30',
  'week-snapshot',
  'estimate-audit',
  'diary-search',
  'coverage-gaps',
  'backup-status',
]

await checkWidgetTypes()
await checkRegistry()
await checkStore()
await checkPickerAndHost()
await checkDocs()

if (errors.length > 0) {
  console.error(`widget defaults contract failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error.file}: ${error.message}`)
  process.exit(1)
}

console.log('widget layout ok: first-run dashboard stays empty until the user enables widgets')

async function checkWidgetTypes() {
  const raw = await read('src/types/widget.ts')
  for (const id of keptWidgetIds) {
    if (!raw.includes(`'${id}'`)) fail('src/types/widget.ts', `WidgetId/WIDGET_IDS must include ${id}`)
  }
  for (const id of removedWidgetIds) {
    if (raw.includes(`'${id}'`)) fail('src/types/widget.ts', `removed widget id must stay absent: ${id}`)
  }
}

async function checkRegistry() {
  const raw = await read('src/components/widgets/registry.tsx')
  for (const id of keptWidgetIds) {
    if (!raw.includes(`'${id}': {`)) {
      fail('src/components/widgets/registry.tsx', `registry must include ${id}`)
    }
  }
  expectIncludes('src/components/widgets/registry.tsx', raw, [
    {
      snippet: 'Component: CaloriesTodayWidget',
      message: 'calories widget must stay wired in registry',
    },
    {
      snippet: 'Component: WaterTodayWidget',
      message: 'water widget must stay wired in registry',
    },
  ])
  expectAbsent('src/components/widgets/registry.tsx', raw, [
    {
      snippet: 'lazyWidgets',
      message: 'removed widget lazy registry must not be imported',
    },
    {
      snippet: 'WeekSnapshotWidget',
      message: 'removed week snapshot widget must not stay registered',
    },
    {
      snippet: 'BackupStatusWidget',
      message: 'removed backup widget must not stay registered',
    },
    {
      snippet: 'DiarySearchWidget',
      message: 'removed diary search widget must not stay registered',
    },
    {
      snippet: 'CoverageGapsWidget',
      message: 'removed coverage gaps widget must not stay registered',
    },
    {
      snippet: 'EstimateAuditWidget',
      message: 'removed estimate audit widget must not stay registered',
    },
    {
      snippet: 'FactFrame30Widget',
      message: 'removed fact frame widget must not stay registered',
    },
  ])
}

async function checkStore() {
  const raw = await read('src/store/widgets.ts')
  expectIncludes('src/store/widgets.ts', raw, [
    {
      snippet: 'if (raw === null) return []',
      message: 'missing widget key must keep the first-run dashboard empty',
    },
    {
      snippet: 'toggleType: (type: WidgetId) => void',
      message: 'store must expose widget type toggling for the picker',
    },
    {
      snippet: 'const parsed = JSON.parse(raw)',
      message: 'stored widget layout must still be parsed from localStorage',
    },
    {
      snippet: 'if (!Array.isArray(parsed)) return []',
      message: 'corrupt/non-array stored layout must not create hidden defaults',
    },
    {
      snippet: 'if (get().widgets.some((widget) => widget.type === type)) return',
      message: 'add() must stay idempotent when a widget type already exists',
    },
    {
      snippet: 'const next = get().widgets.filter((w) => w.id !== id)',
      message: 'removing all widgets must save an explicit empty list',
    },
    {
      snippet: 'toggleType(type)',
      message: 'toggleType implementation must stay present',
    },
    {
      snippet: 'current.filter((widget) => widget.type !== type)',
      message: 'toggleType must remove active widgets by type',
    },
    {
      snippet: 'saveWidgets(next)',
      message: 'widget mutations must persist the user layout',
    },
  ])
  expectAbsent('src/store/widgets.ts', raw, [
    {
      snippet: 'week-snapshot',
      message: 'removed week snapshot must not remain in defaults',
    },
    {
      snippet: 'DEFAULT_WIDGET_TYPES',
      message: 'first-run widgets must not be recreated from a default type list',
    },
    {
      snippet: 'function defaultWidgets()',
      message: 'store must not synthesize hidden default widget instances',
    },
    {
      snippet: 'default-${type}',
      message: 'store must not create hidden stable default widget ids',
    },
    {
      snippet: 'return defaultWidgets()',
      message: 'missing or corrupt widget layout must not load defaults',
    },
    {
      snippet: 'if (!raw) return defaultWidgets()',
      message: 'empty string or saved empty state must not be treated as first-run',
    },
  ])
}

async function checkPickerAndHost() {
  const picker = await read('src/components/widgets/WidgetPicker.tsx')
  expectIncludes('src/components/widgets/WidgetPicker.tsx', picker, [
    {
      snippet: 'const ids = WIDGET_IDS',
      message: 'picker must be driven by the canonical widget id list',
    },
    {
      snippet: 'onToggle: (type: WidgetId) => void',
      message: 'picker must toggle widget types instead of one-shot adding them',
    },
    {
      snippet: 'aria-pressed={active}',
      message: 'picker rows must expose their enabled state',
    },
    {
      snippet: 'onClick={() => onToggle(id)}',
      message: 'picker row click must toggle without closing the sheet',
    },
  ])

  const systemWindow = await read('src/screens/SystemWindow.tsx')
  expectIncludes('src/screens/SystemWindow.tsx', systemWindow, [
    {
      snippet: 'const hasWidgets = widgets.length > 0',
      message: 'system window must still support a deliberately empty saved dashboard',
    },
    {
      snippet: 'const dashboardReady = widgetsReady && (hasWidgets || caloriesHydrated)',
      message: 'empty dashboard must wait for hydrated state without flashing fallback content',
    },
    {
      snippet: '<DashboardHydrationSpace />',
      message: 'dashboard hydrate fallback must reserve space without visible loading copy',
    },
    {
      snippet: "aria-label={hasWidgets ? 'настроить виджеты' : 'добавить виджеты'}",
      message: 'header pencil must stay available even before widgets are enabled',
    },
    {
      snippet: 'onToggle={toggleWidgetType}',
      message: 'system window must wire the picker to toggle widget types',
    },
    {
      snippet: 'tab={settingsTab}',
      message: 'settings sheet must receive the requested tab',
    },
  ])
  expectAbsent('src/screens/SystemWindow.tsx', systemWindow, [
    {
      snippet: 'загрузка виджета',
      message: 'system window must not flash visible widget-loading copy during hydration',
    },
  ])

  const app = await read('src/App.tsx')
  expectIncludes('src/App.tsx', app, [
    {
      snippet: 'const showGlobalFab = widgetsHydrated && hasWidgets',
      message: 'global FAB buttons must appear only after the user enabled at least one widget',
    },
  ])
}

async function checkDocs() {
  const readme = await read('README.md')
  expectIncludes('README.md', readme, [
    {
      snippet: 'pnpm widgets:check',
      message: 'README command list must mention the widget defaults guard',
    },
    {
      snippet: 'Виджеты не включаются скрытым дефолтом',
      message: 'README must document opt-in dashboard widgets',
    },
  ])

  const excellence = await read('docs/competitive-excellence.md')
  expectIncludes('docs/competitive-excellence.md', excellence, [
    {
      snippet: 'pnpm widgets:check',
      message: 'competitive backlog must mention the widget defaults guard',
    },
    {
      snippet: 'Виджеты не появляются скрытым дефолтом',
      message: 'competitive backlog must document opt-in dashboard widgets',
    },
    {
      snippet: 'первый food CTA',
      message: 'competitive backlog must document the first-run food CTA',
    },
  ])
}

async function read(file) {
  return readFile(resolve(root, file), 'utf8')
}

function expectIncludes(file, raw, checks) {
  for (const check of checks) {
    if (!raw.includes(check.snippet)) fail(file, check.message)
  }
}

function expectAbsent(file, raw, checks) {
  for (const check of checks) {
    if (raw.includes(check.snippet)) fail(file, check.message)
  }
}

function fail(file, message) {
  errors.push({ file, message })
}
