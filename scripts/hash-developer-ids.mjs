import { createHmac, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function loadEnvLocal() {
  const file = resolve(process.cwd(), '.env.local')
  let raw = ''
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key]) continue
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function usage() {
  console.error('usage: node scripts/hash-developer-ids.mjs <telegram_user_id> [telegram_user_id...]')
  console.error('secret: set DEVELOPER_ALLOWLIST_SECRET in .env.local or shell')
}

function parseIds(args) {
  const ids = args.map((arg) => arg.trim()).filter(Boolean)
  if (ids.length === 0) return []
  const invalid = ids.find((id) => !/^\d{1,20}$/.test(id))
  if (invalid) throw new Error(`invalid Telegram user id: ${invalid}`)
  return ids
}

function hashId(id, secret) {
  return createHmac('sha256', secret).update(id).digest('hex')
}

function existingHashes() {
  return (process.env.DEVELOPER_TELEGRAM_USER_ID_HASHES ?? '')
    .split(/[,\s]+/)
    .map((hash) => hash.trim())
    .filter((hash) => /^[a-f0-9]{64}$/i.test(hash))
}

await loadEnvLocal()

let ids
try {
  ids = parseIds(process.argv.slice(2))
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  usage()
  process.exit(1)
}

if (ids.length === 0) {
  usage()
  process.exit(1)
}

const existingSecret = process.env.DEVELOPER_ALLOWLIST_SECRET
const secret = existingSecret || randomBytes(32).toString('base64url')
const hashes = Array.from(new Set([...existingHashes(), ...ids.map((id) => hashId(id, secret))]))

if (!existingSecret) {
  console.log('# Создан новый секрет. Сохрани его в password manager и в Vercel env.')
  console.log(`DEVELOPER_ALLOWLIST_SECRET=${secret}`)
  console.log('')
}

console.log('# В Vercel env добавляй хэши, не сырые Telegram id.')
console.log(`DEVELOPER_TELEGRAM_USER_ID_HASHES=${hashes.join(',')}`)
