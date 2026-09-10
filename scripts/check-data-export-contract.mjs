import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const errors = []

await checkStorageContract()
await checkExportModule()
await checkBackupStatus()
await checkDataIntegrity()
await checkSettingsUi()
await checkDocs()

if (errors.length > 0) {
  console.error(`data export contract failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error.file}: ${error.message}`)
  process.exit(1)
}

console.log('data export contract ok: storage scan, export module and settings UI')

async function checkStorageContract() {
  const client = await read('src/lib/calorieStorage.ts')
  expectIncludes('src/lib/calorieStorage.ts', client, [
    {
      snippet: 'listDaysWithWater(): Promise<DayKey[]>',
      message: 'calorie storage interface must list water-only days for export',
    },
    {
      snippet: 'listDaysWithDayMeta(): Promise<DayKey[]>',
      message: 'calorie storage interface must list day metadata days for export',
    },
    {
      snippet: "{ op: 'listDaysWithWater' }",
      message: 'remote backend must call listDaysWithWater',
    },
    {
      snippet: "{ op: 'listDaysWithDayMeta' }",
      message: 'remote backend must call listDaysWithDayMeta',
    },
    {
      snippet: 'CLOUD_PREFIX.water',
      message: 'cloud/local export scan must include water keys',
    },
    {
      snippet: 'CLOUD_PREFIX.dayMeta',
      message: 'cloud/local export scan must include day metadata keys',
    },
  ])

  const api = await read('api/calorie-storage.ts')
  expectIncludes('api/calorie-storage.ts', api, [
    {
      snippet: "case 'listDaysWithWater':",
      message: 'server storage route must expose listDaysWithWater',
    },
    {
      snippet: "case 'listDaysWithDayMeta':",
      message: 'server storage route must expose listDaysWithDayMeta',
    },
    {
      snippet: 'FROM water_days',
      message: 'listDaysWithWater must read water_days',
    },
    {
      snippet: 'FROM day_meta',
      message: 'listDaysWithDayMeta must read day_meta',
    },
  ])
  if (count(api, "case 'listDaysWithWater':") < 2) {
    fail('api/calorie-storage.ts', 'empty response must allow listDaysWithWater without user id')
  }
  if (count(api, "case 'listDaysWithDayMeta':") < 2) {
    fail('api/calorie-storage.ts', 'empty response must allow listDaysWithDayMeta without user id')
  }
}

async function checkExportModule() {
  const raw = await read('src/lib/dataExport.ts')
  expectIncludes('src/lib/dataExport.ts', raw, [
    {
      snippet: "app: 'zhvusha-miniapp'",
      message: 'export must be branded for future import/versioning',
    },
    {
      snippet: 'version: 1',
      message: 'export must carry a schema version',
    },
    {
      snippet: "scope: 'current-user'",
      message: 'export must describe scope without raw Telegram user id',
    },
    {
      snippet: 'storageKind: StorageKind',
      message: 'export must record active storage kind',
    },
    {
      snippet: 'fingerprint: string',
      message: 'export and import summaries must carry a short file fingerprint',
    },
    {
      snippet: 'fingerprint: exportFingerprint(draft)',
      message: 'new exports must derive a stable fingerprint before serialization',
    },
    {
      snippet: 'export function exportFingerprint',
      message: 'export module must expose the fingerprint helper for contract visibility',
    },
    {
      snippet: 'stableStringify',
      message: 'fingerprint must not depend on object insertion order',
    },
    {
      snippet: 'fnv32Hex',
      message: 'fingerprint must be a compact deterministic hex digest',
    },
    {
      snippet: 'pickCalorieStorage()',
      message: 'export must read calorie data through the adapter',
    },
    {
      snippet: 'pickStorage()',
      message: 'export must read notes through the adapter',
    },
    {
      snippet: 'getStorageKind()',
      message: 'export must include storage kind',
    },
    {
      snippet: 'calorieStorage.listDaysWithEntries()',
      message: 'export must scan food-entry days',
    },
    {
      snippet: 'calorieStorage.listDaysWithWater()',
      message: 'export must scan water-only days',
    },
    {
      snippet: 'calorieStorage.listDaysWithDayMeta()',
      message: 'export must scan day metadata days',
    },
    {
      snippet: 'noteStorage.listDaysWithNotes()',
      message: 'export must scan note-only days',
    },
    {
      snippet: 'calorieStorage.loadDays(days)',
      message: 'export must load food entries for the full union of days',
    },
    {
      snippet: 'calorieStorage.loadWaterDays(days)',
      message: 'export must load water for the full union of days',
    },
    {
      snippet: 'calorieStorage.loadDayMetaRange(days)',
      message: 'export must load day metadata for the full union of days',
    },
    {
      snippet: 'noteStorage.loadMany(days)',
      message: 'export must load notes for the full union of days',
    },
    {
      snippet: 'calorieStorage.listFoods()',
      message: 'export must include local food library',
    },
    {
      snippet: 'calorieStorage.listMeals()',
      message: 'export must include meal templates',
    },
    {
      snippet: 'calorieStorage.loadRecent()',
      message: 'export must include smart-history/recent state',
    },
    {
      snippet: 'calorieStorage.loadGoal()',
      message: 'export must include calorie goal',
    },
    {
      snippet: 'loadWaterGoalMl()',
      message: 'export must include water goal setting',
    },
    {
      snippet: 'loadWaterQuickAmounts()',
      message: 'export must include water quick amounts',
    },
    {
      snippet: 'useWidgetsStore.getState().widgets',
      message: 'export must include widget layout',
    },
    {
      snippet: 'copyDataExportToClipboard',
      message: 'export module must provide clipboard fallback',
    },
    {
      snippet: 'parseDataImport',
      message: 'export module must validate imported JSON before writing',
    },
    {
      snippet: 'previewDataImport',
      message: 'export module must validate and summarize JSON before import writes',
    },
    {
      snippet: 'summarizeDataImport',
      message: 'export module must derive import preview from normalized data',
    },
    {
      snippet: 'fingerprint: data.fingerprint',
      message: 'import preview and summary must preserve the selected JSON fingerprint',
    },
    {
      snippet: 'fingerprint: existingFingerprint ?? exportFingerprint(normalized)',
      message: 'old exports without a fingerprint must get a normalized fallback fingerprint',
    },
    {
      snippet: 'importDataExport',
      message: 'export module must provide restore/import path',
    },
    {
      snippet: 'mergeById(',
      message: 'import must merge daily records by id instead of replacing whole days blindly',
    },
    {
      snippet: 'saveDay(day, mergedFoodEntries)',
      message: 'import must persist merged food entries through storage adapter',
    },
    {
      snippet: 'saveWaterDay(day, mergedWater)',
      message: 'import must persist merged water entries through storage adapter',
    },
    {
      snippet: 'noteStorage.saveDay(day, mergedNotes)',
      message: 'import must persist merged notes through note storage adapter',
    },
    {
      snippet: 'saveDayMeta(day, next)',
      message: 'import must persist day metadata through storage adapter',
    },
    {
      snippet: 'saveColors(settings.noteColors)',
      message: 'import must restore note palette settings',
    },
    {
      snippet: 'saveWaterGoalMl(settings.water.goalMl)',
      message: 'import must restore water settings',
    },
    {
      snippet: 'replaceAll(settings.widgets)',
      message: 'import must restore widget layout through widget store action',
    },
  ])
  expectAbsent('src/lib/dataExport.ts', raw, [
    {
      snippet: 'telegramUserId',
      message: 'export must not include raw Telegram user id',
    },
    {
      snippet: '.deleteFood(',
      message: 'import/export module must not delete user foods',
    },
    {
      snippet: '.deleteMeal(',
      message: 'import/export module must not delete user meals',
    },
    {
      snippet: 'deleteItem(',
      message: 'import/export module must not delete storage keys',
    },
  ])
}

async function checkBackupStatus() {
  const raw = await read('src/lib/dataBackupStatus.ts')
  expectIncludes('src/lib/dataBackupStatus.ts', raw, [
    {
      snippet: 'telegramUserId()',
      message: 'backup status key must be isolated per Telegram user',
    },
    {
      snippet: 'zhvusha:u${uid}:data_backup_status',
      message: 'backup status must use the per-user localStorage prefix',
    },
    {
      snippet: 'zhvusha:anon:data_backup_status',
      message: 'backup status must have an anonymous browser fallback',
    },
    {
      snippet: 'loadDataBackupStatus',
      message: 'backup status must be readable by settings UI',
    },
    {
      snippet: 'rememberDataExport',
      message: 'successful JSON export must be recorded locally',
    },
    {
      snippet: 'rememberDataImport',
      message: 'successful JSON import must be recorded locally',
    },
    {
      snippet: 'window.localStorage.setItem(dataBackupStatusKey(), JSON.stringify(status))',
      message: 'backup status must persist as local per-user metadata',
    },
    {
      snippet: 'lastExportedAt',
      message: 'backup status must record the latest export time',
    },
    {
      snippet: 'lastExportFingerprint',
      message: 'backup status must record the latest export fingerprint',
    },
    {
      snippet: 'lastImportedAt',
      message: 'backup status must record the latest import time',
    },
    {
      snippet: 'lastImportFingerprint',
      message: 'backup status must record the latest imported file fingerprint',
    },
    {
      snippet: 'summary.fingerprint',
      message: 'backup import status must come from the imported JSON fingerprint',
    },
    {
      snippet: 'normalizeFingerprint',
      message: 'backup status must tolerate older local status records without fingerprints',
    },
  ])
}

async function checkDataIntegrity() {
  const raw = await read('src/lib/dataIntegrity.ts')
  expectIncludes('src/lib/dataIntegrity.ts', raw, [
    {
      snippet: 'runDataIntegrityCheck',
      message: 'data integrity module must expose a local check runner',
    },
    {
      snippet: 'DataIntegrityGroup',
      message: 'data integrity report must expose grouped diagnostics',
    },
    {
      snippet: 'GROUP_DEFINITIONS',
      message: 'data integrity check must keep stable human-readable issue groups',
    },
    {
      snippet: 'groupIssues(issues)',
      message: 'data integrity check must summarize issue groups in the report',
    },
    {
      snippet: 'nextStep',
      message: 'data integrity groups must include a next manual step',
    },
    {
      snippet: 'pickCalorieStorage()',
      message: 'data integrity check must read through the calorie storage adapter',
    },
    {
      snippet: 'storage.listDaysWithEntries()',
      message: 'data integrity check must scan entry days',
    },
    {
      snippet: 'storage.loadDays(sortedDays)',
      message: 'data integrity check must load diary entries for scanned days',
    },
    {
      snippet: 'storage.listFoods()',
      message: 'data integrity check must compare entries against the food library',
    },
    {
      snippet: 'storage.listMeals()',
      message: 'data integrity check must scan meal templates',
    },
    {
      snippet: 'entry-missing-food',
      message: 'data integrity check must detect missing food references in diary entries',
    },
    {
      snippet: 'entry-missing-serving',
      message: 'data integrity check must detect missing serving references in diary entries',
    },
    {
      snippet: 'meal-missing-food',
      message: 'data integrity check must detect missing food references in meals',
    },
    {
      snippet: 'meal-missing-serving',
      message: 'data integrity check must detect missing serving references in meals',
    },
  ])
  expectAbsent('src/lib/dataIntegrity.ts', raw, [
    {
      snippet: 'save',
      message: 'data integrity check must remain read-only',
    },
    {
      snippet: 'delete',
      message: 'data integrity check must not delete data',
    },
    {
      snippet: 'fetch(',
      message: 'data integrity check must not call external APIs',
    },
  ])
}

async function checkSettingsUi() {
  const raw = await read('src/components/SettingsSheet.tsx')
  expectIncludes('src/components/SettingsSheet.tsx', raw, [
    {
      snippet: "export type SettingsTab = 'color' | 'goal' | 'data'",
      message: 'settings must expose a data tab',
    },
    {
      snippet: "{ id: 'data', label: 'данные' }",
      message: 'data tab label must be visible in Russian',
    },
    {
      snippet: '<DataTab />',
      message: 'settings must render the data tab',
    },
    {
      snippet: 'buildDataExport',
      message: 'data tab must build export from storage',
    },
    {
      snippet: 'downloadDataExport',
      message: 'data tab must attempt JSON file download',
    },
    {
      snippet: 'copyDataExportToClipboard',
      message: 'data tab must attempt clipboard fallback',
    },
    {
      snippet: 'loadDataBackupStatus',
      message: 'data tab must show remembered backup status',
    },
    {
      snippet: 'rememberDataExport(next)',
      message: 'data tab must update backup status after successful export',
    },
    {
      snippet: 'rememberDataImport(summary)',
      message: 'data tab must update backup status after successful import',
    },
    {
      snippet: 'previewDataImport(text)',
      message: 'data tab must validate JSON before applying import',
    },
    {
      snippet: 'JSON проверен',
      message: 'data tab must show a verified import preview before writes',
    },
    {
      snippet: 'importDataExport(pendingImport.json)',
      message: 'data tab must apply import only from confirmed preview state',
    },
    {
      snippet: 'применить импорт',
      message: 'data tab must require a second action before writing imported data',
    },
    {
      snippet: 'Резервная копия',
      message: 'data tab must show backup status in Russian',
    },
    {
      snippet: 'последний экспорт',
      message: 'data tab must show latest export timestamp',
    },
    {
      snippet: 'label="код"',
      message: 'data tab must show export/import verification codes beside JSON metrics',
    },
    {
      snippet: 'код ${preview.fingerprint}',
      message: 'import preview status line must include the selected JSON verification code',
    },
    {
      snippet: 'код копии',
      message: 'backup status must show the latest export verification code in Russian',
    },
    {
      snippet: 'код импорта',
      message: 'backup status must show the latest imported JSON verification code in Russian',
    },
    {
      snippet: 'runDataIntegrityCheck',
      message: 'data tab must expose local data integrity check',
    },
    {
      snippet: 'Целостность',
      message: 'data tab must show integrity check in Russian',
    },
    {
      snippet: 'сломанные ссылки в дневнике',
      message: 'data tab must explain integrity check scope',
    },
    {
      snippet: 'битых ссылок нет',
      message: 'data tab must show a clean integrity result',
    },
    {
      snippet: 'Проверка ничего не меняет сама',
      message: 'data tab must disclose that integrity diagnostics do not auto-modify data',
    },
    {
      snippet: '<IntegrityGroupRow',
      message: 'data tab must show grouped integrity diagnostics before raw examples',
    },
    {
      snippet: 'group.nextStep',
      message: 'data tab must show a concrete next manual step for integrity groups',
    },
    {
      snippet: 'создать JSON',
      message: 'data tab primary action must create JSON',
    },
    {
      snippet: 'importDataExport',
      message: 'data tab must restore JSON exports',
    },
    {
      snippet: 'выбрать JSON',
      message: 'data tab must expose a Russian JSON selection action',
    },
    {
      snippet: 'accept="application/json,.json"',
      message: 'data tab file picker must be scoped to JSON files',
    },
  ])

  const widgets = await read('src/store/widgets.ts')
  expectIncludes('src/store/widgets.ts', widgets, [
    {
      snippet: 'replaceAll: (widgets: WidgetInstance[]) => void',
      message: 'widget store must expose a persisted replace action for import',
    },
    {
      snippet: 'saveWidgets(next)',
      message: 'replaceAll must persist imported widget layout',
    },
  ])
}

async function checkDocs() {
  const readme = await read('README.md')
  expectIncludes('README.md', readme, [
    {
      snippet: 'pnpm data-export:check',
      message: 'README command list must mention data export guard',
    },
    {
      snippet: 'Экспорт данных',
      message: 'README must document the data export surface',
    },
    {
      snippet: 'Восстановление из JSON',
      message: 'README must document the restore/import surface',
    },
    {
      snippet: 'сначала проверяет файл',
      message: 'README must document two-step import preview',
    },
    {
      snippet: 'Целостность данных',
      message: 'README must document local integrity check',
    },
    {
      snippet: 'последний экспорт',
      message: 'README must document backup freshness status',
    },
    {
      snippet: 'fingerprint',
      message: 'README must document JSON export fingerprints',
    },
    {
      snippet: 'код копии',
      message: 'README must document human-visible backup verification codes',
    },
  ])

  const excellence = await read('docs/competitive-excellence.md')
  expectIncludes('docs/competitive-excellence.md', excellence, [
    {
      snippet: 'Экспорт данных',
      message: 'competitive backlog must mention data export',
    },
    {
      snippet: 'pnpm data-export:check',
      message: 'competitive backlog must mention the data export guard',
    },
    {
      snippet: 'Восстановление из JSON',
      message: 'competitive backlog must mention data restore',
    },
    {
      snippet: 'превью состава',
      message: 'competitive backlog must mention import preview before writes',
    },
    {
      snippet: 'Целостность данных',
      message: 'competitive backlog must mention local integrity check',
    },
    {
      snippet: 'последний экспорт',
      message: 'competitive backlog must mention backup freshness status',
    },
    {
      snippet: 'fingerprint',
      message: 'competitive backlog must mention JSON export fingerprints',
    },
    {
      snippet: 'код копии',
      message: 'competitive backlog must mention visible backup verification codes',
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

function count(raw, snippet) {
  return raw.split(snippet).length - 1
}
