import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const errors = []

await checkBottomSheet()
await checkWidgetEditing()
await checkBrowserSmoke()
await checkScriptsAndDocs()

if (errors.length > 0) {
  console.error(`accessibility contract failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error.file}: ${error.message}`)
  process.exit(1)
}

console.log('accessibility contract ok: dialogs, keyboard widget editing and UI docs')

async function checkBottomSheet() {
  const raw = await read('src/components/BottomSheet.tsx')
  expectIncludes('src/components/BottomSheet.tsx', raw, [
    {
      snippet: 'ariaLabel?: string',
      message: 'titleless sheets must expose an explicit accessible name prop',
    },
    {
      snippet: 'const FOCUSABLE_SELECTOR',
      message: 'bottom sheets must keep a local focusable selector for keyboard trapping',
    },
    {
      snippet: 'const titleId = useId()',
      message: 'titled dialogs must use a stable generated heading id',
    },
    {
      snippet: 'previousFocusRef',
      message: 'bottom sheets must remember and restore previous focus',
    },
    {
      snippet: "e.key === 'Escape'",
      message: 'Escape must close open bottom sheets',
    },
    {
      snippet: "e.key !== 'Tab'",
      message: 'Tab handling must stay explicit for modal focus wrapping',
    },
    {
      snippet: 'focus({ preventScroll: true })',
      message: 'bottom sheets must move focus without jumping the scroll position',
    },
    {
      snippet: "aria-modal={open ? 'true' : undefined}",
      message: 'aria-modal must only be exposed while the sheet is open',
    },
    {
      snippet: 'aria-hidden={!open}',
      message: 'closed sheets must be hidden from assistive tech',
    },
    {
      snippet: 'aria-labelledby={title ? titleId : undefined}',
      message: 'titled sheets must be named by their visible heading',
    },
    {
      snippet: "aria-label={title ? undefined : ariaLabel ?? 'панель'}",
      message: 'titleless sheets must still have an accessible Russian label',
    },
    {
      snippet: 'tabIndex={-1}',
      message: 'dialog panel must be programmatically focusable',
    },
    {
      snippet: 'id={titleId}',
      message: 'visible sheet title must carry the generated aria-labelledby id',
    },
  ])

  const settings = await read('src/components/SettingsSheet.tsx')
  expectIncludes('src/components/SettingsSheet.tsx', settings, [
    {
      snippet: 'ariaLabel="настройки"',
      message: 'settings sheet must name its titleless dialog',
    },
  ])

  const addEntry = await read('src/components/AddEntrySheet.tsx')
  expectIncludes('src/components/AddEntrySheet.tsx', addEntry, [
    {
      snippet: "ariaLabel={addSheet?.initialTab === 'note' ? 'добавить заметку' : 'добавить еду'}",
      message: 'add-entry sheet must name food/note dialogs for assistive tech',
    },
  ])

  const scanResult = await read('src/components/ScanResultSheet.tsx')
  expectIncludes('src/components/ScanResultSheet.tsx', scanResult, [
    {
      snippet: 'ariaLabel="найденный продукт"',
      message: 'scan-result sheet must name its titleless dialog',
    },
  ])
}

async function checkWidgetEditing() {
  const host = await read('src/components/widgets/WidgetHost.tsx')
  expectIncludes('src/components/widgets/WidgetHost.tsx', host, [
    {
      snippet: 'const CONTROL_SIZE = 40',
      message: 'widget edit controls must keep a usable touch target',
    },
    {
      snippet: 'label: string',
      message: 'widget host must receive the visible widget title for aria labels',
    },
    {
      snippet: 'const widgetAriaLabel = editing',
      message: 'widget host must expose mode-aware aria labels',
    },
    {
      snippet: 'role="group"',
      message: 'each dashboard widget must be grouped for assistive tech',
    },
    {
      snippet: 'aria-label={widgetAriaLabel}',
      message: 'each dashboard widget must have a concrete aria label',
    },
    {
      snippet: 'tabIndex={editing ? -1 : 0}',
      message: 'widgets must be keyboard-focusable outside edit mode',
    },
    {
      snippet: 'onKeyDown={handleKeyDown}',
      message: 'widget host must keep keyboard entry into edit mode',
    },
    {
      snippet: "event.key === 'Enter' || event.key === ' '",
      message: 'Enter and Space must enter widget editing',
    },
  ])

  const systemWindow = await read('src/screens/SystemWindow.tsx')
  expectIncludes('src/screens/SystemWindow.tsx', systemWindow, [
    {
      snippet: 'label={entry.meta.title}',
      message: 'system window must pass widget titles into WidgetHost',
    },
  ])

  const picker = await read('src/components/widgets/WidgetPicker.tsx')
  expectIncludes('src/components/widgets/WidgetPicker.tsx', picker, [
    {
      snippet: "aria-label={`${meta.title}. ${active ? 'включён. Нажми, чтобы выключить. ' : 'выключен. Нажми, чтобы включить. '}${meta.description}`}",
      message: 'widget picker rows must expose title, toggle state and description to assistive tech',
    },
  ])
}

async function checkScriptsAndDocs() {
  const pkg = await read('package.json')
  expectIncludes('package.json', pkg, [
    {
      snippet: '"accessibility:check": "node scripts/check-accessibility-contract.mjs"',
      message: 'package scripts must expose the accessibility guard',
    },
    {
      snippet: 'pnpm accessibility:check',
      message: 'pnpm check must include accessibility guard',
    },
    {
      snippet: '"smoke:accessibility": "node scripts/smoke-accessibility.mjs"',
      message: 'package scripts must expose the accessibility browser smoke',
    },
  ])

  const quality = await read('src/lib/qualityMap.ts')
  expectIncludes('src/lib/qualityMap.ts', quality, [
    {
      snippet: "command: 'pnpm accessibility:check'",
      message: 'quality map must expose the accessibility guard',
    },
    {
      snippet: "command: 'pnpm smoke:accessibility'",
      message: 'quality map must expose the accessibility browser smoke',
    },
    {
      snippet: 'диалоги, фокус и настройка виджетов с клавиатуры',
      message: 'quality map must describe the keyboard/dialog accessibility surface',
    },
  ])

  const readme = await read('README.md')
  expectIncludes('README.md', readme, [
    {
      snippet: 'pnpm accessibility:check',
      message: 'README command list must document accessibility guard',
    },
    {
      snippet: 'pnpm smoke:accessibility',
      message: 'README command list must document accessibility browser smoke',
    },
    {
      snippet: 'Диалоги и клавиатура',
      message: 'README must document the accessibility layer',
    },
  ])

  const excellence = await read('docs/competitive-excellence.md')
  expectIncludes('docs/competitive-excellence.md', excellence, [
    {
      snippet: 'pnpm accessibility:check',
      message: 'competitive excellence doc must mention the accessibility guard',
    },
    {
      snippet: 'pnpm smoke:accessibility',
      message: 'competitive excellence doc must mention the accessibility browser smoke',
    },
    {
      snippet: 'виджеты можно перевести в режим настройки с клавиатуры',
      message: 'competitive excellence doc must mention keyboard widget editing',
    },
  ])
}

async function checkBrowserSmoke() {
  const raw = await read('scripts/smoke-accessibility.mjs')
  expectIncludes('scripts/smoke-accessibility.mjs', raw, [
    {
      snippet: "scenario: 'accessibility keyboard dialog flow'",
      message: 'browser smoke must identify the accessibility scenario',
    },
    {
      snippet: 'widgetGroups',
      message: 'browser smoke must check focusable dashboard widgets',
    },
    {
      snippet: "key(cdp, 'Enter'",
      message: 'browser smoke must enter widget editing with keyboard',
    },
    {
      snippet: "key(cdp, 'Tab'",
      message: 'browser smoke must verify modal Tab handling',
    },
    {
      snippet: "key(cdp, 'Escape'",
      message: 'browser smoke must verify Escape closes dialogs',
    },
    {
      snippet: 'activeInside',
      message: 'browser smoke must check focus moves inside the dialog',
    },
    {
      snippet: 'tabInside',
      message: 'browser smoke must check Tab stays inside the dialog',
    },
    {
      snippet: 'focusAfterEscape',
      message: 'browser smoke must report focus restoration after Escape',
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

function fail(file, message) {
  errors.push({ file, message })
}
