import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const errors = []

await checkStorageStatusModule()
await checkSettingsUi()
await checkDocs()

if (errors.length > 0) {
  console.error(`storage status contract failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error.file}: ${error.message}`)
  process.exit(1)
}

console.log('storage status contract ok: current backend, fallback, scope and export boundary visible')

async function checkStorageStatusModule() {
  const raw = await read('src/lib/dataStorageStatus.ts')
  expectIncludes('src/lib/dataStorageStatus.ts', raw, [
    {
      snippet: 'getStorageKind()',
      message: 'storage status must read the same storage kind used by export',
    },
    {
      snippet: "kind === 'postgres'",
      message: 'storage status must explain Postgres mode',
    },
    {
      snippet: "kind === 'telegram'",
      message: 'storage status must explain Telegram fallback mode',
    },
    {
      snippet: 'localStorage этого браузера',
      message: 'storage status must explain browser-local mode',
    },
    {
      snippet: 'Telegram CloudStorage и localStorage остаются резервом',
      message: 'storage status must disclose fallback chain',
    },
    {
      snippet: 'не содержит сырой Telegram id',
      message: 'storage status must disclose export id boundary',
    },
  ])
  expectAbsent('src/lib/dataStorageStatus.ts', raw, [
    {
      snippet: 'telegramUserId',
      message: 'storage status UI must not read or display raw Telegram id',
    },
  ])
}

async function checkSettingsUi() {
  const raw = await read('src/components/SettingsSheet.tsx')
  expectIncludes('src/components/SettingsSheet.tsx', raw, [
    {
      snippet: 'currentDataStorageStatus',
      message: 'settings data tab must read current storage status',
    },
    {
      snippet: '<StorageLocationPanel />',
      message: 'settings data tab must show storage location panel',
    },
    {
      snippet: 'status.rows.map',
      message: 'storage location panel must render all status rows',
    },
    {
      snippet: 'storageLocationColor',
      message: 'storage location rows must have distinct visual tones',
    },
  ])
}

async function checkDocs() {
  const readme = await read('README.md')
  expectIncludes('README.md', readme, [
    {
      snippet: 'pnpm storage-status:check',
      message: 'README command list must mention storage status guard',
    },
    {
      snippet: '### Где хранятся данные',
      message: 'README must document user-facing storage status',
    },
    {
      snippet: 'Postgres / Telegram CloudStorage / localStorage',
      message: 'README must name all storage modes',
    },
    {
      snippet: 'не показывает сырой Telegram id',
      message: 'README must document that storage status does not show raw Telegram id',
    },
  ])

  const excellence = await read('docs/competitive-excellence.md')
  expectIncludes('docs/competitive-excellence.md', excellence, [
    {
      snippet: 'Где хранятся данные',
      message: 'competitive backlog must mention storage location transparency',
    },
    {
      snippet: 'pnpm storage-status:check',
      message: 'competitive backlog must mention storage status guard',
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
