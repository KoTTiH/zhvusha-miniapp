/**
 * Лог трат AI-роутов. Пишется одной строкой в stdout — Vercel-логи хранят его
 * как обычный serverless log entry. Грепается по тегу `[usage]`.
 *
 * Формат строки:
 *   [usage] route=parse-food user=12345 model=<model-id> in=1200 out=350 ws=2 cacheR=0 cost=$0.00295
 *
 * Цены актуальны на 2026-04; при смене тарифов провайдера обновить PRICE_PER_MTOK
 * (миллион токенов) и WEB_SEARCH_PRICE_PER_1K. Точные суммы надо сверять с
 * биллингом — здесь задача дать порядок и тренд, не копейка-в-копейку.
 */

import { PRICE_PER_MTOK } from './modelIds.js'

// Provider-side web search — $10 за 1000 поисков, если будущий провайдер включит tool use.
const WEB_SEARCH_PRICE_PER_1K = 10

// Cache read считаем как 10% от input-стоимости. Учитываем, даже если сейчас
// кеш не используем, — чтобы при внедрении prompt caching цифры не «поехали».
const CACHE_READ_DISCOUNT = 0.1

export type UsageInfo = {
  route: string
  userId: number | null
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  webSearches?: number
}

export function logUsage(u: UsageInfo): void {
  const rate = PRICE_PER_MTOK[u.model] ?? { input: 0, output: 0 }
  const inputCost = (u.inputTokens / 1_000_000) * rate.input
  const outputCost = (u.outputTokens / 1_000_000) * rate.output
  const cacheCost = u.cacheReadTokens
    ? (u.cacheReadTokens / 1_000_000) * rate.input * CACHE_READ_DISCOUNT
    : 0
  const searchCost = u.webSearches ? (u.webSearches / 1000) * WEB_SEARCH_PRICE_PER_1K : 0
  const total = inputCost + outputCost + cacheCost + searchCost

  const wsPart = u.webSearches ? ` ws=${u.webSearches}` : ''
  const cachePart = u.cacheReadTokens ? ` cacheR=${u.cacheReadTokens}` : ''

  console.log(
    '[usage] route=%s user=%s model=%s in=%d out=%d%s%s cost=$%s',
    u.route,
    u.userId ?? 'anon',
    u.model,
    u.inputTokens,
    u.outputTokens,
    wsPart,
    cachePart,
    total.toFixed(6),
  )
}
