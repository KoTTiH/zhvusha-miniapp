import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const WORKFLOW = '.github/workflows/quality.yml'
const HOOK = '.husky/pre-commit'
const PACKAGE = 'package.json'

const REQUIRED_CHECK_CHAIN = [
  'pnpm typecheck',
  'pnpm lint',
  'pnpm barcode:check',
  'pnpm day-voice:check',
  'pnpm philosophy:check',
  'pnpm nutrition:check',
  'pnpm ai:search-whitelist:check',
  'pnpm ai-credit:check',
  'pnpm ai-privacy:check',
  'pnpm assistant:check',
  'pnpm storage-status:check',
  'pnpm app-readiness:check',
  'pnpm quality-map:check',
  'pnpm widgets:check',
  'pnpm data-export:check',
  'pnpm accessibility:check',
]

const REQUIRED_CI_COMMANDS = [
  'pnpm check',
  'pnpm build',
  'pnpm bundle:check',
]

const OPTIONAL_SMOKE_FRAGMENTS = [
  'smart-history-smoke:',
  'data-export-smoke:',
  'accessibility-smoke:',
  'continue-on-error: true',
  'id: chrome',
  'CHROME_BIN: ${{ steps.chrome.outputs.bin }}',
  'pnpm smoke:smart-history',
  'pnpm smoke:data-export',
  'pnpm smoke:accessibility',
]

const REQUIRED_HOOK_COMMANDS = [
  'pnpm exec lint-staged',
  'pnpm typecheck',
  'pnpm barcode:check',
  'pnpm day-voice:check',
  'pnpm philosophy:check',
  'pnpm nutrition:check',
  'pnpm ai:search-whitelist:check',
  'pnpm ai-credit:check',
  'pnpm ai-privacy:check',
  'pnpm assistant:check',
  'pnpm storage-status:check',
  'pnpm app-readiness:check',
  'pnpm quality-map:check',
  'pnpm widgets:check',
  'pnpm data-export:check',
  'pnpm accessibility:check',
]

const root = process.cwd()
const errors = []

const pkgRaw = await readFile(resolve(root, PACKAGE), 'utf8')
const pkg = JSON.parse(pkgRaw)
const scripts = pkg.scripts ?? {}
const checkScript = String(scripts.check ?? '')

for (const command of REQUIRED_CHECK_CHAIN) {
  if (!checkScript.includes(command)) {
    fail(PACKAGE, `scripts.check must include "${command}"`)
  }
}

for (const [scriptName, command] of Object.entries({
  'barcode:check': 'node scripts/check-barcode-normalize.mjs',
  'day-voice:check': 'node scripts/check-day-voice-contract.mjs',
  'philosophy:check': 'node scripts/check-philosophy-guard.mjs',
  'nutrition:check': 'node scripts/check-nutrition-disclosure.mjs',
  'smoke:smart-history': 'node scripts/smoke-smart-history.mjs',
  'smoke:data-export': 'node scripts/smoke-data-export.mjs',
  'smoke:accessibility': 'node scripts/smoke-accessibility.mjs',
  'ai:search-whitelist:check': 'node scripts/check-ai-search-whitelist.mjs',
  'ai-credit:check': 'node scripts/check-ai-credit-contract.mjs',
  'ai-privacy:check': 'node scripts/check-ai-privacy-contract.mjs',
  'assistant:check': 'node scripts/check-assistant-contract.mjs',
  'smoke:assistant': 'node scripts/smoke-assistant.mjs',
  'smoke:assistant-photo': 'node scripts/smoke-assistant-photo.mjs',
  'storage-status:check': 'node scripts/check-storage-status-contract.mjs',
  'app-readiness:check': 'node scripts/check-app-readiness-contract.mjs',
  'quality-map:check': 'node scripts/check-quality-map-contract.mjs',
  'widgets:check': 'node scripts/check-widget-defaults.mjs',
  'data-export:check': 'node scripts/check-data-export-contract.mjs',
  'accessibility:check': 'node scripts/check-accessibility-contract.mjs',
  'bundle:check': 'node scripts/check-bundle-budget.mjs',
  'quality-gate:check': 'node scripts/check-quality-gate-contract.mjs',
})) {
  if (scripts[scriptName] !== command) {
    fail(PACKAGE, `scripts.${scriptName} must be "${command}"`)
  }
}

const workflow = await readFile(resolve(root, WORKFLOW), 'utf8')
for (const fragment of [
  'name: Quality Gates',
  'pull_request:',
  'push:',
  'branches: [main]',
  'permissions:',
  'contents: read',
  'jobs:',
  'check:',
  'timeout-minutes: 10',
  'pnpm install --frozen-lockfile',
  ...REQUIRED_CI_COMMANDS,
]) {
  if (!workflow.includes(fragment)) fail(WORKFLOW, `workflow must include "${fragment}"`)
}
for (const fragment of OPTIONAL_SMOKE_FRAGMENTS) {
  if (!workflow.includes(fragment)) fail(WORKFLOW, `optional smoke job must include "${fragment}"`)
}

const hook = await readFile(resolve(root, HOOK), 'utf8')
for (const command of REQUIRED_HOOK_COMMANDS) {
  if (!lineSet(hook).has(command)) fail(HOOK, `pre-commit must run "${command}"`)
}

if (errors.length > 0) {
  console.error(`quality gate contract failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error.file}: ${error.message}`)
  process.exit(1)
}

console.log(
  'quality gate contract ok: %d check commands, %d ci commands, %d hook commands, optional smoke jobs',
  REQUIRED_CHECK_CHAIN.length,
  REQUIRED_CI_COMMANDS.length,
  REQUIRED_HOOK_COMMANDS.length,
)

function lineSet(raw) {
  return new Set(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )
}

function fail(file, message) {
  errors.push({ file, message })
}
