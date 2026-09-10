import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const errors = []

await checkServerBilling()
await checkClientBilling()
await checkDocs()

if (errors.length > 0) {
  console.error(`AI credit contract failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error.file}: ${error.message}`)
  process.exit(1)
}

console.log('AI credit contract ok: primary debits, free refinements, day voice billing, transcription free, UI policy visible')

async function checkServerBilling() {
  const parseFood = await read('api/parse-food.ts')
  expectIncludes('api/parse-food.ts', parseFood, [
    {
      snippet: "mode?: 'primary' | 'refine'",
      message: 'parse-food input must keep explicit primary/refine billing mode',
    },
    {
      snippet: 'parentAnalysisId?: number | null',
      message: 'parse-food input must keep parentAnalysisId for free refinements',
    },
    {
      snippet: "const billingMode = billing?.mode === 'refine' ? 'refine' : 'primary'",
      message: 'parse-food must default billing to primary',
    },
    {
      snippet: 'const parentAnalysisId = Number(billing?.parentAnalysisId)',
      message: 'parse-food must parse parentAnalysisId server-side',
    },
    {
      snippet: 'await assertCanRefine(userId, parentAnalysisId)',
      message: 'free refinements must verify that parent analysis belongs to the same user',
    },
    {
      snippet: "return { error: 'invalid-refine', balance, ...unlimitedOut }",
      message: 'invalid refinements must fail without falling back to paid primary parsing',
    },
    {
      snippet: "balance = await debit(userId, 1, 'parse-food', { hasImages: images.length > 0 })",
      message: 'primary parse-food must debit exactly 1 AI-credit',
    },
    {
      snippet: "return { error: 'insufficient-tokens', balance: err.balance }",
      message: 'parse-food must expose insufficient balance to the UI',
    },
    {
      snippet: 'Это бесплатное уточнение уже оплаченного AI-кредита',
      message: 'refine prompt must keep the free-refinement contract explicit',
    },
    {
      snippet: "credit(userId, 1, 'refund', { reason: 'parse-food-failed' })",
      message: 'parse-food provider failure must refund a debited credit',
    },
    {
      snippet: "credit(userId, 1, 'refund', { reason: 'parse-food-unusable'",
      message: 'parse-food unusable response must refund a debited credit',
    },
    {
      snippet: "credit(userId, 1, 'refund', { reason: 'parse-food-empty' })",
      message: 'parse-food empty response must refund a debited credit',
    },
    {
      snippet: "parentAnalysisId: billingMode === 'refine' && Number.isInteger(parentAnalysisId)",
      message: 'refine analyses must be linked to the paid parent analysis',
    },
    {
      snippet: 'analysisId = await recordAiAnalysis({',
      message: 'parse-food must record AI analysis for audit and future refinements',
    },
  ])
  expectOrdered('api/parse-food.ts', parseFood, [
    'const billingMode =',
    'if (userId !== null) {',
    "if (billingMode === 'refine') {",
    'await assertCanRefine(userId, parentAnalysisId)',
    "} else {\n        await ensureUser(userId)\n        balance = await debit(userId, 1, 'parse-food'",
    'raw = await askOpenRouterJson<RawFoodResponse>({',
  ], 'parse-food must decide/debit billing before calling the model')
  expectCount('api/parse-food.ts', parseFood, 'debit(userId, 1,', 1)
  expectCount('api/parse-food.ts', parseFood, "credit(userId, 1, 'refund'", 3)

  const refineBranch = sliceBetween(
    parseFood,
    "if (billingMode === 'refine') {",
    "} else {\n        await ensureUser(userId)",
  )
  if (refineBranch) {
    expectAbsent('api/parse-food.ts', refineBranch, [
      {
        snippet: 'debit(',
        message: 'refine branch must not debit AI-credits',
      },
      {
        snippet: 'ensureUser(',
        message: 'refine branch must not create or charge a balance row',
      },
    ])
  } else {
    fail('api/parse-food.ts', 'could not isolate refine branch for no-debit check')
  }

  const parseDay = await read('api/parse-day.ts')
  expectIncludes('api/parse-day.ts', parseDay, [
    {
      snippet: "balance = await debit(userId, 1, 'parse-food', { route: 'parse-day', hasImages: images.length > 0 })",
      message: 'parse-day must debit exactly 1 AI-credit and mark route metadata',
    },
    {
      snippet: "return { error: 'insufficient-tokens', balance: err.balance }",
      message: 'parse-day must expose insufficient balance to the UI',
    },
    {
      snippet: 'async function refundIfNeeded(',
      message: 'parse-day must centralize refund-on-failure logic',
    },
    {
      snippet: "return await credit(userId, 1, 'refund', { reason })",
      message: 'parse-day refund helper must credit exactly 1 AI-credit back',
    },
    {
      snippet: "balance = await refundIfNeeded(userId, debited, 'parse-day-failed')",
      message: 'parse-day provider failure must refund a debited credit',
    },
    {
      snippet: "balance = await refundIfNeeded(userId, debited, 'parse-day-unusable')",
      message: 'parse-day unusable response must refund a debited credit',
    },
    {
      snippet: "balance = await refundIfNeeded(userId, debited, 'parse-day-empty')",
      message: 'parse-day empty response must refund a debited credit',
    },
    {
      snippet: 'analysisId = await recordAiAnalysis({',
      message: 'parse-day must record AI analysis for audit',
    },
    {
      snippet: 'resultJson: { foods, notes, waterMl, lazy: true }',
      message: 'parse-day audit record must preserve structured day output',
    },
  ])
  expectOrdered('api/parse-day.ts', parseDay, [
    'let debited = false',
    'await ensureUser(userId)',
    "balance = await debit(userId, 1, 'parse-food'",
    'debited = true',
    'raw = await askOpenRouterJson({',
  ], 'parse-day must debit before calling the model')
  expectCount('api/parse-day.ts', parseDay, 'debit(userId, 1,', 1)
  expectAbsent('api/parse-day.ts', parseDay, [
    {
      snippet: 'assertCanRefine',
      message: 'parse-day must stay a primary paid flow, not a hidden free refinement path',
    },
  ])

  const transcribe = await read('api/transcribe-audio.ts')
  expectIncludes('api/transcribe-audio.ts', transcribe, [
    {
      snippet: "route: 'transcribe-audio'",
      message: 'transcription usage logs must remain identifiable',
    },
  ])
  expectAbsent('api/transcribe-audio.ts', transcribe, [
    {
      snippet: './_lib/tokens.js',
      message: 'audio transcription must not import balance helpers',
    },
    {
      snippet: 'debit(',
      message: 'audio transcription must not debit AI-credits directly',
    },
    {
      snippet: 'credit(',
      message: 'audio transcription must not credit/refund AI-credits directly',
    },
    {
      snippet: 'ensureUser(',
      message: 'audio transcription must not initialize billing state directly',
    },
  ])

  const assistant = await read('api/assistant-chat.ts')
  expectIncludes('api/assistant-chat.ts', assistant, [
    {
      snippet: "usage: { route: 'assistant-chat', userId }",
      message: 'assistant usage logs must be identifiable for future billing analysis',
    },
  ])
  expectAbsent('api/assistant-chat.ts', assistant, [
    {
      snippet: './_lib/tokens.js',
      message: 'assistant v1 must not import balance helpers',
    },
    {
      snippet: 'debit(',
      message: 'assistant v1 must not debit AI-credits',
    },
    {
      snippet: 'credit(',
      message: 'assistant v1 must not credit/refund AI-credits directly',
    },
    {
      snippet: 'ensureUser(',
      message: 'assistant v1 must not initialize billing state directly',
    },
  ])

  const tokens = await read('api/_lib/tokens.ts')
  expectIncludes('api/_lib/tokens.ts', tokens, [
    {
      snippet: 'export const STARTING_BONUS = 10',
      message: 'starting AI-credit bonus must stay explicit',
    },
    {
      snippet: 'export const UNLIMITED_BALANCE = 1_000_000_000',
      message: 'developer unlimited balance sentinel must stay explicit',
    },
    {
      snippet: 'SET balance = balance - $2',
      message: 'debit must be a server-side balance decrement',
    },
    {
      snippet: 'WHERE user_id = $1 AND balance >= $2',
      message: 'debit must be atomic and reject overdraft',
    },
    {
      snippet: 'await insertTx(client, userId, -amount, kind, meta)',
      message: 'debit must write a negative audit transaction',
    },
    {
      snippet: 'ON CONFLICT (provider, external_id) DO NOTHING',
      message: 'purchase crediting must stay idempotent by provider/external id',
    },
    {
      snippet: 'await insertTx(client, input.userId, input.credits, \'purchase\'',
      message: 'purchase crediting must write a positive audit transaction',
    },
    {
      snippet: 'AND user_id = $2',
      message: 'refine parent lookup must be scoped to the same user',
    },
    {
      snippet: "AND status = 'success'",
      message: 'refine parent lookup must only accept successful analyses',
    },
  ])
}

async function checkClientBilling() {
  const ai = await read('src/lib/ai.ts')
  expectIncludes('src/lib/ai.ts', ai, [
    {
      snippet: "mode?: 'primary' | 'refine'",
      message: 'client parseFood input must expose primary/refine billing mode',
    },
    {
      snippet: 'parentAnalysisId?: number | null',
      message: 'client parseFood input must pass parent analysis for refine',
    },
    {
      snippet: 'billing: input.billing ?? null',
      message: 'client parseFood must send billing object to the server',
    },
    {
      snippet: "'/api/parse-day'",
      message: 'client must keep parse-day route wired for full-day voice entry',
    },
    {
      snippet: "'/api/transcribe-audio'",
      message: 'client must keep transcription separate from paid parse routes',
    },
  ])

  const addEntry = await read('src/components/AddEntrySheet.tsx')
  expectIncludes('src/components/AddEntrySheet.tsx', addEntry, [
    {
      snippet: "billing: { mode: 'primary' }",
      message: 'food primary parse must explicitly send paid billing mode',
    },
    {
      snippet: "billing: { mode: 'refine', parentAnalysisId: aiAnalysisId }",
      message: 'food refinement must explicitly send free refine billing mode with parent id',
    },
    {
      snippet: 'applyBalance(result.balance, result.unlimited)',
      message: 'food parse/refine UI must apply balance returned by server',
    },
    {
      snippet: 'if (isInsufficientTokens(result))',
      message: 'food UI must show purchase flow for insufficient AI-credits',
    },
  ])

  const dayVoice = await read('src/components/DayVoicePanel.tsx')
  expectIncludes('src/components/DayVoicePanel.tsx', dayVoice, [
    {
      snippet: 'const parsed = await parseDay({',
      message: 'full-day voice panel must use parse-day, not parse-food',
    },
    {
      snippet: 'applyBalance(parsed.balance, parsed.unlimited)',
      message: 'full-day voice panel must apply balance returned by server',
    },
    {
      snippet: 'if (isInsufficientTokens(parsed))',
      message: 'full-day voice panel must show purchase flow for insufficient AI-credits',
    },
  ])

  const balanceSheet = await read('src/components/BalanceSheet.tsx')
  expectIncludes('src/components/BalanceSheet.tsx', balanceSheet, [
    {
      snippet: 'AI_CREDIT_POLICY_ROWS.map',
      message: 'balance sheet must render the shared AI-credit policy rows',
    },
    {
      snippet: 'AI_CREDIT_PAID_UNIT',
      message: 'balance sheet must use the shared paid-unit copy',
    },
    {
      snippet: 'AI_CREDIT_FREE_FLOWS',
      message: 'balance sheet must use the shared free-flow copy',
    },
    {
      snippet: 'AI_CREDIT_REFUND_NOTICE',
      message: 'balance sheet must show the shared refund copy',
    },
    {
      snippet: 'не списывают AI-кредиты. Покупка кредитов не нужна.',
      message: 'unlimited developer copy must state that credits are not charged',
    },
  ])

  const balanceIndicator = await read('src/components/BalanceIndicator.tsx')
  expectIncludes('src/components/BalanceIndicator.tsx', balanceIndicator, [
    {
      snippet: 'if (!useBalanceStore.getState().loaded) void fetchBalance()',
      message: 'balance indicator must keep the lightweight balance fetch for the header',
    },
    {
      snippet: 'пакеты покупки грузятся',
      message: 'balance indicator comment must document that purchase packages are sheet-only',
    },
  ])
  expectAbsent('src/components/BalanceIndicator.tsx', balanceIndicator, [
    {
      snippet: 'fetchPackages',
      message: 'balance indicator must not preload purchase packages on the first screen',
    },
    {
      snippet: 'packagesLoading',
      message: 'balance indicator must not subscribe to purchase package state',
    },
  ])

  const policy = await read('src/lib/aiCreditPolicy.ts')
  expectIncludes('src/lib/aiCreditPolicy.ts', policy, [
    {
      snippet: 'Один первичный ввод еды или быстрый ввод всего дня стоит 1 AI-кредит.',
      message: 'shared policy must disclose both paid primary AI flows',
    },
    {
      snippet: 'Уточнения результата, транскрипция аудио, Жвуша-советник, исправления, календарь, заметки и ручной ввод бесплатны.',
      message: 'shared policy must disclose free flows in one user-facing source',
    },
    {
      snippet: 'Если AI не вернул пригодный результат, списанный AI-кредит возвращается.',
      message: 'shared policy must disclose refund behavior',
    },
    {
      snippet: "label: '1 кредит'",
      message: 'shared policy must keep paid rows explicit',
    },
    {
      snippet: "label: '0 кредитов'",
      message: 'shared policy must keep free rows explicit',
    },
    {
      snippet: "label: 'возврат'",
      message: 'shared policy must keep refund row explicit',
    },
  ])
  expectAbsent('src/lib/aiCreditPolicy.ts', policy, [
    {
      snippet: 'токен',
      message: 'user-facing policy must not use token wording',
    },
  ])
}

async function checkDocs() {
  const readme = await read('README.md')
  expectIncludes('README.md', readme, [
    {
      snippet: 'pnpm ai-credit:check',
      message: 'README command list must mention the AI-credit contract guard',
    },
    {
      snippet: 'POST /api/parse-day',
      message: 'README AI route list must document full-day parse billing',
    },
    {
      snippet: 'Один первичный ввод еды или быстрый ввод всего дня стоит 1 AI-кредит',
      message: 'README must document that parse-food and parse-day are paid primary flows',
    },
    {
      snippet: 'Уточнения результата, транскрипция аудио, Жвуша-советник, исправления, календарь, заметки и ручной ввод бесплатны.',
      message: 'README must document the free flows clearly',
    },
    {
      snippet: 'Если AI не вернул пригодный результат, списанный AI-кредит возвращается.',
      message: 'README must document refund behavior in user-facing wording',
    },
    {
      snippet: 'src/lib/aiCreditPolicy.ts',
      message: 'README must point to the shared UI policy source',
    },
  ])

  const excellence = await read('docs/competitive-excellence.md')
  expectIncludes('docs/competitive-excellence.md', excellence, [
    {
      snippet: 'pnpm ai-credit:check',
      message: 'competitive backlog must mention the AI-credit guard',
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

function expectCount(file, raw, snippet, expected) {
  const count = raw.split(snippet).length - 1
  if (count !== expected) {
    fail(file, `expected "${snippet}" ${expected} time(s), found ${count}`)
  }
}

function expectOrdered(file, raw, snippets, message) {
  let from = 0
  for (const snippet of snippets) {
    const at = raw.indexOf(snippet, from)
    if (at === -1) {
      fail(file, `${message}; missing or out of order: ${snippet}`)
      return
    }
    from = at + snippet.length
  }
}

function sliceBetween(raw, start, end) {
  const from = raw.indexOf(start)
  if (from === -1) return ''
  const to = raw.indexOf(end, from + start.length)
  if (to === -1) return ''
  return raw.slice(from, to)
}

function fail(file, message) {
  errors.push({ file, message })
}
