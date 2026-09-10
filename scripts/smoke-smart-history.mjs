import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const DEFAULT_TIMEOUT_MS = 20_000
const RECENT_NAME = 'smart history smoke'

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
  const chromeProfile = await mkdtemp(join(tmpdir(), 'zhvusha-smart-history-'))
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
      await runSmartHistorySmoke(cdp, appUrl)
    } finally {
      cdp.close()
    }

    console.log(JSON.stringify({
      ok: true,
      scenario: 'smart-history remove + undo recent',
      appUrl,
    }, null, 2))
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
  for (let i = 0; i < argv.length; i++) {
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
  console.log(`Usage: pnpm smoke:smart-history [--chrome-bin /path/to/chrome]

Starts Vite and headless Chromium, then verifies that the food bottom sheet:
- opens the collapsed "быстро" area
- removes a recent item from "быстро"
- shows the local "журнал быстро" entry
- restores the item through toast undo

Options:
  --server-port N   Use a fixed Vite port instead of a free port.
  --cdp-port N      Use a fixed Chrome DevTools port instead of a free port.
  --timeout-ms N    Wait timeout for server/browser/UI steps. Default: ${DEFAULT_TIMEOUT_MS}.
`)
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

async function runSmartHistorySmoke(cdp, appUrl) {
  await cdp.send('Runtime.enable')
  await blockExternalTelegramScript(cdp)
  await cdp.send('Page.enable')
  await cdp.send('Page.navigate', { url: appUrl })
  await sleep(800)

  await evaluate(cdp, seedRecentExpression())
  await waitFor(cdp, `(() => (document.body?.innerText ?? '').trim().length > 0)()`, 'app content')

  const openResult = await evaluate(cdp, `(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const add = buttons.find((button) => button.getAttribute('aria-label') === 'добавить')
      ?? buttons.find((button) => button.innerText.trim().toLowerCase() === 'добавить еду')
    if (!add) {
      return {
        opened: false,
        buttons: buttons.map((button) => ({
          aria: button.getAttribute('aria-label'),
          text: button.innerText,
        })).slice(0, 50),
      }
    }
    add.click()
    return { opened: true }
  })()`)
  if (!openResult.opened) throw new Error(`Could not open add sheet: ${JSON.stringify(openResult)}`)

  const addSurface = await waitFor(
    cdp,
    `(() => {
      if (document.querySelector('textarea')) return 'food-form'
      const hasFoodButton = Array.from(document.querySelectorAll('button')).some((button) =>
        button.getAttribute('aria-label') === 'еда'
      )
      return hasFoodButton ? 'food-button' : ''
    })()`,
    'add sheet food surface',
  )
  if (addSurface === 'food-button') {
    const foodTabResult = await evaluate(cdp, `(() => {
      const food = Array.from(document.querySelectorAll('button')).find((button) =>
        button.getAttribute('aria-label') === 'еда'
      )
      if (!food) return { opened: false }
      food.click()
      return { opened: true }
    })()`)
    if (!foodTabResult.opened) throw new Error(`Could not open food tab: ${JSON.stringify(foodTabResult)}`)
  }

  await waitFor(cdp, `(() => document.querySelector('textarea') !== null)()`, 'food textarea')

  const inputResult = await evaluate(cdp, `(() => {
    const textarea = document.querySelector('textarea')
    if (!textarea) return { filled: false, reason: 'textarea missing' }
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(textarea, ${JSON.stringify(RECENT_NAME)})
    textarea.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(RECENT_NAME)} }))
    return { filled: true }
  })()`)
  if (!inputResult.filled) throw new Error(`Could not fill food query: ${JSON.stringify(inputResult)}`)

  await waitFor(
    cdp,
    `(() => Array.from(document.querySelectorAll('button')).some((item) =>
      (item.getAttribute('aria-label') ?? '') === 'показать быстро' &&
      item.getAttribute('aria-expanded') === 'false'
    ))()`,
    'collapsed quick shortcuts toggle',
  )

  const quickToggle = await evaluate(cdp, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) =>
      (item.getAttribute('aria-label') ?? '') === 'показать быстро' &&
      item.getAttribute('aria-expanded') === 'false'
    )
    if (!button) return { expanded: false }
    button.click()
    return { expanded: true }
  })()`)
  if (!quickToggle.expanded) throw new Error('Could not open collapsed quick shortcuts area')

  await waitFor(
    cdp,
    `(() => {
      const text = (document.body?.innerText ?? '').toLowerCase()
      const removeButton = Array.from(document.querySelectorAll('button')).some((button) =>
        (button.getAttribute('aria-label') ?? '').includes('убрать ${RECENT_NAME} из быстро')
      )
      return text.includes('${RECENT_NAME}') && removeButton
    })()`,
    'seeded recent shortcut',
  )

  const removeResult = await evaluate(cdp, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) =>
      (item.getAttribute('aria-label') ?? '').includes('убрать ${RECENT_NAME} из быстро')
    )
    if (!button) return { removed: false }
    button.click()
    return { removed: true }
  })()`)
  if (!removeResult.removed) throw new Error('Could not remove seeded recent shortcut')

  await waitFor(
    cdp,
    `(() => {
      const text = (document.body?.innerText ?? '').toLowerCase()
      const removeButton = Array.from(document.querySelectorAll('button')).some((button) =>
        (button.getAttribute('aria-label') ?? '').includes('убрать ${RECENT_NAME} из быстро')
      )
      return text.includes('журнал быстро') &&
        text.includes('убрано из быстро') &&
        text.includes('${RECENT_NAME}') &&
        !removeButton
    })()`,
    'smart-history remove entry',
  )

  const undoResult = await evaluate(cdp, `(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) =>
      (item.innerText ?? '').trim().toLowerCase() === 'отмена'
    )
    if (!button) return { undone: false }
    button.click()
    return { undone: true }
  })()`)
  if (!undoResult.undone) throw new Error('Could not click recent undo toast')

  await waitFor(
    cdp,
    `(() => {
      const text = (document.body?.innerText ?? '').toLowerCase()
      const removeButton = Array.from(document.querySelectorAll('button')).some((button) =>
        (button.getAttribute('aria-label') ?? '').includes('убрать ${RECENT_NAME} из быстро')
      )
      return text.includes('возвращено в быстро') && removeButton
    })()`,
    'smart-history undo entry',
  )

  const state = await evaluate(cdp, `(() => ({
    overlay: document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]')?.textContent ?? null,
  }))()`)
  if (state.overlay) throw new Error(`Vite overlay detected: ${state.overlay.slice(0, 1000)}`)
}

async function blockExternalTelegramScript(cdp) {
  await cdp.send('Network.enable')
  await cdp.send('Network.setBlockedURLs', {
    urls: ['https://telegram.org/*', 'http://telegram.org/*'],
  })
}

function seedRecentExpression() {
  return `(() => {
    localStorage.clear()
    localStorage.setItem('zhvusha:anon:cr', JSON.stringify({
      entries: [{
        lastUsedAt: Date.now(),
        usageCount: 3,
        quickAdd: {
          name: ${JSON.stringify(RECENT_NAME)},
          kcal: 123,
          carbs: 10,
          fat: 4,
          protein: 8,
          estimate: {
            source: 'manual',
            portionBasis: 'stated_weight',
            basisLabel: 'smoke',
            dataSource: 'ручной ввод',
          },
        },
      }],
    }))
    location.reload()
    return true
  })()`
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
