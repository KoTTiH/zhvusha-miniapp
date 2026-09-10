import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const DEFAULT_TIMEOUT_MS = 20_000
const SMOKE_DAY = '2026-05-04'

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
})

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    usage()
    return
  }

  const serverPort = args.serverPort || await freePort()
  let cdpPort = args.cdpPort || await freePort()
  while (cdpPort === serverPort) cdpPort = await freePort()

  const appUrl = `http://127.0.0.1:${serverPort}/`
  const cdpJsonUrl = `http://127.0.0.1:${cdpPort}/json`
  const chromeProfile = await mkdtemp(join(tmpdir(), 'zhvusha-data-export-'))
  const handles = []

  try {
    const server = startVite(serverPort)
    handles.push(server)
    await waitForHttp(appUrl, 'vite app', args.timeoutMs, server)

    const browser = startChrome(args.chromeBin, cdpPort, chromeProfile, appUrl)
    handles.push(browser)
    const page = await waitForPage(cdpJsonUrl, args.timeoutMs, browser)
    const cdp = await connectPage(page.webSocketDebuggerUrl)

    try {
      const result = await runDataExportSmoke(cdp, appUrl)
      console.log(JSON.stringify({
        ok: true,
        scenario: 'settings data tab export/import fingerprint + integrity diagnostics',
        appUrl,
        ...result,
      }, null, 2))
    } finally {
      cdp.close()
    }
  } finally {
    for (const handle of handles.reverse()) await stopProcess(handle)
    await rmWithRetry(chromeProfile)
  }
}

function parseArgs(argv) {
  const out = {
    chromeBin: process.env.CHROME_BIN ?? '',
    serverPort: 0,
    cdpPort: 0,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    help: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--chrome-bin') out.chromeBin = valueAfter(argv, ++i, arg)
    else if (arg === '--server-port') out.serverPort = positiveInt(valueAfter(argv, ++i, arg), arg)
    else if (arg === '--cdp-port') out.cdpPort = positiveInt(valueAfter(argv, ++i, arg), arg)
    else if (arg === '--timeout-ms') out.timeoutMs = positiveInt(valueAfter(argv, ++i, arg), arg)
    else throw new Error(`unknown arg: ${arg}`)
  }
  return out
}

function usage() {
  console.log(`Usage: pnpm smoke:data-export [--chrome-bin /path/to/chrome]

Starts Vite and headless Chromium, then verifies the settings data tab:
- opens the settings data tab
- exports seeded food/water/note/day-meta data to JSON
- shows a short fingerprint in JSON, metrics and backup status
- previews the same JSON before import writes
- applies the import and records the imported fingerprint
- checks grouped integrity diagnostics for broken food/serving references

Options:
  --server-port N   Use a fixed Vite port instead of a free port.
  --cdp-port N      Use a fixed Chrome DevTools port instead of a free port.
  --timeout-ms N    Wait timeout for server/browser/UI steps. Default: ${DEFAULT_TIMEOUT_MS}.
`)
}

async function runDataExportSmoke(cdp, appUrl) {
  await cdp.send('Runtime.enable')
  await blockExternalTelegramScript(cdp)
  await cdp.send('Page.enable')
  await cdp.send('Page.navigate', { url: appUrl })
  await sleep(800)
  await waitForAppContent(cdp, 'app content')

  await evaluate(cdp, seedDataExpression())
  await sleep(800)
  await waitForAppContent(cdp, 'seeded app reload')
  await installConsoleProbe(cdp)

  const dataTab = await openDataTab(cdp)
  await clickButton(cdp, 'СОЗДАТЬ JSON')
  const exportState = await waitFor(cdp, js(() => {
    const json = document.querySelector('textarea[aria-label="JSON экспорт"]')?.value ?? ''
    const fingerprint = json.match(/"fingerprint": "([0-9a-f]{8})"/)?.[1] ?? ''
    if (!fingerprint) return null
    const parsed = JSON.parse(json)
    const text = document.body?.innerText ?? ''
    return {
      fingerprint,
      counts: parsed.counts,
      hasBackupFingerprint: text.includes(`КОД КОПИИ\n${fingerprint}`),
      hasMetricFingerprint: text.includes(`${fingerprint}\nКОД`),
    }
  }), 'export JSON fingerprint')

  assertCount(exportState.counts.foodEntries, 1, 'export foodEntries')
  assertCount(exportState.counts.waterEntries, 1, 'export waterEntries')
  assertCount(exportState.counts.notes, 1, 'export notes')
  assertCount(exportState.counts.lazyDays, 1, 'export lazyDays')
  assertCount(exportState.counts.foods, 1, 'export foods')
  assertCount(exportState.counts.meals, 1, 'export meals')
  if (!exportState.hasBackupFingerprint || !exportState.hasMetricFingerprint) {
    throw new Error(`export fingerprint is not visible in UI: ${JSON.stringify(exportState)}`)
  }

  await evaluate(cdp, js(() => {
    const json = document.querySelector('textarea[aria-label="JSON экспорт"]')?.value ?? ''
    const input = document.querySelector('input[type="file"]')
    if (!json || !input) return { ok: false }
    const transfer = new DataTransfer()
    transfer.items.add(new File([json], 'zhvusha-smoke-export.json', { type: 'application/json' }))
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return { ok: true }
  }))

  await waitFor(cdp, js((fingerprint) => {
    const text = document.body?.innerText ?? ''
    return text.includes('JSON проверен') &&
      text.includes(`код ${fingerprint}`) &&
      text.includes(`${fingerprint}\nКОД`)
  }, exportState.fingerprint), 'import preview fingerprint')

  await clickButton(cdp, 'ПРИМЕНИТЬ ИМПОРТ')
  await waitFor(cdp, js((fingerprint) => {
    const text = document.body?.innerText ?? ''
    return text.includes('импорт готов') &&
      text.includes(`код ${fingerprint}`) &&
      text.includes(`КОД ИМПОРТА\n${fingerprint}`)
  }, exportState.fingerprint), 'import apply fingerprint')

  const integrityState = await runIntegritySmoke(cdp)
  const finalState = await evaluate(cdp, js(() => ({
    overlay: document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]')?.textContent ?? null,
    consoleErrors: window.__smokeConsoleErrors ?? [],
  })))
  if (finalState.overlay) throw new Error(`Vite overlay detected: ${finalState.overlay.slice(0, 1000)}`)
  if (finalState.consoleErrors.length > 0) {
    throw new Error(`Console errors detected: ${finalState.consoleErrors.join('\n')}`)
  }

  return {
    fingerprint: exportState.fingerprint,
    counts: exportState.counts,
    dataTab,
    integrity: integrityState,
  }
}

async function runIntegritySmoke(cdp) {
  await evaluate(cdp, seedIntegrityIssuesExpression())
  await clickButton(cdp, 'ПРОВЕРИТЬ')
  return await waitFor(cdp, js(() => {
    const text = document.body?.innerText ?? ''
    const groups = [
      text.includes('ДНЕВНИК') && text.includes('продукт не найден'),
      text.includes('ДНЕВНИК') && text.includes('порция не найдена'),
      text.includes('ШАБЛОН') && text.includes('продукт не найден'),
      text.includes('ШАБЛОН') && text.includes('порция не найдена'),
    ]
    if (!text.includes('найдено: 4')) return null
    if (!text.includes('Проверка ничего не меняет сама')) return null
    if (!text.includes('открой день') || !text.includes('открой шаблон блюда')) return null
    if (!text.includes('запись без продукта') || !text.includes('блюдо без порции')) return null
    if (!groups.every(Boolean)) return null
    return {
      issues: 4,
      groups: groups.length,
      hasDisclosure: true,
      hasNextSteps: true,
      hasExamples: true,
    }
  }), 'grouped integrity diagnostics')
}

function seedDataExpression() {
  return js((day) => {
    localStorage.clear()
    const prefix = 'zhvusha:anon:'
    const now = Date.now()
    const food = {
      id: 'smoke-food',
      name: 'smoke food',
      servings: [{
        id: 'smoke-serving',
        label: '100 г',
        kcal: 120,
        carbs: 15,
        fat: 4,
        protein: 7,
      }],
      favourite: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
    }
    const meal = {
      id: 'smoke-meal',
      name: 'smoke meal',
      items: [{
        foodId: food.id,
        servingId: 'smoke-serving',
        quantity: 1,
      }],
      favourite: false,
      createdAt: now,
      updatedAt: now,
    }
    const entry = {
      id: 'smoke-entry',
      date: day,
      quantity: 1,
      createdAt: now,
      foodId: food.id,
      servingId: 'smoke-serving',
    }
    const water = {
      id: 'smoke-water',
      date: day,
      ml: 250,
      createdAt: now,
    }
    const note = {
      id: 'smoke-note',
      text: 'smoke note',
      color: '#F2C94C',
      createdAt: now,
      updatedAt: now,
    }
    const meta = {
      day,
      lazy: true,
      updatedAt: now,
    }

    localStorage.setItem(`${prefix}cf_${food.id}`, JSON.stringify(food))
    localStorage.setItem(`${prefix}cm_${meal.id}`, JSON.stringify(meal))
    localStorage.setItem(`${prefix}cd_${day}`, JSON.stringify({ v: 1, e: [entry] }))
    localStorage.setItem(`${prefix}cw_${day}`, JSON.stringify({ v: 1, e: [water] }))
    localStorage.setItem(`${prefix}cx_${day}`, JSON.stringify(meta))
    localStorage.setItem(`${prefix}d:${day}`, JSON.stringify([note]))
    localStorage.setItem(`${prefix}widgets`, JSON.stringify([{ id: 'smoke-calories-widget', type: 'calories-today' }]))
    location.reload()
    return true
  }, SMOKE_DAY)
}

function seedIntegrityIssuesExpression() {
  return js((day) => {
    const prefix = 'zhvusha:anon:'
    const now = Date.now()
    const food = {
      id: 'integrity-food-ok',
      name: 'integrity food',
      servings: [{
        id: 'integrity-serving-ok',
        label: '100 г',
        kcal: 120,
        carbs: 15,
        fat: 4,
        protein: 7,
      }],
      favourite: false,
      archived: false,
      createdAt: now,
      updatedAt: now,
    }
    const entries = [
      {
        id: 'integrity-entry-missing-food',
        date: day,
        quantity: 1,
        createdAt: now,
        foodId: 'integrity-food-gone',
        servingId: 'integrity-serving-any',
      },
      {
        id: 'integrity-entry-missing-serving',
        date: day,
        quantity: 1,
        createdAt: now,
        foodId: food.id,
        servingId: 'integrity-serving-gone',
      },
    ]
    const meal = {
      id: 'integrity-meal-broken',
      name: 'integrity meal',
      items: [
        {
          foodId: 'integrity-food-gone',
          servingId: 'integrity-serving-any',
          quantity: 1,
        },
        {
          foodId: food.id,
          servingId: 'integrity-serving-gone',
          quantity: 1,
        },
      ],
      favourite: false,
      createdAt: now,
      updatedAt: now,
    }
    localStorage.setItem(`${prefix}cf_${food.id}`, JSON.stringify(food))
    localStorage.setItem(`${prefix}cd_${day}`, JSON.stringify({ v: 1, e: entries }))
    localStorage.setItem(`${prefix}cm_${meal.id}`, JSON.stringify(meal))
    return true
  }, SMOKE_DAY)
}

async function blockExternalTelegramScript(cdp) {
  await cdp.send('Network.enable')
  await cdp.send('Network.setBlockedURLs', {
    urls: ['https://telegram.org/*', 'http://telegram.org/*'],
  })
}

async function waitForAppContent(cdp, label) {
  try {
    return await waitFor(cdp, js(() => (document.body?.innerText ?? '').trim().length > 0), label)
  } catch (e) {
    const state = await evaluate(cdp, js(() => ({
      href: location.href,
      readyState: document.readyState,
      title: document.title,
      bodyText: document.body?.innerText?.slice(0, 1000) ?? null,
      bodyHtml: document.body?.innerHTML?.slice(0, 2000) ?? null,
      rootHtml: document.querySelector('#root')?.innerHTML?.slice(0, 2000) ?? null,
      overlay: document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]')?.textContent?.slice(0, 2000) ?? null,
    })))
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`${message}\nPage state: ${JSON.stringify(state, null, 2)}`)
  }
}

async function openDataTab(cdp) {
  const opened = await evaluate(cdp, js(() => {
    const buttons = visibleButtons()
    const settings = buttons.find((button) => button.getAttribute('aria-label') === 'настройки')
    if (!settings) return { ok: false, reason: 'settings button missing' }
    settings.click()
    return { ok: true }

    function visibleButtons() {
      return Array.from(document.querySelectorAll('button')).filter((button) => {
        const rect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      })
    }
  }))
  if (!opened.ok) throw new Error(`Could not open settings: ${JSON.stringify(opened)}`)

  await waitFor(cdp, js(() => {
    const dialog = document.querySelector('[role="dialog"][aria-label="настройки"]')
    return Array.from(dialog?.querySelectorAll('button[role="tab"]') ?? []).some((button) => {
      const rect = button.getBoundingClientRect()
      const style = getComputedStyle(button)
      return button.innerText.trim().toUpperCase() === 'ДАННЫЕ' &&
        !button.disabled && rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden'
    })
  }), 'загрузка вкладки данных в настройках')
  await clickButton(cdp, 'ДАННЫЕ')
  return await waitFor(
    cdp,
    js(() => {
      const text = document.body?.innerText ?? ''
      const selectedData = Array.from(document.querySelectorAll('button[role="tab"]')).some((button) =>
        button.innerText.trim().toUpperCase() === 'ДАННЫЕ' &&
        button.getAttribute('aria-selected') === 'true')
      if (!selectedData) return null
      if (!text.includes('РЕЗЕРВНАЯ КОПИЯ')) return null
      if (!text.includes('ВОССТАНОВЛЕНИЕ')) return null
      if (!text.includes('ПАСПОРТ ГОТОВНОСТИ')) return null
      if (!text.includes('ГДЕ ХРАНЯТСЯ ДАННЫЕ')) return null
      return {
        selectedData,
        hasBackupPanel: true,
        hasPassport: true,
        hasStoragePanel: true,
      }
    }),
    'settings data tab',
  )
}

async function clickButton(cdp, text) {
  const result = await evaluate(cdp, js((target) => {
    const button = visibleButtons().find((item) => item.innerText.trim().toUpperCase() === target)
    if (!button) {
      return {
        clicked: false,
        buttons: visibleButtons().map((item) => item.innerText.trim()).filter(Boolean).slice(0, 80),
      }
    }
    button.click()
    return { clicked: true }

    function visibleButtons() {
      return Array.from(document.querySelectorAll('button')).filter((button) => {
        const rect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      })
    }
  }, text.toUpperCase()))
  if (!result.clicked) throw new Error(`Could not click "${text}": ${JSON.stringify(result)}`)
  await sleep(250)
}

async function installConsoleProbe(cdp) {
  await evaluate(cdp, js(() => {
    window.__smokeConsoleErrors = []
    const originalError = console.error
    console.error = (...args) => {
      window.__smokeConsoleErrors.push(args.map(String).join(' '))
      originalError.apply(console, args)
    }
    window.addEventListener('error', (event) => {
      window.__smokeConsoleErrors.push(String(event.message || event.error || 'window error'))
    })
    window.addEventListener('unhandledrejection', (event) => {
      window.__smokeConsoleErrors.push(String(event.reason || 'unhandled rejection'))
    })
    return true
  }))
}

function js(fn, ...args) {
  return `(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(',')})`
}

function assertCount(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve) => server.close(resolve))
  if (!port) throw new Error('could not allocate a free local port')
  return port
}

function startVite(port) {
  const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  return spawnLogged('vite', pnpm, [
    'exec',
    'vite',
    '--host',
    '127.0.0.1',
    '--port',
    String(port),
    '--strictPort',
  ])
}

function startChrome(explicitBin, cdpPort, profileDir, appUrl) {
  const chromeBin = resolveChromeBin(explicitBin)
  return spawnLogged('chromium', chromeBin, [
    '--headless',
    '--disable-background-networking',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-sandbox',
    '--remote-debugging-address=127.0.0.1',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${profileDir}`,
    appUrl,
  ])
}

function resolveChromeBin(explicitBin) {
  if (explicitBin) return explicitBin
  for (const candidate of ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable']) {
    const result = spawnSync('which', [candidate], { encoding: 'utf8' })
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim()
  }
  throw new Error('Chromium/Chrome not found. Set CHROME_BIN or pass --chrome-bin.')
}

function spawnLogged(label, command, args) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const chunks = []
  const push = (chunk) => {
    chunks.push(String(chunk))
    while (chunks.join('').length > 6000) chunks.shift()
  }
  child.stdout.on('data', push)
  child.stderr.on('data', push)
  child.on('error', (e) => push(e instanceof Error ? e.message : String(e)))
  return {
    label,
    child,
    tail: () => chunks.join('').slice(-5000),
  }
}

async function waitForHttp(url, label, timeoutMs, processHandle) {
  const started = Date.now()
  let lastError = ''
  while (Date.now() - started < timeoutMs) {
    if (processHandle.child.exitCode !== null) {
      throw new Error(`${label} exited before ready:\n${processHandle.tail()}`)
    }
    try {
      const response = await fetch(url)
      if (response.status < 500) return
      lastError = `HTTP ${response.status}`
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${label}: ${lastError}\n${processHandle.tail()}`)
}

async function waitForPage(cdpJsonUrl, timeoutMs, processHandle) {
  const started = Date.now()
  let lastError = ''
  while (Date.now() - started < timeoutMs) {
    if (processHandle.child.exitCode !== null) {
      throw new Error(`browser exited before CDP page:\n${processHandle.tail()}`)
    }
    try {
      const pages = await fetchJson(cdpJsonUrl)
      const page = pages.find((item) => item.type === 'page') ?? pages[0]
      if (page?.webSocketDebuggerUrl) return page
      lastError = 'no page target'
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
    await sleep(250)
  }
  throw new Error(`Timed out waiting for browser CDP page: ${lastError}\n${processHandle.tail()}`)
}

async function fetchJson(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function connectPage(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    }
  }
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  const send = (method, params = {}) => new Promise((resolve) => {
    const message = { id: ++id, method, params }
    pending.set(message.id, resolve)
    ws.send(JSON.stringify(message))
  })
  return {
    send,
    close: () => ws.close(),
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (result.result?.exceptionDetails) {
    const details = result.result.exceptionDetails
    const description = details.exception?.description ?? details.text ?? 'Runtime evaluation failed'
    throw new Error(description)
  }
  return result.result?.result?.value
}

async function waitFor(cdp, expression, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = Date.now()
  let last
  while (Date.now() - started < timeoutMs) {
    last = await evaluate(cdp, expression)
    if (last) return last
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`)
}

async function stopProcess(processHandle) {
  const child = processHandle.child
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(2000),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}

async function rmWithRetry(dir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true })
      return
    } catch (e) {
      if (attempt === 4) throw e
      await sleep(150 * (attempt + 1))
    }
  }
}

function valueAfter(argv, index, flag) {
  const value = argv[index]
  if (!value) throw new Error(`${flag} requires a value`)
  return value
}

function positiveInt(value, flag) {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} must be a positive integer`)
  return n
}
