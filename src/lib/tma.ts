import { backButton, init, miniApp, retrieveLaunchParams, themeParams, viewport } from '@tma.js/sdk-react'

let initialized = false

export async function initTelegram(): Promise<boolean> {
  if (initialized) return true
  try {
    init()
    await safe(() => themeParams.mount())
    trySync(() => themeParams.bindCssVars())
    await safe(() => miniApp.mount())
    trySync(() => miniApp.bindCssVars())
    await safe(() => viewport.mount())
    trySync(() => backButton.mount())
    trySync(() => miniApp.ready())
    trySync(() => window.Telegram?.WebApp?.disableVerticalSwipes?.())
    initialized = true
    return true
  } catch {
    initialized = false
    return false
  }
}

async function safe(fn: () => unknown): Promise<void> {
  try {
    const maybe = fn()
    if (maybe && typeof (maybe as Promise<unknown>).then === 'function') {
      await (maybe as Promise<unknown>)
    }
  } catch {
    /* ignore — running outside Telegram or component not available */
  }
}

function trySync(fn: () => unknown): void {
  try {
    fn()
  } catch {
    /* ignore */
  }
}

export function telegramUserId(): number | undefined {
  try {
    const lp = retrieveLaunchParams()
    return lp.tgWebAppData?.user?.id
  } catch {
    return undefined
  }
}

export function telegramUserName(): string {
  try {
    const u = retrieveLaunchParams().tgWebAppData?.user
    if (u?.username) return `@${u.username}`
    if (u?.first_name) return u.first_name
  } catch {
    /* outside Telegram */
  }
  return 'anon'
}

export function subscribeBackButton(handler: () => void): () => void {
  let off: (() => void) | null = null
  try {
    backButton.show()
    off = backButton.onClick(handler)
  } catch {
    /* SDK недоступен — вне Telegram */
  }
  return () => {
    try { off?.() } catch { /* ignore */ }
    try { backButton.hide() } catch { /* ignore */ }
  }
}

export function isInsideTelegram(): boolean {
  return typeof window !== 'undefined'
    && typeof window.Telegram?.WebApp?.initData === 'string'
    && window.Telegram.WebApp.initData.length > 0
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string
        CloudStorage?: unknown
        disableVerticalSwipes?: () => void
        enableVerticalSwipes?: () => void
      }
    }
  }
}
