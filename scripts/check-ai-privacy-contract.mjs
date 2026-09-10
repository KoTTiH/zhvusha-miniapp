import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const errors = []

await checkPolicyModule()
await checkSettingsUi()
await checkAiRoutes()
await checkDocs()

if (errors.length > 0) {
  console.error(`AI privacy contract failed: ${errors.length} issue(s)`)
  for (const error of errors) console.error(`- ${error.file}: ${error.message}`)
  process.exit(1)
}

console.log('AI privacy contract ok: user-visible data boundary, audit scope, no raw photo persistence')

async function checkPolicyModule() {
  const raw = await read('src/lib/aiPrivacyPolicy.ts')
  expectIncludes('src/lib/aiPrivacyPolicy.ts', raw, [
    {
      snippet: "export const AI_PRIVACY_TITLE = 'AI и данные'",
      message: 'privacy policy must have a stable Russian title',
    },
    {
      snippet: 'приложение автоматически добавляет выбранный день и недавние записи',
      message: 'privacy summary must disclose automatic diary context',
    },
    {
      snippet: "label: 'наружу'",
      message: 'privacy policy must identify data that leaves the app',
    },
    {
      snippet: "label: 'остаётся'",
      message: 'privacy policy must identify local/non-AI flows',
    },
    {
      snippet: "label: 'аудит'",
      message: 'privacy policy must identify AI audit persistence',
    },
    {
      snippet: "label: 'фото'",
      message: 'privacy policy must disclose raw-photo persistence boundary',
    },
    {
      snippet: 'сырые фото не пишутся в журнал AI-анализов',
      message: 'privacy policy must state raw AI photos are not stored in analysis history',
    },
    {
      snippet: "label: 'советник'",
      message: 'privacy policy must disclose assistant diary context',
    },
    {
      snippet: "label: 'память'",
      message: 'privacy policy must disclose confirmed assistant memory flow',
    },
    {
      snippet: 'Vercel Blob Private',
      message: 'privacy policy must disclose private Blob photo storage',
    },
    {
      snippet: 'AI не делает выводов о личности',
      message: 'privacy policy must stay aligned with the non-interpretation philosophy',
    },
  ])
}

async function checkSettingsUi() {
  const raw = await read('src/components/SettingsSheet.tsx')
  expectIncludes('src/components/SettingsSheet.tsx', raw, [
    {
      snippet: 'AI_PRIVACY_ROWS',
      message: 'settings data tab must render shared AI privacy policy rows',
    },
    {
      snippet: '<AiPrivacyPanel />',
      message: 'settings data tab must expose the AI privacy panel',
    },
    {
      snippet: 'AI_PRIVACY_TITLE',
      message: 'settings panel must use shared Russian privacy title',
    },
    {
      snippet: 'AI_PRIVACY_NOTE',
      message: 'settings panel must show the non-interpretation note',
    },
  ])
}

async function checkAiRoutes() {
  const parseFood = await read('api/parse-food.ts')
  const parseDay = await read('api/parse-day.ts')
  for (const [file, raw] of [
    ['api/parse-food.ts', parseFood],
    ['api/parse-day.ts', parseDay],
  ]) {
    expectIncludes(file, raw, [
      {
        snippet: 'recordAiAnalysis({',
        message: 'AI route must keep analysis audit records explicit',
      },
      {
        snippet: 'rawInputText: text || null',
        message: 'AI audit must store text input explicitly',
      },
      {
        snippet: 'resultJson:',
        message: 'AI audit must store structured result explicitly',
      },
      {
        snippet: 'modelName,',
        message: 'AI audit must record the selected centralized model id',
      },
    ])
    expectAbsent(file, raw, [
      {
        snippet: 'rawInputImage',
        message: 'AI audit must not persist raw image fields',
      },
      {
        snippet: 'imageData',
        message: 'AI audit must not persist raw image data',
      },
      {
        snippet: 'data:image/',
        message: 'AI audit must not persist data-url images',
      },
    ])
  }

  const transcribe = await read('api/transcribe-audio.ts')
  expectAbsent('api/transcribe-audio.ts', transcribe, [
    {
      snippet: 'recordAiAnalysis',
      message: 'audio transcription must not write transcript/audio into AI analysis audit',
    },
    {
      snippet: './_lib/tokens.js',
      message: 'audio transcription must stay outside balance/audit token helpers',
    },
  ])

  const assistant = await read('api/assistant-chat.ts')
  expectIncludes('api/assistant-chat.ts', assistant, [
    {
      snippet: 'export default createRoute<Input, Output>',
      message: 'assistant route must use shared auth wrapper',
    },
    {
      snippet: "usage: { route: 'assistant-chat', userId }",
      message: 'assistant usage logs must be identifiable',
    },
    {
      snippet: 'loadConfirmedMemories',
      message: 'assistant must use confirmed memories, not silent profiling',
    },
    {
      snippet: 'loadDiaryContext',
      message: 'assistant must summarize diary context server-side',
    },
  ])

  const attachment = await read('api/assistant-attachment.ts')
  expectIncludes('api/assistant-attachment.ts', attachment, [
    {
      snippet: "access: 'private'",
      message: 'assistant photos must use private Blob storage',
    },
    {
      snippet: 'metadata_json',
      message: 'assistant attachment DB records must store metadata, not raw images',
    },
  ])
  expectAbsent('api/assistant-attachment.ts', attachment, [
    {
      snippet: 'rawInputImage',
      message: 'assistant attachment route must not reuse AI raw image audit fields',
    },
  ])
}

async function checkDocs() {
  const readme = await read('README.md')
  expectIncludes('README.md', readme, [
    {
      snippet: 'pnpm ai-privacy:check',
      message: 'README command list must mention the AI privacy guard',
    },
    {
      snippet: '### AI и данные',
      message: 'README must document the AI data boundary',
    },
    {
      snippet: 'приложение автоматически добавляет выбранный день и недавние записи',
      message: 'README must disclose automatic diary context',
    },
    {
      snippet: 'Сырые фото не пишутся',
      message: 'README must document raw-photo audit boundary',
    },
    {
      snippet: 'AI-анализов: в истории остаётся результат распознавания',
      message: 'README must document that AI history keeps recognition results instead of raw photos',
    },
    {
      snippet: 'src/lib/aiPrivacyPolicy.ts',
      message: 'README must point to shared AI privacy UI copy',
    },
    {
      snippet: 'Vercel Blob Private',
      message: 'README must document assistant private photo storage',
    },
  ])

  const excellence = await read('docs/competitive-excellence.md')
  expectIncludes('docs/competitive-excellence.md', excellence, [
    {
      snippet: 'AI и данные',
      message: 'competitive backlog must mention AI data transparency',
    },
    {
      snippet: 'pnpm ai-privacy:check',
      message: 'competitive backlog must mention the AI privacy guard',
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

function fail(file, message) {
  errors.push({ file, message })
}
