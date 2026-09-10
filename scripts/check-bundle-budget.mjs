import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const DIST_DIR = 'dist'
const ASSETS_DIR = 'dist/assets'
const INDEX_HTML = 'dist/index.html'

const ENTRY_BUDGET_BYTES = 280 * 1024
const INITIAL_JS_BUDGET_BYTES = 430 * 1024
const MAX_JS_CHUNK_BYTES = 500 * 1024

const FORBIDDEN_INITIAL_CHUNKS = [
  'AddEntrySheet',
  'SettingsSheet',
  'ZHMap',
  'BarcodeScanner',
  'voice',
  'openFoodFacts',
  'esm-',
]

const root = process.cwd()
const errors = []

const html = await readRequired(INDEX_HTML)
const assets = await listAssetSizes()
const initialJs = extractInitialJs(html)
const entry = initialJs.find((file) => basename(file).startsWith('index-'))

if (!entry) {
  fail(INDEX_HTML, 'production HTML must include one entry index-*.js module')
} else {
  const size = assetSize(entry)
  if (size > ENTRY_BUDGET_BYTES) {
    fail(
      entry,
      `entry chunk is ${formatBytes(size)}, budget is ${formatBytes(ENTRY_BUDGET_BYTES)}`,
    )
  }
}

const missingInitial = initialJs.filter((file) => !assets.has(normalizeAsset(file)))
for (const file of missingInitial) {
  fail(INDEX_HTML, `initial JS asset is referenced but missing from dist/assets: ${file}`)
}

const initialBytes = initialJs.reduce((sum, file) => sum + assetSize(file), 0)
if (initialBytes > INITIAL_JS_BUDGET_BYTES) {
  fail(
    INDEX_HTML,
    `initial JS is ${formatBytes(initialBytes)}, budget is ${formatBytes(INITIAL_JS_BUDGET_BYTES)}`,
  )
}

for (const file of initialJs) {
  const name = basename(file)
  for (const forbidden of FORBIDDEN_INITIAL_CHUNKS) {
    if (name.includes(forbidden)) {
      fail(INDEX_HTML, `${name} must stay lazy and must not be modulepreloaded`)
    }
  }
}

for (const [file, size] of assets) {
  if (!file.endsWith('.js')) continue
  if (size > MAX_JS_CHUNK_BYTES) {
    fail(
      join(ASSETS_DIR, file),
      `JS chunk is ${formatBytes(size)}, budget is ${formatBytes(MAX_JS_CHUNK_BYTES)}`,
    )
  }
}

if (errors.length > 0) {
  console.error(`bundle budget failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error.file}: ${error.message}`)
  process.exit(1)
}

console.log(
  'bundle budget ok: entry %s, initial JS %s, max chunk <= %s',
  entry ? formatBytes(assetSize(entry)) : 'n/a',
  formatBytes(initialBytes),
  formatBytes(MAX_JS_CHUNK_BYTES),
)

async function readRequired(file) {
  try {
    return await readFile(resolve(root, file), 'utf8')
  } catch {
    fail(file, `missing ${file}; run pnpm build before pnpm bundle:check`)
    return ''
  }
}

async function listAssetSizes() {
  const out = new Map()
  try {
    const files = await readdir(resolve(root, ASSETS_DIR))
    for (const file of files) {
      const info = await stat(resolve(root, ASSETS_DIR, file))
      if (info.isFile()) out.set(file, info.size)
    }
  } catch {
    fail(DIST_DIR, `missing ${ASSETS_DIR}; run pnpm build before pnpm bundle:check`)
  }
  return out
}

function extractInitialJs(raw) {
  const out = []
  const patterns = [
    /<script[^>]+type="module"[^>]+src="([^"]+\.js)"/g,
    /<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g,
  ]
  for (const pattern of patterns) {
    for (const match of raw.matchAll(pattern)) out.push(match[1])
  }
  return [...new Set(out)]
}

function assetSize(file) {
  return assets.get(normalizeAsset(file)) ?? 0
}

function normalizeAsset(file) {
  return basename(file)
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`
}

function fail(file, message) {
  errors.push({ file, message })
}
