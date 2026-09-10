import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'

const ROOTS = ['src', 'api']
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git'])

const RULES = [
  {
    id: 'xp',
    pattern: /\bXP\b|очки опыта/i,
    message: 'XP/очки опыта противоречат модели без геймифицированной мотивации',
  },
  {
    id: 'streak',
    pattern: /\bstreaks?\b|стрик|серия дней|не сломай|не теряй серию/i,
    message: 'streak/серия дней создаёт давление удержания',
  },
  {
    id: 'quest',
    pattern: /\bquests?\b|квест/i,
    message: 'квестовая механика возвращает удалённую мишень-логику',
  },
  {
    id: 'score',
    pattern: /\blife score\b|\bscore\b|рейтинг|оценка дня|баллы/i,
    message: 'score/рейтинг оценивает пользователя вместо отражения фактов',
  },
  {
    id: 'praise',
    pattern: /молодец|гордимся|отлично справил/i,
    message: 'похвала превращает интерфейс в внешнюю оценку',
  },
  {
    id: 'personal-advice',
    pattern: /тебе нужно|тебе надо|для тебя характерно|обычно ты|мы рекомендуем|рекомендуем|совет дня|может, стоит|попробуй завтра|стоит попробовать/i,
    message: 'персональный совет интерпретирует пользователя вместо показа факта',
  },
]

const root = process.cwd()
const files = []

for (const dir of ROOTS) {
  await collectFiles(resolve(root, dir), files)
}

const errors = []

for (const file of files) {
  const raw = await readFile(file, 'utf8')
  const lines = raw.split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    if (isIgnorableLine(line)) continue
    for (const rule of RULES) {
      if (rule.pattern.test(line)) {
        errors.push({
          file: relative(root, file),
          line: index + 1,
          rule,
          text: line.trim(),
        })
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`philosophy guard failed: ${errors.length} issue(s)`)
  for (const error of errors) {
    console.error(
      `- ${error.file}:${error.line} [${error.rule.id}] ${error.rule.message}: ${error.text}`,
    )
  }
  process.exit(1)
}

console.log(`philosophy guard ok: ${files.length} files`)

async function collectFiles(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) continue

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

function isIgnorableLine(line) {
  const trimmed = line.trim()
  return (
    trimmed.length === 0 ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('*/')
  )
}
