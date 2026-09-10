import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const CHECKS = [
  {
    file: 'api/parse-day.ts',
    rules: [
      {
        id: 'prompt-structured-output',
        includes: '"foods":[<еда>],"notes":[<заметки>],"waterMl":<целое>,"lazy":true',
        message: 'parse-day prompt must keep separate foods/notes/water buckets and lazy=true',
      },
      {
        id: 'schema-water-lazy',
        pattern: /waterMl:\s*\{\s*type:\s*'integer'[\s\S]*?lazy:\s*\{\s*type:\s*'boolean'\s*\}/,
        message: 'parse-day response schema must include waterMl and lazy',
      },
      {
        id: 'schema-required',
        includes: "required: ['foods', 'notes', 'waterMl', 'lazy', 'error']",
        message: 'parse-day response schema must require foods, notes, waterMl, lazy and error',
      },
      {
        id: 'lazy-always-true',
        includes: 'lazy всегда true: день записан через AI по общему описанию',
        message: 'parse-day prompt must explain approximate AI day input',
      },
      {
        id: 'record-analysis-water-lazy',
        includes: 'resultJson: { foods, notes, waterMl, lazy: true }',
        message: 'AI audit result must persist waterMl and lazy=true',
      },
      {
        id: 'return-water-lazy',
        includes: 'return { foods, notes, waterMl, lazy: true',
        message: 'parse-day success output must return waterMl and lazy=true',
      },
    ],
  },
  {
    file: 'src/lib/ai.ts',
    rules: [
      {
        id: 'client-type-water-lazy',
        pattern: /export type ParseDayResult[\s\S]*?waterMl:\s*number[\s\S]*?lazy:\s*true/,
        message: 'client ParseDayResult must expose waterMl and lazy=true',
      },
    ],
  },
  {
    file: 'src/components/DayVoicePanel.tsx',
    rules: [
      {
        id: 'loads-existing-state',
        pattern: /loadWaterDay\(today\)[\s\S]*loadDayMeta\(today\)/,
        message: 'day voice save must load water and day metadata before writing',
      },
      {
        id: 'writes-foods-notes-water-lazy',
        pattern: /setDayLazy\(today,\s*true\)[\s\S]*addNote\(today[\s\S]*addQuickEntriesBulk\(today[\s\S]*addWater\(today,\s*waterMl\)/,
        message: 'day voice save must write notes, food, water and lazy day metadata',
      },
      {
        id: 'water-edit-ui',
        includes: '<EditableWaterRow',
        message: 'day voice result must allow user to edit parsed water before saving',
      },
      {
        id: 'memory-disclosure',
        includes: 'AI-черновик',
        message: 'day voice result must show that AI produced a draft',
      },
      {
        id: 'summary-buckets',
        pattern: /SummaryChip[\s\S]*label="еда"[\s\S]*SummaryChip[\s\S]*label="вода"[\s\S]*SummaryChip[\s\S]*label="заметки"/,
        message: 'day voice result must show food, water and notes buckets separately',
      },
    ],
  },
  {
    file: 'src/screens/ZHMap.tsx',
    rules: [
      {
        id: 'loads-water-and-meta',
        pattern: /loadWaterRange\(gridKeys\)[\s\S]*loadDayMetaRange\(gridKeys\)/,
        message: 'calendar must load water and lazy-day metadata for the visible range',
      },
      {
        id: 'lazy-cell-marker',
        includes: 'aria-label="примерный день"',
        message: 'calendar cell must expose an approximate AI-day marker',
      },
      {
        id: 'lazy-summary-disclosure',
        includes: '<InfoPill label="AI" value="примерно" warn />',
        message: 'calendar selected-day summary must disclose approximate AI-day status',
      },
      {
        id: 'water-calendar-signal',
        includes: '<WaterFillBar progress={waterProgress} color={waterColor} />',
        message: 'calendar cells must keep the water progress signal',
      },
    ],
  },
  {
    file: 'src/components/ExpandedDayView.tsx',
    rules: [
      {
        id: 'expanded-lazy-warning',
        includes: 'День записан через AI по общему описанию. Еда, вода и заметки могут быть неточными.',
        message: 'expanded day view must disclose lower precision for approximate AI days',
      },
      {
        id: 'expanded-water-log',
        includes: 'text: `вода · ${e.ml} мл`',
        message: 'expanded day log must include water entries',
      },
    ],
  },
  {
    file: 'src/store/calories.ts',
    rules: [
      {
        id: 'store-add-water',
        includes: 'async addWater(day, ml)',
        message: 'calorie store must keep water writes as a first-class action',
      },
      {
        id: 'store-set-lazy',
        includes: 'async setDayLazy(day, lazy = true)',
        message: 'calorie store must keep lazy day metadata as a first-class action',
      },
    ],
  },
  {
    file: 'src/lib/calorieStorage.ts',
    rules: [
      {
        id: 'storage-water-backend',
        includes: 'saveWaterDay(day: DayKey, water: WaterEntry[]): Promise<void>',
        message: 'storage backend must persist water separately from food entries',
      },
      {
        id: 'storage-day-meta-normalizer',
        includes: 'function parseDayMeta(raw: string, day: DayKey): DayMeta | null',
        message: 'storage backend must normalize day-level lazy metadata',
      },
    ],
  },
  {
    file: 'src/types/calorie.ts',
    rules: [
      {
        id: 'water-entry-type',
        includes: 'export interface WaterEntry',
        message: 'water must remain a typed first-class daily entry',
      },
      {
        id: 'day-meta-type',
        includes: 'export interface DayMeta',
        message: 'lazy status must remain day-level metadata, not derived from totals',
      },
    ],
  },
]

const errors = []
const root = process.cwd()

for (const check of CHECKS) {
  const raw = await readFile(resolve(root, check.file), 'utf8')
  for (const rule of check.rules) {
    if ('includes' in rule && !raw.includes(rule.includes)) {
      fail(check.file, rule)
    }
    if ('pattern' in rule && !rule.pattern.test(raw)) {
      fail(check.file, rule)
    }
  }
}

if (errors.length > 0) {
  console.error(`day voice contract failed: ${errors.length} issue(s)`)
  for (const error of errors) {
    console.error(`- ${error.file} [${error.id}] ${error.message}`)
  }
  process.exit(1)
}

const ruleCount = CHECKS.reduce((sum, check) => sum + check.rules.length, 0)
console.log(`day voice contract ok: ${ruleCount} checks`)

function fail(file, rule) {
  errors.push({ file, id: rule.id, message: rule.message })
}
