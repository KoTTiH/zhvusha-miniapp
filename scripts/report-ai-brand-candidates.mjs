import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import pg from 'pg'

const DEFAULT_DAYS = 30
const DEFAULT_ROW_LIMIT = 1000
const DEFAULT_REPORT_LIMIT = 40
const DEFAULT_MIN_COUNT = 1
const CONFIDENCE_RANK = { high: 3, medium: 2, low: 1 }

const KNOWN_BRANDS = [
  ['вкусвилл', 'ВкусВилл'],
  ['магнит', 'Магнит'],
  ['пятёрочка', 'Пятёрочка'],
  ['пятерочка', 'Пятёрочка'],
  ['перекрёсток', 'Перекрёсток'],
  ['перекресток', 'Перекрёсток'],
  ['лента', 'Лента'],
  ['ашан', 'Ашан'],
  ['самокат', 'Самокат'],
  ['яндекс лавка', 'Яндекс Лавка'],
  ['яндекс.лавка', 'Яндекс Лавка'],
  ['дикси', 'Дикси'],
  ['окей', 'Окей'],
  ['мираторг', 'Мираторг'],
  ['простоквашино', 'Простоквашино'],
  ['актимель', 'Актимель'],
  ['danone', 'Danone'],
  ['epica', 'Epica'],
  ['bio balance', 'Bio Balance'],
  ['alpro', 'Alpro'],
  ['nemoloko', 'Nemoloko'],
  ['савушкин', 'Савушкин'],
  ['сыробогатов', 'Сыробогатов'],
  ['черкизово', 'Черкизово'],
  ['индилайт', 'Индилайт'],
  ['агрокомплекс', 'Агрокомплекс'],
]

const GENERIC_WORDS = new Set([
  'ai',
  'без',
  'белки',
  'бренд',
  'батончик',
  'булочка',
  'бургер',
  'вода',
  'гречка',
  'греческий',
  'грудка',
  'еда',
  'завтрак',
  'йогурт',
  'калории',
  'каша',
  'кефир',
  'кофе',
  'котлета',
  'курица',
  'куриная',
  'молоко',
  'обед',
  'овсянка',
  'паста',
  'пицца',
  'протеин',
  'рис',
  'роллы',
  'салат',
  'соус',
  'сыр',
  'творог',
  'ужин',
  'филе',
  'хлеб',
  'чай',
  'яйца',
])

const args = parseArgs(process.argv.slice(2))
const rows = args.input
  ? await loadRowsFromFile(args.input)
  : await loadRowsFromDb(args)

const report = buildReport(rows, args)
const rendered = args.json ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report)

if (args.out) {
  await writeFile(resolve(process.cwd(), args.out), rendered)
  console.log('brand candidate report written: %s', args.out)
} else {
  process.stdout.write(rendered)
}

function parseArgs(argv) {
  const out = {
    input: '',
    out: '',
    days: DEFAULT_DAYS,
    rowLimit: DEFAULT_ROW_LIMIT,
    limit: DEFAULT_REPORT_LIMIT,
    minCount: DEFAULT_MIN_COUNT,
    includeExamples: false,
    includeLowConfidence: false,
    json: false,
    help: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') continue
    else if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--input') out.input = valueAfter(argv, ++i, arg)
    else if (arg === '--out') out.out = valueAfter(argv, ++i, arg)
    else if (arg === '--days') out.days = positiveInt(valueAfter(argv, ++i, arg), arg)
    else if (arg === '--row-limit') out.rowLimit = positiveInt(valueAfter(argv, ++i, arg), arg)
    else if (arg === '--limit') out.limit = positiveInt(valueAfter(argv, ++i, arg), arg)
    else if (arg === '--min-count') out.minCount = positiveInt(valueAfter(argv, ++i, arg), arg)
    else if (arg === '--include-examples') out.includeExamples = true
    else if (arg === '--include-low-confidence') out.includeLowConfidence = true
    else if (arg === '--json') out.json = true
    else throw new Error(`unknown arg: ${arg}`)
  }
  if (out.help) {
    usage()
    process.exit(0)
  }
  return out
}

async function loadRowsFromDb(options) {
  await loadEnvLocal()
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set. Use --input <json> or put DATABASE_URL into .env.local.')
    process.exit(2)
  }

  const client = new pg.Client({ connectionString: url })
  try {
    await client.connect()
    const result = await client.query(
      `SELECT id,
              input_type AS "inputType",
              raw_input_text AS "rawInputText",
              result_json AS "resultJson",
              created_at AS "createdAt"
         FROM ai_analyses
        WHERE status = 'success'
          AND prompt_version LIKE 'food-%'
          AND created_at >= now() - ($1::int * interval '1 day')
        ORDER BY created_at DESC
        LIMIT $2`,
      [options.days, options.rowLimit],
    )
    return result.rows
  } finally {
    await client.end().catch(() => {})
  }
}

async function loadRowsFromFile(file) {
  const parsed = JSON.parse(await readFile(resolve(process.cwd(), file), 'utf8'))
  if (Array.isArray(parsed)) return parsed
  if (Array.isArray(parsed.rows)) return parsed.rows
  if (Array.isArray(parsed.analyses)) return parsed.analyses
  throw new Error('--input must be an array or object with rows/analyses array')
}

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

function buildReport(rows, options) {
  const map = new Map()
  for (const row of rows) {
    const normalized = normalizeRow(row)
    const texts = [
      { source: 'input', text: normalized.rawInputText },
      ...foodItems(normalized.resultJson).map((item) => ({ source: 'item', text: item.name })),
    ]
    for (const entry of texts) {
      for (const candidate of extractCandidates(entry.text)) {
        addCandidate(map, candidate, normalized, entry.source, entry.text, options)
      }
    }
  }

  const candidates = Array.from(map.values())
    .map((item) => finalizeCandidate(item, options))
    .filter((item) => item.count >= options.minCount)
    .filter((item) => options.includeLowConfidence || item.confidence !== 'low')
    .sort(compareCandidates)
    .slice(0, options.limit)

  return {
    generatedAt: new Date().toISOString(),
    source: options.input ? { type: 'json', file: options.input } : {
      type: 'database',
      table: 'ai_analyses',
      promptVersion: 'food-%',
      days: options.days,
      rowLimit: options.rowLimit,
    },
    rowsRead: rows.length,
    minCount: options.minCount,
    includeExamples: options.includeExamples,
    includeLowConfidence: options.includeLowConfidence,
    candidates,
  }
}

function normalizeRow(row) {
  const resultJson = row.resultJson ?? row.result_json ?? row.result ?? null
  return {
    id: row.id,
    inputType: stringOr(row.inputType ?? row.input_type, 'unknown'),
    rawInputText: stringOr(row.rawInputText ?? row.raw_input_text, ''),
    resultJson: typeof resultJson === 'string' ? parseJson(resultJson) : resultJson,
    createdAt: stringOr(row.createdAt ?? row.created_at, ''),
  }
}

function foodItems(resultJson) {
  if (!resultJson || typeof resultJson !== 'object') return []
  const items = Array.isArray(resultJson.items)
    ? resultJson.items
    : Array.isArray(resultJson.foods)
      ? resultJson.foods
      : []
  return items
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({ name: stringOr(item.name, '') }))
    .filter((item) => item.name)
}

function extractCandidates(text) {
  const source = stringOr(text, '')
  if (!source.trim()) return []
  const out = new Map()
  addKnownBrandMatches(out, source)
  addRegexMatches(out, source, /[«"']([^»"']{2,48})[»"']/gu, 'quoted')
  addRegexMatches(out, source, /\b([A-Za-z][A-Za-z0-9&.-]{2,}(?:\s+[A-Za-z][A-Za-z0-9&.-]{2,}){0,2})\b/gu, 'latin')
  addRegexMatches(
    out,
    source,
    /(?:^|[^\p{L}])([A-ZА-ЯЁ][\p{L}0-9&.-]{2,}(?:\s+[A-ZА-ЯЁ][\p{L}0-9&.-]{2,}){0,2})/gu,
    'title-case',
  )
  return Array.from(out.values()).filter((item) => isUsefulCandidate(item.name))
}

function addKnownBrandMatches(out, text) {
  const lower = normalizeText(text)
  for (const [needle, label] of KNOWN_BRANDS) {
    if (lower.includes(needle)) addLocalCandidate(out, label, 'known-list')
  }
}

function addRegexMatches(out, text, regex, reason) {
  for (const match of text.matchAll(regex)) {
    addLocalCandidate(out, cleanName(match[1]), reason)
  }
}

function addLocalCandidate(out, name, reason) {
  if (!name) return
  const key = normalizeKey(name)
  const current = out.get(key)
  if (current) {
    current.reasons.add(reason)
    return
  }
  out.set(key, { key, name, reasons: new Set([reason]) })
}

function isUsefulCandidate(name) {
  const cleaned = cleanName(name)
  if (cleaned.length < 3 || cleaned.length > 48) return false
  if (/^\d+$/.test(cleaned)) return false
  const tokens = cleaned.split(/\s+/).map((token) => normalizeKey(token)).filter(Boolean)
  if (tokens.length === 0 || tokens.length > 4) return false
  if (tokens.length > 1 && GENERIC_WORDS.has(tokens[0])) return false
  return tokens.some((token) => !GENERIC_WORDS.has(token))
}

function addCandidate(map, candidate, row, source, evidence, options) {
  const current = map.get(candidate.key) ?? {
    name: candidate.name,
    key: candidate.key,
    count: 0,
    sources: new Map(),
    inputTypes: new Set(),
    reasons: new Set(),
    examples: [],
  }
  current.count += 1
  current.sources.set(source, (current.sources.get(source) ?? 0) + 1)
  current.inputTypes.add(row.inputType)
  for (const reason of candidate.reasons) current.reasons.add(reason)
  if (options.includeExamples && current.examples.length < 3) {
    current.examples.push({
      source,
      inputType: row.inputType,
      createdAt: row.createdAt,
      text: excerpt(evidence),
    })
  }
  map.set(candidate.key, current)
}

function finalizeCandidate(item, options) {
  const out = {
    name: item.name,
    count: item.count,
    confidence: candidateConfidence(item.reasons),
    reasons: Array.from(item.reasons).sort(),
    sources: Object.fromEntries(Array.from(item.sources.entries()).sort()),
    inputTypes: Array.from(item.inputTypes).sort(),
  }
  if (options.includeExamples) out.examples = item.examples
  return out
}

function candidateConfidence(reasons) {
  if (reasons.has('known-list') || reasons.has('quoted')) return 'high'
  if (reasons.has('latin')) return 'medium'
  return 'low'
}

function compareCandidates(a, b) {
  if (a.count !== b.count) return b.count - a.count
  if (CONFIDENCE_RANK[a.confidence] !== CONFIDENCE_RANK[b.confidence]) {
    return CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence]
  }
  return a.name.localeCompare(b.name, 'ru')
}

function renderMarkdown(report) {
  const lines = [
    '# AI brand candidates',
    '',
    `Generated: ${report.generatedAt}`,
    `Rows read: ${report.rowsRead}`,
    `Source: ${report.source.type}${report.source.type === 'database' ? `, ${report.source.days}d, prompt ${report.source.promptVersion}` : `, ${report.source.file}`}`,
    `Low-confidence candidates: ${report.includeLowConfidence ? 'included' : 'hidden'}`,
    '',
    report.includeExamples
      ? 'Этот отчёт агрегирует кандидатов из `ai_analyses`, не выводит user_id, но содержит короткие raw-примеры. Не коммить без review.'
      : 'Этот отчёт агрегирует кандидатов из `ai_analyses`, не выводит user_id и по умолчанию не содержит raw-примеров. Это вход для будущего whitelist, не автоматическое разрешение web search.',
    '',
  ]

  if (report.candidates.length === 0) {
    lines.push('Кандидатов не найдено.', '')
    return `${lines.join('\n')}\n`
  }

  for (const [index, item] of report.candidates.entries()) {
    lines.push(
      `## ${index + 1}. ${item.name}`,
      '',
      `- count: ${item.count}`,
      `- confidence: ${item.confidence}`,
      `- reasons: ${item.reasons.join(', ')}`,
      `- sources: ${formatMap(item.sources)}`,
      `- inputTypes: ${item.inputTypes.join(', ')}`,
    )
    if (report.includeExamples) {
      lines.push('- examples:')
      for (const example of item.examples) {
        lines.push(`  - ${example.source}/${example.inputType}: ${example.text}`)
      }
    }
    lines.push('')
  }
  return `${lines.join('\n')}\n`
}

function cleanName(value) {
  return stringOr(value, '')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[,:;!?]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeKey(value) {
  return normalizeText(value).replace(/ё/g, 'е')
}

function normalizeText(value) {
  return cleanName(value).toLowerCase()
}

function excerpt(value) {
  const text = cleanName(value)
  return text.length > 120 ? `${text.slice(0, 117)}...` : text
}

function formatMap(value) {
  return Object.entries(value)
    .map(([key, count]) => `${key}:${count}`)
    .join(', ')
}

function parseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function stringOr(value, fallback) {
  return typeof value === 'string' ? value : fallback
}

function valueAfter(argv, index, flag) {
  const value = argv[index]
  if (!value || value.startsWith('--')) throw new Error(`${flag} needs a value`)
  return value
}

function positiveInt(value, flag) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive integer`)
  return parsed
}

function usage() {
  console.error('usage:')
  console.error('  pnpm ai:brand-report -- --days 30 --limit 40')
  console.error('  pnpm ai:brand-report -- --input ai/qa/analysis-export.json --json')
  console.error('  pnpm ai:brand-report -- --input ai/qa/analysis-export.json --include-examples')
  console.error('  pnpm ai:brand-report -- --input ai/qa/analysis-export.json --include-low-confidence')
  console.error('  pnpm ai:brand-report -- --out ai/qa/brand-candidates.md')
}
