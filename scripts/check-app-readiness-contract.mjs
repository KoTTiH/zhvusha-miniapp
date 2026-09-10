import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const errors = []

await checkModule()
await checkSettingsUi()
await checkDocs()

if (errors.length > 0) {
  console.error(`app readiness contract failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error.file}: ${error.message}`)
  process.exit(1)
}

console.log('app readiness contract ok: local no-AI no-network no-write readiness passport is dev-only')

async function checkModule() {
  const raw = await read('src/lib/appReadiness.ts')
  expectIncludes('src/lib/appReadiness.ts', raw, [
    {
      snippet: "title: 'Паспорт готовности'",
      message: 'readiness report must keep stable Russian title',
    },
    {
      snippet: 'без AI, без сетевых запросов и без записи данных',
      message: 'readiness summary must disclose local/no-write scope',
    },
    {
      snippet: 'currentDataStorageStatus()',
      message: 'readiness report must reuse the storage status source',
    },
    {
      snippet: 'loadDataBackupStatus()',
      message: 'readiness report must reuse backup status source by default',
    },
    {
      snippet: "label: 'хранилище'",
      message: 'readiness report must include storage row',
    },
    {
      snippet: "label: 'копия'",
      message: 'readiness report must include backup row',
    },
    {
      snippet: "label: 'импорт'",
      message: 'readiness report must include import row',
    },
    {
      snippet: "label: 'сверка'",
      message: 'readiness report must include export/import fingerprint match row',
    },
    {
      snippet: 'lastExportFingerprint === backupStatus.lastImportFingerprint',
      message: 'readiness report must compare export/import fingerprints',
    },
    {
      snippet: 'последний импорт был из другого JSON-файла',
      message: 'readiness report must warn when import fingerprint differs from latest export',
    },
    {
      snippet: 'сверки export/import по коду ещё не было',
      message: 'readiness report must explain missing verification code check',
    },
    {
      snippet: "label: 'AI'",
      message: 'readiness report must include AI boundary row',
    },
    {
      snippet: "label: 'браузер'",
      message: 'readiness report must include browser localStorage row',
    },
  ])
  expectAbsent('src/lib/appReadiness.ts', raw, [
    {
      snippet: 'fetch(',
      message: 'readiness report must not make network calls',
    },
    {
      snippet: 'runDataIntegrityCheck',
      message: 'readiness report must not run the heavier integrity scan',
    },
    {
      snippet: 'importDataExport',
      message: 'readiness report must not import or write user data',
    },
    {
      snippet: 'setItem(',
      message: 'readiness report must not write localStorage',
    },
  ])
}

async function checkSettingsUi() {
  const raw = await read('src/components/SettingsSheet.tsx')
  expectIncludes('src/components/SettingsSheet.tsx', raw, [
    {
      snippet: 'buildAppReadinessReport',
      message: 'settings data tab must build app readiness report',
    },
    {
      snippet: 'const showProjectDiagnostics = import.meta.env.DEV',
      message: 'settings data tab must gate project diagnostics to dev mode',
    },
    {
      snippet: '<AppReadinessPanel backupStatus={backupStatus} />',
      message: 'settings data tab must keep readiness panel for dev diagnostics',
    },
    {
      snippet: 'report.rows.map',
      message: 'readiness panel must render report rows',
    },
    {
      snippet: 'appReadinessColor',
      message: 'readiness rows must have distinct visual tones',
    },
  ])
}

async function checkDocs() {
  const readme = await read('README.md')
  expectIncludes('README.md', readme, [
    {
      snippet: 'pnpm app-readiness:check',
      message: 'README command list must mention app readiness guard',
    },
    {
      snippet: '### Паспорт готовности',
      message: 'README must document readiness passport',
    },
    {
      snippet: 'без AI, без сетевых',
      message: 'README must document readiness check scope',
    },
    {
      snippet: 'запросов и без записи данных',
      message: 'README must document readiness check no-network/no-write scope',
    },
    {
      snippet: 'сверяет последний экспорт и импорт по коду',
      message: 'README must document readiness verification code check',
    },
  ])

  const excellence = await read('docs/competitive-excellence.md')
  expectIncludes('docs/competitive-excellence.md', excellence, [
    {
      snippet: 'Паспорт готовности',
      message: 'competitive backlog must mention readiness passport',
    },
    {
      snippet: 'pnpm app-readiness:check',
      message: 'competitive backlog must mention readiness guard',
    },
    {
      snippet: 'сверку export/import по коду',
      message: 'competitive backlog must mention readiness verification code check',
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
