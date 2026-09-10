import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const FILE = 'ai/qa/brand-search-whitelist.json'
const ALLOWED_WEB_SEARCH_REFERENCES = new Set([
  'api/_lib/usage.ts',
])

const errors = []
const raw = await readFile(resolve(process.cwd(), FILE), 'utf8')
const data = JSON.parse(raw)

checkWhitelist(data)
await checkWebSearchReferences()

if (errors.length > 0) {
  console.error(`AI search whitelist check failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(
  'AI search whitelist ok: %d approved brands',
  Array.isArray(data.approvedBrands) ? data.approvedBrands.length : 0,
)

function checkWhitelist(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) {
    fail('root must be an object')
    return
  }
  if (x.version !== 1) fail('version must be 1')
  if (typeof x.updatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x.updatedAt)) {
    fail('updatedAt must be YYYY-MM-DD')
  }
  checkPolicy(x.policy)
  checkStringArray('sourceReports', x.sourceReports, { allowEmpty: true })
  checkApprovedBrands(x.approvedBrands, x.sourceReports)
}

function checkPolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    fail('policy must be an object')
    return
  }
  if (policy.requiresManualApproval !== true) {
    fail('policy.requiresManualApproval must stay true')
  }
  if (policy.requiresBrandReport !== true) {
    fail('policy.requiresBrandReport must stay true')
  }
  for (const key of ['allowedUse', 'forbiddenUse']) {
    if (typeof policy[key] !== 'string' || policy[key].trim().length < 20) {
      fail(`policy.${key} must be a concrete string`)
    }
  }
}

function checkApprovedBrands(list, sourceReports) {
  if (!Array.isArray(list)) {
    fail('approvedBrands must be an array')
    return
  }
  const reportSet = new Set(Array.isArray(sourceReports) ? sourceReports : [])
  if (list.length > 0 && reportSet.size === 0) {
    fail('sourceReports must not be empty when approvedBrands is not empty')
  }
  const names = new Set()
  const normalized = new Set()
  for (const [index, item] of list.entries()) {
    const path = `approvedBrands[${index}]`
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail(`${path} must be an object`)
      continue
    }
    const name = stringProp(item, 'name', path, 2)
    const normalizedName = stringProp(item, 'normalized', path, 2)
    if (name && names.has(name.toLowerCase())) fail(`${path}.name duplicated`)
    if (normalizedName && normalized.has(normalizedName)) fail(`${path}.normalized duplicated`)
    if (name) names.add(name.toLowerCase())
    if (normalizedName) normalized.add(normalizedName)
    if (normalizedName && !/^[a-zа-яё0-9][a-zа-яё0-9 .&-]{1,60}$/iu.test(normalizedName)) {
      fail(`${path}.normalized has invalid characters`)
    }
    checkStringArray(`${path}.domains`, item.domains, { allowEmpty: false, validator: isHost })
    stringProp(item, 'approvedAt', path, 10, /^\d{4}-\d{2}-\d{2}$/)
    const sourceReport = stringProp(item, 'sourceReport', path, 3)
    if (sourceReport && !reportSet.has(sourceReport)) {
      fail(`${path}.sourceReport must be listed in sourceReports`)
    }
    stringProp(item, 'reason', path, 12)
  }
}

async function checkWebSearchReferences(dir = 'api') {
  const entries = await readdir(resolve(process.cwd(), dir), { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const file = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      await checkWebSearchReferences(file)
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue
    if (ALLOWED_WEB_SEARCH_REFERENCES.has(file)) continue
    const source = await readFile(resolve(process.cwd(), file), 'utf8')
    if (/web_search|server_tool_use/.test(source)) {
      fail(`${file}: web search reference must go through an explicitly reviewed whitelist path`)
    }
  }
}

function checkStringArray(path, value, options) {
  if (!Array.isArray(value)) {
    fail(`${path} must be an array`)
    return
  }
  if (!options.allowEmpty && value.length === 0) fail(`${path} must not be empty`)
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() !== item || item.length === 0) {
      fail(`${path} must contain non-empty trimmed strings`)
      continue
    }
    if (options.validator && !options.validator(item)) {
      fail(`${path} has invalid value: ${item}`)
    }
  }
}

function stringProp(item, key, path, minLength, pattern) {
  const value = item[key]
  if (typeof value !== 'string' || value.trim() !== value || value.length < minLength) {
    fail(`${path}.${key} must be a trimmed string with length >= ${minLength}`)
    return ''
  }
  if (pattern && !pattern.test(value)) fail(`${path}.${key} has invalid format`)
  return value
}

function isHost(value) {
  if (value.includes('://') || value.includes('/') || value.includes('*')) return false
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(value)
}

function fail(message) {
  errors.push(message)
}
