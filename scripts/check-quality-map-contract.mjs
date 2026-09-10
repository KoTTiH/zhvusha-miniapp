import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const errors = []

await checkModule()
await checkSettingsUi()
await checkDocs()

if (errors.length > 0) {
  console.error(`quality map contract failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error.file}: ${error.message}`)
  process.exit(1)
}

console.log('quality map contract ok: static contract map is present as dev-only diagnostics')

async function checkModule() {
  const raw = await read('src/lib/qualityMap.ts')
  expectIncludes('src/lib/qualityMap.ts', raw, [
    {
      snippet: "export const QUALITY_MAP_TITLE = 'Карта проверок'",
      message: 'quality map must keep stable Russian title',
    },
    {
      snippet: 'Команды здесь не запускаются',
      message: 'quality map must disclose that UI does not run commands',
    },
    {
      snippet: "command: 'pnpm nutrition:check'",
      message: 'quality map must mention nutrition disclosure guard',
    },
    {
      snippet: "command: 'pnpm barcode:check'",
      message: 'quality map must mention barcode guard',
    },
    {
      snippet: "command: 'pnpm day-voice:check'",
      message: 'quality map must mention day voice guard',
    },
    {
      snippet: "command: 'pnpm ai-credit:check'",
      message: 'quality map must mention AI credit guard',
    },
    {
      snippet: "command: 'pnpm ai-privacy:check'",
      message: 'quality map must mention AI privacy guard',
    },
    {
      snippet: "command: 'pnpm assistant:check'",
      message: 'quality map must mention assistant guard',
    },
    {
      snippet: 'подтверждаемая память и private photo boundary',
      message: 'quality map must explain assistant memory/photo coverage',
    },
    {
      snippet: "command: 'pnpm data-export:check'",
      message: 'quality map must mention data export guard',
    },
    {
      snippet: "command: 'pnpm storage-status:check'",
      message: 'quality map must mention storage status guard',
    },
    {
      snippet: "command: 'pnpm widgets:check'",
      message: 'quality map must mention widgets guard',
    },
    {
      snippet: "command: 'pnpm smoke:smart-history'",
      message: 'quality map must mention smart-history browser smoke',
    },
    {
      snippet: "command: 'pnpm smoke:data-export'",
      message: 'quality map must mention data export browser smoke',
    },
    {
      snippet: "command: 'pnpm bundle:check'",
      message: 'quality map must mention production bundle budget guard',
    },
    {
      snippet: "command: 'pnpm accessibility:check'",
      message: 'quality map must mention accessibility guard',
    },
    {
      snippet: "command: 'pnpm smoke:accessibility'",
      message: 'quality map must mention accessibility browser smoke',
    },
    {
      snippet: 'диалоги, фокус и настройка виджетов с клавиатуры',
      message: 'quality map must explain keyboard/dialog accessibility coverage',
    },
    {
      snippet: 'keyboard edit mode, focus trap, Escape и возврат фокуса',
      message: 'quality map must explain real browser accessibility smoke coverage',
    },
    {
      snippet: 'стартовый JS',
      message: 'quality map must explain that bundle guard covers first-load JS',
    },
    {
      snippet: 'grouped integrity diagnostics',
      message: 'quality map must describe that data smoke covers grouped integrity diagnostics',
    },
    {
      snippet: "command: 'pnpm quality-gate:check'",
      message: 'quality map must mention quality gate guard',
    },
  ])
  expectAbsent('src/lib/qualityMap.ts', raw, [
    {
      snippet: 'fetch(',
      message: 'quality map must not make network calls',
    },
    {
      snippet: 'child_process',
      message: 'quality map must not run shell commands',
    },
    {
      snippet: 'localStorage.setItem',
      message: 'quality map must not write browser storage',
    },
  ])
}

async function checkSettingsUi() {
  const raw = await read('src/components/SettingsSheet.tsx')
  expectIncludes('src/components/SettingsSheet.tsx', raw, [
    {
      snippet: 'QUALITY_MAP_ROWS',
      message: 'settings data tab must render shared quality map rows',
    },
    {
      snippet: 'const showProjectDiagnostics = import.meta.env.DEV',
      message: 'settings data tab must gate project diagnostics to dev mode',
    },
    {
      snippet: '<QualityMapPanel />',
      message: 'settings data tab must keep quality map panel for dev diagnostics',
    },
    {
      snippet: 'row.command',
      message: 'quality map panel must show guard command names',
    },
    {
      snippet: 'qualityMapColor',
      message: 'quality map rows must have distinct visual tones',
    },
  ])
}

async function checkDocs() {
  const readme = await read('README.md')
  expectIncludes('README.md', readme, [
    {
      snippet: 'pnpm quality-map:check',
      message: 'README command list must mention quality map guard',
    },
    {
      snippet: '### Карта проверок',
      message: 'README must document the quality map',
    },
    {
      snippet: 'Команды в панели не',
      message: 'README must document that UI quality map is read-only',
    },
    {
      snippet: 'read-only справка',
      message: 'README must explain the quality map is informational only',
    },
    {
      snippet: 'browser-smoke',
      message: 'README must document browser smoke rows in the quality map',
    },
    {
      snippet: 'pnpm bundle:check',
      message: 'README must document the bundle budget row in the quality map',
    },
    {
      snippet: 'pnpm accessibility:check',
      message: 'README must document the accessibility row in the quality map',
    },
    {
      snippet: 'pnpm smoke:accessibility',
      message: 'README must document the accessibility browser smoke row',
    },
  ])

  const excellence = await read('docs/competitive-excellence.md')
  expectIncludes('docs/competitive-excellence.md', excellence, [
    {
      snippet: 'Карта проверок',
      message: 'competitive backlog must mention quality map',
    },
    {
      snippet: 'pnpm quality-map:check',
      message: 'competitive backlog must mention quality map guard',
    },
    {
      snippet: 'browser-smoke',
      message: 'competitive backlog must mention browser smoke rows in the quality map',
    },
    {
      snippet: 'pnpm bundle:check',
      message: 'competitive backlog must mention production bundle budget guard',
    },
    {
      snippet: 'pnpm accessibility:check',
      message: 'competitive backlog must mention accessibility guard',
    },
    {
      snippet: 'pnpm smoke:accessibility',
      message: 'competitive backlog must mention accessibility browser smoke',
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
