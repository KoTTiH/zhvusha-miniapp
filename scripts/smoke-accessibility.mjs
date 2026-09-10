import { spawn, spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const DEFAULT_TIMEOUT_MS = 20_000

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
  const chromeProfile = await mkdtemp(join(tmpdir(), 'zhvusha-accessibility-'))
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
      const result = await runAccessibilitySmoke(cdp, appUrl)
      console.log(JSON.stringify({
        ok: true,
        scenario: 'accessibility keyboard dialog flow',
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
  console.log(`Usage: pnpm smoke:accessibility [--chrome-bin /path/to/chrome]

Starts Vite and headless Chromium, then verifies the main keyboard/dialog flow:
- first-run food CTA opens the food bottom sheet directly
- widget picker toggles the first dashboard widget
- enabled dashboard widgets are focusable groups
- Enter opens widget editing controls from the keyboard
- food bottom sheet has an accessible name and receives focus
- Tab stays inside the modal dialog
- Escape closes the dialog and restores focus

Options:
  --server-port N   Use a fixed Vite port instead of a free port.
  --cdp-port N      Use a fixed Chrome DevTools port instead of a free port.
  --timeout-ms N    Wait timeout for server/browser/UI steps. Default: ${DEFAULT_TIMEOUT_MS}.
`)
}

async function runAccessibilitySmoke(cdp, appUrl) {
  await cdp.send('Runtime.enable')
  await cdp.send('Log.enable')
  await blockExternalTelegramScript(cdp)
  await cdp.send('Page.enable')
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(${installBalanceProbe.toString()})()`,
  })
  await cdp.send('Page.navigate', { url: appUrl })
  await sleep(800)
  await installConsoleProbe(cdp)
  await waitFor(cdp, js(() => (document.body?.innerText ?? '').trim().length > 0), 'app content')

  const initial = await evaluate(cdp, js(() => ({
    overlay: errorOverlay(),
    openDialogs: activeDialogs().length,
    firstFoodCta: visibleButtons().some((button) =>
      button.innerText.trim().toLowerCase() === 'добавить еду'),
    widgetGroups: document.querySelectorAll('[data-widget-id][role="group"][tabindex="0"]').length,
    loadingWidgetText: (document.body?.innerText ?? '').toLowerCase().includes('загрузка виджета'),
  })))
  if (initial.overlay) throw new Error(`Vite overlay detected: ${initial.overlay.slice(0, 1000)}`)
  if (initial.openDialogs !== 0) throw new Error(`Expected no open dialogs, got ${initial.openDialogs}`)
  if (!initial.firstFoodCta) throw new Error('First-run food CTA is missing')
  if (initial.loadingWidgetText) throw new Error('Visible widget-loading text flashed on first render')

  const balanceRequests = await checkBalanceFailureRecovery(cdp)

  await clickButton(cdp, 'ДОБАВИТЬ ЕДУ')
  const sheetOpen = await assertFoodDialog(cdp, 'first-run food dialog focus')
  await key(cdp, 'Tab', 'Tab', 9)
  await key(cdp, 'Tab', 'Tab', 9)
  const tabInside = await evaluate(cdp, js(() => {
    const dialog = activeDialogs()[0] ?? null
    return !!dialog && dialog.contains(document.activeElement)
  }))
  if (!tabInside) throw new Error('Tab moved focus outside dialog')
  await key(cdp, 'Escape', 'Escape', 27)
  const afterEscape = await assertNoDialogs(cdp, 'first-run dialog closes on Escape')

  await clickButton(cdp, 'ДОБАВИТЬ ВИДЖЕТЫ')
  const widgetPicker = await assertWidgetPicker(cdp, 'widget picker focus')
  await clickButtonContaining(cdp, 'Калории сегодня')
  const toggledWidget = await waitFor(cdp, js(() => {
    const row = visibleButtons().find((button) => button.innerText.includes('Калории сегодня'))
    return row && {
      pressed: row.getAttribute('aria-pressed'),
      overlay: errorOverlay(),
    }
  }), 'widget row toggled on')
  if (toggledWidget.overlay) {
    throw new Error(`Vite overlay detected: ${toggledWidget.overlay.slice(0, 1000)}`)
  }
  if (toggledWidget.pressed !== 'true') {
    throw new Error(`Widget row did not toggle on: ${JSON.stringify(toggledWidget)}`)
  }
  await key(cdp, 'Escape', 'Escape', 27)
  await assertNoDialogs(cdp, 'widget picker closes on Escape')

  const withWidget = await waitFor(cdp, js(() => ({
    overlay: errorOverlay(),
    firstFoodCta: visibleButtons().some((button) =>
      button.innerText.trim().toLowerCase() === 'добавить еду'),
    widgetGroups: document.querySelectorAll('[data-widget-id][role="group"][tabindex="0"]').length,
  })), 'dashboard widgets after picker toggle')
  if (withWidget.overlay) throw new Error(`Vite overlay detected: ${withWidget.overlay.slice(0, 1000)}`)
  if (withWidget.firstFoodCta) throw new Error('Empty-state food CTA stayed visible after enabling a widget')
  if (withWidget.widgetGroups < 1) throw new Error('No focusable widget groups after enabling a widget')

  await cdp.send('Page.reload', { ignoreCache: true })
  await sleep(800)
  await installConsoleProbe(cdp)
  const afterReload = await waitFor(cdp, js(() => ({
    overlay: errorOverlay(),
    loadingWidgetText: (document.body?.innerText ?? '').toLowerCase().includes('загрузка виджета'),
    widgetGroups: document.querySelectorAll('[data-widget-id][role="group"][tabindex="0"]').length,
    pencilLabels: visibleButtons()
      .map((button) => button.getAttribute('aria-label'))
      .filter((label) => label === 'настроить виджеты' || label === 'добавить виджеты'),
  })), 'dashboard stable after reload')
  if (afterReload.overlay) throw new Error(`Vite overlay detected: ${afterReload.overlay.slice(0, 1000)}`)
  if (afterReload.loadingWidgetText) throw new Error('Visible widget-loading text flashed after reload')
  if (afterReload.widgetGroups < 1) throw new Error('Enabled widget did not survive reload')
  if (afterReload.pencilLabels.length === 0) throw new Error('Header pencil disappeared after reload')

  await evaluate(cdp, js(() => {
    document.querySelector('[data-widget-id][role="group"]')?.focus()
    return true
  }))
  await key(cdp, 'Enter', 'Enter', 13)
  const editing = await waitFor(cdp, js(() => ({
    done: visibleButtons().some((button) => button.innerText.trim().toLowerCase() === 'готово'),
    controls: visibleButtons()
      .map((button) => button.getAttribute('aria-label'))
      .filter(Boolean)
      .filter((label) => ['Выше', 'Ниже', 'Перетащить виджет', 'Удалить виджет'].includes(label))
      .sort(),
  })), 'keyboard widget editing')
  if (!editing.done) throw new Error('Keyboard did not enter widget editing mode')
  for (const label of ['Выше', 'Ниже', 'Перетащить виджет', 'Удалить виджет']) {
    if (!editing.controls.includes(label)) throw new Error(`Missing widget edit control: ${label}`)
  }

  await clickButton(cdp, 'ГОТОВО')
  const finalState = await assertNoDialogs(cdp, 'widget editing closes cleanly')

  return {
    initial,
    balanceRequests,
    widgetPicker,
    withWidget,
    afterReload,
    editingControls: editing.controls.length,
    dialog: {
      label: sheetOpen.label,
      activeInside: sheetOpen.activeInside,
      tabInside,
      closedByEscape: afterEscape.openDialogs === 0,
      focusAfterEscape: afterEscape.focusLabel,
      finalFocus: finalState.focusLabel,
    },
  }
}

// Только браузерный тест: ошибки API не должны превращаться в цикл запросов.
function installBalanceProbe() {
  const originalFetch = window.fetch.bind(window)
  window.__balanceProbe = { balance: 0, packages: 0, mode: 401 }
  window.fetch = async (input, init) => {
    const path = new URL(typeof input === 'string' ? input : input.url, location.href).pathname
    const isBalance = path === '/api/balance'
    if (!isBalance && path !== '/api/ai-credit-packages') return originalFetch(input, init)
    const probe = window.__balanceProbe
    probe[isBalance ? 'balance' : 'packages'] += 1
    if (probe.mode === 'network') throw new TypeError('Тестовый обрыв сети')
    const body = probe.mode === 200
      ? isBalance ? { balance: 42, startingBonus: 10 } : { packages: [] }
      : { error: 'test-unavailable' }
    return new Response(JSON.stringify(body), {
      status: probe.mode,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function checkBalanceFailureRecovery(cdp) {
  await waitFor(cdp, 'window.__balanceProbe?.balance > 0', 'first balance request')
  const assertCounts = async (balance, packages) => {
    await sleep(600)
    const actual = await evaluate(cdp, 'window.__balanceProbe')
    if (actual.balance !== balance || actual.packages !== packages) {
      throw new Error(`Balance requests repeated without user action: ${JSON.stringify(actual)}`)
    }
  }
  await assertCounts(1, 0)
  let expected = 1
  for (const mode of [401, 503, 'network', 200]) {
    await evaluate(cdp, `window.__balanceProbe.mode = ${JSON.stringify(mode)}`)
    await clickAria(cdp, 'осталось — AI-кредитов')
    await assertCounts(++expected, expected - 1)
    if (mode === 200) {
      await waitFor(cdp, `!!document.querySelector('[aria-label="осталось 42 AI-кредитов"]')`, 'balance recovers after retry')
    }
    await key(cdp, 'Escape', 'Escape', 27)
    await assertNoDialogs(cdp, 'balance sheet closes')
  }
  return { attempts: expected, recoveredBalance: 42, failureModes: [401, 503, 'network'] }
}

async function assertWidgetPicker(cdp, label) {
  const sheetOpen = await waitFor(cdp, js(() => {
    const dialog = activeDialogs()[0] ?? null
    const labelledBy = dialog?.getAttribute('aria-labelledby') ?? null
    const labelledText = labelledBy
      ? document.getElementById(labelledBy)?.textContent?.trim() ?? null
      : null
    return dialog && {
      label: dialog.getAttribute('aria-label') ?? labelledText,
      activeInside: dialog.contains(document.activeElement),
      rows: visibleButtons()
        .filter((button) => button.getAttribute('aria-pressed') !== null)
        .map((button) => ({
          text: button.innerText.trim().slice(0, 80),
          pressed: button.getAttribute('aria-pressed'),
        })),
      overlay: errorOverlay(),
    }
  }), label)
  if (sheetOpen.overlay) throw new Error(`Vite overlay detected: ${sheetOpen.overlay.slice(0, 1000)}`)
  if (sheetOpen.label !== 'виджеты') throw new Error(`Unexpected widget picker label: ${sheetOpen.label}`)
  if (!sheetOpen.activeInside) throw new Error('Focus did not move inside widget picker')
  if (sheetOpen.rows.length === 0) throw new Error('Widget picker has no toggle rows')
  return sheetOpen
}

async function assertFoodDialog(cdp, label) {
  const sheetOpen = await waitFor(cdp, js(() => {
    const dialog = activeDialogs()[0] ?? null
    return dialog && {
      label: dialog.getAttribute('aria-label') ?? null,
      activeInside: dialog.contains(document.activeElement),
      activeTag: document.activeElement?.tagName ?? null,
      overlay: errorOverlay(),
    }
  }), label)
  if (sheetOpen.overlay) throw new Error(`Vite overlay detected: ${sheetOpen.overlay.slice(0, 1000)}`)
  if (sheetOpen.label !== 'добавить еду') throw new Error(`Unexpected dialog label: ${sheetOpen.label}`)
  if (!sheetOpen.activeInside) throw new Error('Focus did not move inside dialog')
  return sheetOpen
}

async function assertNoDialogs(cdp, label) {
  const state = await waitFor(cdp, js(() => ({
    openDialogs: activeDialogs().length,
    focusLabel: document.activeElement?.getAttribute('aria-label') ??
      document.activeElement?.textContent?.trim()?.slice(0, 80) ??
      null,
    overlay: errorOverlay(),
    consoleErrors: window.__smokeConsoleErrors ?? [],
  })), label)
  if (state.overlay) throw new Error(`Vite overlay detected: ${state.overlay.slice(0, 1000)}`)
  if (state.openDialogs !== 0) throw new Error(`${label}: dialog stayed open`)
  if (state.consoleErrors.length > 0) {
    throw new Error(`Console errors detected: ${state.consoleErrors.join('\n')}`)
  }
  return state
}

async function blockExternalTelegramScript(cdp) {
  await cdp.send('Network.enable')
  await cdp.send('Network.setBlockedURLs', {
    urls: ['https://telegram.org/*', 'http://telegram.org/*'],
  })
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
  }, text.toUpperCase()))
  if (!result.clicked) throw new Error(`Could not click "${text}": ${JSON.stringify(result)}`)
  await sleep(250)
}

async function clickButtonContaining(cdp, text) {
  const result = await evaluate(cdp, js((target) => {
    const button = visibleButtons().find((item) => item.innerText.trim().includes(target))
    if (!button) {
      return {
        clicked: false,
        buttons: visibleButtons().map((item) => item.innerText.trim()).filter(Boolean).slice(0, 80),
      }
    }
    button.click()
    return { clicked: true }
  }, text))
  if (!result.clicked) throw new Error(`Could not click button containing "${text}": ${JSON.stringify(result)}`)
  await sleep(250)
}

async function clickAria(cdp, label) {
  const result = await evaluate(cdp, js((target) => {
    const button = visibleButtons().find((item) => item.getAttribute('aria-label') === target)
    if (!button) {
      return {
        clicked: false,
        buttons: visibleButtons().map((item) => ({
          aria: item.getAttribute('aria-label'),
          text: item.innerText.trim(),
        })).slice(0, 80),
      }
    }
    button.click()
    return { clicked: true }
  }, label))
  if (!result.clicked) throw new Error(`Could not click aria "${label}": ${JSON.stringify(result)}`)
  await sleep(250)
}

async function key(cdp, keyName, code = keyName, which = 0) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: keyName,
    code,
    windowsVirtualKeyCode: which,
    nativeVirtualKeyCode: which,
  })
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: keyName,
    code,
    windowsVirtualKeyCode: which,
    nativeVirtualKeyCode: which,
  })
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
  const helpers = `
    function activeDialogs() {
      return Array.from(document.querySelectorAll('[role="dialog"]')).filter((dialog) =>
        dialog.getAttribute('aria-modal') === 'true' &&
        dialog.getAttribute('aria-hidden') !== 'true')
    }
    function errorOverlay() {
      return document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]')?.textContent ?? null
    }
    function visibleButtons() {
      return Array.from(document.querySelectorAll('button')).filter((button) => {
        const rect = button.getBoundingClientRect()
        const style = getComputedStyle(button)
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
      })
    }
  `
  return `(() => {${helpers}; return (${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(',')})})()`
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
