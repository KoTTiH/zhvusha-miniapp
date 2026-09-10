import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import ts from 'typescript'

const ROOTS = ['src']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const ESTIMATE_SOURCES = new Set(['ai', 'barcode', 'library'])
const REQUIRED_ESTIMATE_FIELDS = ['confidence', 'portionBasis']
const SOURCE_LINE_HELPERS = [
  'foodSourceLine(',
  'quickAddSourceLine(',
  'estimateShortLine(',
  'estimateDisclosure(',
  'estimateSourceLabel(',
  'FoodDraftAiCard',
  'foodItemBasisText(',
  'foodItemBrandDataText(',
]
const SOURCE_LINE_CONTRACTS = [
  {
    file: 'src/components/AddEntrySheet.tsx',
    includes: ['foodSourceLine(', 'quickAddSourceLine('],
    message: 'food/quickAdd shortcuts must show source-line',
  },
  {
    file: 'src/components/CaloriesSection.tsx',
    includes: ['estimateShortLine(', 'EstimateDetails'],
    message: 'calorie log rows must expose estimate details',
  },
  {
    file: 'src/components/DayVoicePanel.tsx',
    includes: ['FoodDraftAiCard'],
    message: 'day voice food rows must reuse AI draft disclosure card',
  },
  {
    file: 'src/components/FoodDraftControls.tsx',
    includes: ['foodItemBasisText(', 'foodItemBrandDataText(', 'confidence'],
    message: 'AI draft controls must show confidence, portion basis and branded product data status',
  },
  {
    file: 'src/components/FoodEditorScreen.tsx',
    includes: ['estimateDisclosure('],
    message: 'food editor must show source-line disclosure',
  },
  {
    file: 'src/components/MealEditorScreen.tsx',
    includes: ['foodSourceLine('],
    message: 'meal food picker and rows must show source-line',
  },
  {
    file: 'src/components/ScanResultSheet.tsx',
    includes: ['estimateDisclosure('],
    message: 'scan result must show source-line disclosure',
  },
]

const root = process.cwd()
const errors = []

await checkStaticContracts()

const files = []
for (const dir of ROOTS) {
  await collectFiles(resolve(root, dir), files)
}

for (const file of files) {
  const raw = await readFile(file, 'utf8')
  const sourceFile = ts.createSourceFile(
    file,
    raw,
    ts.ScriptTarget.Latest,
    true,
    extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  checkSourceLineHeuristic(raw, file)
  scanSourceFile(sourceFile, file)
}

if (errors.length > 0) {
  console.error(`nutrition disclosure check failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`nutrition disclosure ok: ${files.length} files`)

async function checkStaticContracts() {
  await expectFile('src/lib/ai.ts', [
    {
      includes: 'portionBasis: NutritionPortionBasis',
      message: 'FoodItem.portionBasis must stay required on the client',
    },
    {
      includes: 'brandDataStatus: BrandDataStatus',
      message: 'FoodItem.brandDataStatus must stay required on the client',
    },
    {
      excludes: 'portionBasis?: NutritionPortionBasis',
      message: 'FoodItem.portionBasis must not become optional on the client',
    },
    {
      excludes: 'brandDataStatus?: BrandDataStatus',
      message: 'FoodItem.brandDataStatus must not become optional on the client',
    },
  ])

  for (const file of ['api/parse-food.ts', 'api/parse-day.ts']) {
    await expectFile(file, [
      {
        includes: 'portionBasis: portionBasis(r.portionBasis)',
        message: `${file} parser must normalize missing/invalid portionBasis to unknown`,
      },
      {
        includes: 'brandDataStatus: brandDataStatus(r.brandDataStatus)',
        message: `${file} parser must normalize missing/invalid brandDataStatus to not_provided`,
      },
    ])
    await expectRequiredBlock(file, ['confidence', 'portionBasis', 'brandDataStatus'])
  }
  await expectFile('src/lib/calorieStorage.ts', [
    {
      includes: 'BRAND_DATA_STATUS_SET',
      message: 'stored NutritionEstimate must preserve branded product data status',
    },
  ])
  await checkSourceLineContracts()
}

async function expectFile(file, checks) {
  const raw = await readFile(resolve(root, file), 'utf8')
  for (const check of checks) {
    if (check.includes && !raw.includes(check.includes)) {
      errors.push(`${file}: ${check.message}`)
    }
    if (check.excludes && raw.includes(check.excludes)) {
      errors.push(`${file}: ${check.message}`)
    }
  }
}

async function expectRequiredBlock(file, fields) {
  const raw = await readFile(resolve(root, file), 'utf8')
  const blocks = [...raw.matchAll(/required:\s*\[([\s\S]*?)\]/g)].map((match) => match[1])
  const hasBlock = blocks.some((block) => fields.every((field) => block.includes(`'${field}'`)))
  if (!hasBlock) {
    errors.push(`${file}: schema required block must include ${fields.join(', ')}`)
  }
}

async function checkSourceLineContracts() {
  for (const contract of SOURCE_LINE_CONTRACTS) {
    const raw = await readFile(resolve(root, contract.file), 'utf8')
    const missing = contract.includes.filter((snippet) => !raw.includes(snippet))
    if (missing.length > 0) {
      errors.push(`${contract.file}: ${contract.message}; missing ${missing.join(', ')}`)
    }
  }
}

function checkSourceLineHeuristic(raw, file) {
  const rel = relative(root, file)
  if (!rel.startsWith('src/components/') || !rel.endsWith('.tsx')) return
  if (!raw.includes('<') || !raw.includes('return')) return
  if (!foodDisplayLikely(raw)) return
  if (SOURCE_LINE_HELPERS.some((snippet) => raw.includes(snippet))) return
  errors.push(
    `${rel}: possible food/quickAdd UI shows name+kcal without source-line helper`,
  )
}

function foodDisplayLikely(raw) {
  const mentionsFoodShape = /\bFood\b/.test(raw) ||
    /\bQuickAddData\b/.test(raw) ||
    /\bResolvedEntry\b/.test(raw) ||
    raw.includes('quickAdd') ||
    raw.includes('serving')
  if (!mentionsFoodShape) return false
  const mentionsName = raw.includes('.name') || raw.includes('{name}')
  const mentionsKcal = raw.includes('kcal') || raw.includes('Калории')
  return mentionsName && mentionsKcal
}

function scanSourceFile(sourceFile, file) {
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      checkEstimateObject(node, sourceFile, file)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
}

function checkEstimateObject(node, sourceFile, file) {
  const source = sourceLiteral(node)
  if (!source || !ESTIMATE_SOURCES.has(source)) return

  const missing = REQUIRED_ESTIMATE_FIELDS.filter((field) => !hasDirectProperty(node, field))
  if (missing.length === 0) return

  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
  errors.push(
    `${relative(root, file)}:${pos.line + 1} estimate source "${source}" без ${missing.join(', ')}`,
  )
}

function sourceLiteral(node) {
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    if (propertyName(property.name) !== 'source') continue
    const value = unwrapExpression(property.initializer)
    if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text
  }
  return null
}

function hasDirectProperty(node, name) {
  return node.properties.some((property) => (
    ts.isPropertyAssignment(property) &&
    propertyName(property.name) === name
  ))
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text
  }
  return null
}

function unwrapExpression(expr) {
  let current = expr
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression
  }
  return current
}

async function collectFiles(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue

    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(path, out)
      continue
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      out.push(path)
    }
  }
}
