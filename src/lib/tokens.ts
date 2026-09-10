import { create } from 'zustand'
import { telegramUserId } from './tma'

const API_BASE = (import.meta.env.VITE_AI_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''
const BALANCE_CACHE_VERSION = 1

type BalanceCache = {
  v: number
  balance: number
  unlimited: boolean
  startingBonus: number
  updatedAt: number
}

function getInitData(): string {
  if (typeof window === 'undefined') return ''
  return window.Telegram?.WebApp?.initData ?? ''
}

function balanceCacheKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:ai-balance` : 'zhvusha:anon:ai-balance'
}

function loadBalanceCache(): BalanceCache | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(balanceCacheKey())
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<BalanceCache>
    if (parsed.v !== BALANCE_CACHE_VERSION) return null
    if (typeof parsed.balance !== 'number' || !Number.isFinite(parsed.balance)) return null
    if (typeof parsed.startingBonus !== 'number' || !Number.isFinite(parsed.startingBonus)) return null
    return {
      v: BALANCE_CACHE_VERSION,
      balance: parsed.balance,
      unlimited: parsed.unlimited === true,
      startingBonus: parsed.startingBonus,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return null
  }
}

function saveBalanceCache(cache: Omit<BalanceCache, 'v' | 'updatedAt'>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(balanceCacheKey(), JSON.stringify({
      v: BALANCE_CACHE_VERSION,
      ...cache,
      updatedAt: Date.now(),
    }))
  } catch {
    /* storage disabled/quota — индикатор просто останется сетевым */
  }
}

/**
 * Стейт остатка AI-кредитов. Загружается лениво по первому требованию
 * (mount индикатора в SystemWindow). Обновляется после каждого AI-вызова —
 * parse-food возвращает актуальный balance в body.
 */
type BalanceState = {
  balance: number | null
  unlimited: boolean
  startingBonus: number
  packages: AiCreditPackage[]
  loading: boolean
  packagesLoading: boolean
  /** Был ли уже хотя бы один успешный fetch — чтобы UI не моргал «—» при refetch. */
  loaded: boolean
  fetch: () => Promise<void>
  fetchPackages: () => Promise<void>
  /** Применить значение из ответа parse-food без round-trip. */
  applyFromResponse: (balance: number | undefined, unlimited?: boolean) => void
}

export type AiCreditPackage = {
  id: string
  title: string
  credits: number
  priceLabel: string
  paymentUrl: string | null
}

const initialBalanceCache = loadBalanceCache()

export const useBalanceStore = create<BalanceState>((set, get) => ({
  balance: initialBalanceCache?.balance ?? null,
  unlimited: initialBalanceCache?.unlimited ?? false,
  startingBonus: initialBalanceCache?.startingBonus ?? 10,
  packages: [],
  loading: false,
  packagesLoading: false,
  loaded: false,
  fetch: async () => {
    if (get().loading) return
    const hasDisplayedBalance = get().balance !== null
    set({ loading: true })
    try {
      const res = await fetch(`${API_BASE}/api/balance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getInitData() ? { 'x-init-data': getInitData() } : {}),
        },
        body: '{}',
      })
      if (!res.ok) {
        console.warn('[tokens] balance fetch failed:', res.status)
        return
      }
      const data = (await res.json()) as {
        balance: number
        startingBonus: number
        unlimited?: boolean
      }
      set({
        balance: data.balance,
        unlimited: data.unlimited === true,
        startingBonus: data.startingBonus,
        loaded: true,
      })
      saveBalanceCache({
        balance: data.balance,
        unlimited: data.unlimited === true,
        startingBonus: data.startingBonus,
      })
    } catch (e) {
      if (!hasDisplayedBalance) console.warn('[tokens] balance fetch error:', e)
    } finally {
      set({ loading: false })
    }
  },
  fetchPackages: async () => {
    if (get().packagesLoading || get().packages.length > 0) return
    set({ packagesLoading: true })
    try {
      const res = await fetch(`${API_BASE}/api/ai-credit-packages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getInitData() ? { 'x-init-data': getInitData() } : {}),
        },
        body: '{}',
      })
      if (!res.ok) {
        console.warn('[tokens] packages fetch failed:', res.status)
        return
      }
      const data = (await res.json()) as { packages: AiCreditPackage[] }
      set({ packages: data.packages })
    } catch (e) {
      console.warn('[tokens] packages fetch error:', e)
    } finally {
      set({ packagesLoading: false })
    }
  },
  applyFromResponse: (balance, unlimited) => {
    if (typeof balance === 'number') {
      const nextUnlimited = unlimited === true
      const startingBonus = get().startingBonus
      set({ balance, unlimited: nextUnlimited, loaded: true })
      saveBalanceCache({ balance, unlimited: nextUnlimited, startingBonus })
    }
  },
}))

/**
 * Удобный хелпер для UI — показывает «—» пока не загрузили,
 * число иначе. Не использует null, чтобы не плодить тернарники.
 */
export function formatBalance(balance: number | null, unlimited = false): string {
  if (unlimited) return '∞'
  if (balance === null) return '—'
  return String(balance)
}
