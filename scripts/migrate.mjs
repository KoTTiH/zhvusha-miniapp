import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

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

await loadEnvLocal()

const url = process.env.DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is not set. Put it into .env.local or export it in shell.')
  process.exit(1)
}

const migrationsDir = resolve(process.cwd(), 'db/migrations')
const migrationFiles = (await readdir(migrationsDir))
  .filter((file) => /^\d+_.+\.sql$/.test(file))
  .sort()
const client = new pg.Client({ connectionString: url })

try {
  await client.connect()
  for (const file of migrationFiles) {
    const sql = await readFile(resolve(migrationsDir, file), 'utf8')
    await client.query(sql)
    console.log(`migration applied: db/migrations/${file}`)
  }
} finally {
  await client.end().catch(() => {})
}
