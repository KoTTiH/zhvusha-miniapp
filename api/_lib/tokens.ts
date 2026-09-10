import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PoolClient } from 'pg'
import { query, withTx } from './db.js'

/**
 * Стартовый бонус новому юзеру. Намеренно мал (10 AI-кредитов = ~1-2 фото или
 * 5-10 текстовых распознаваний) — на запуске бюджет AI ограничен, бонус
 * закрывает «пощупать», но не позволяет регулярно пользоваться без покупки.
 * Подробности — memory project_token_economy.md.
 */
export const STARTING_BONUS = 10
export const UNLIMITED_BALANCE = 1_000_000_000

export type TxKind =
  | 'parse-food'
  | 'starting-bonus'
  | 'purchase'
  | 'purchase-refund'
  | 'refund'
  | 'admin-grant'

export class InsufficientTokensError extends Error {
  readonly balance: number
  constructor(balance: number) {
    super('insufficient-tokens')
    this.name = 'InsufficientTokensError'
    this.balance = balance
  }
}

export type AiInputType = 'photo' | 'voice' | 'text' | 'mixed'
export type AiAnalysisStatus = 'success' | 'failed' | 'refunded'

export type RecordAiAnalysisInput = {
  userId: number
  parentAnalysisId?: number | null
  inputType: AiInputType
  modelProvider: string
  modelName: string
  promptVersion: string
  rawInputText?: string | null
  resultJson?: unknown
  confidence?: number | null
  status: AiAnalysisStatus
}

export type CreditPurchaseInput = {
  userId: number
  provider: string
  externalId: string
  amountMinor: number
  currency: string
  credits: number
  meta?: Record<string, unknown>
}

function developerHash(userId: number, secret: string): string {
  return createHmac('sha256', secret).update(String(userId)).digest('hex')
}

function safeHexEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
}

export function hasUnlimitedAiCredits(userId: number | null | undefined): boolean {
  if (typeof userId !== 'number') return false
  const secret = process.env.DEVELOPER_ALLOWLIST_SECRET ?? ''
  const rawHashes = process.env.DEVELOPER_TELEGRAM_USER_ID_HASHES ?? ''
  if (!secret || !rawHashes.trim()) return false
  const current = developerHash(userId, secret)
  return rawHashes.split(/[,\s]+/).some((hash) => safeHexEqual(hash.trim(), current))
}

/**
 * Получить баланс юзера. Если строки нет — возвращает null
 * (юзер ещё не инициализирован, ensureUser его создаст).
 */
export async function getBalance(userId: number): Promise<number | null> {
  if (hasUnlimitedAiCredits(userId)) return UNLIMITED_BALANCE
  const rows = await query<{ balance: number }>(
    'SELECT balance FROM user_balance WHERE user_id = $1',
    [userId],
  )
  return rows.length > 0 ? rows[0].balance : null
}

/**
 * Создать строку юзера со стартовым бонусом, если ещё не существует.
 * Идемпотентно: повторный вызов ничего не делает.
 * Возвращает финальный баланс.
 */
export async function ensureUser(userId: number): Promise<number> {
  if (hasUnlimitedAiCredits(userId)) return UNLIMITED_BALANCE
  return withTx(async (client) => {
    const existing = await client.query<{ balance: number }>(
      'SELECT balance FROM user_balance WHERE user_id = $1',
      [userId],
    )
    if (existing.rows.length > 0) return existing.rows[0].balance

    await client.query(
      'INSERT INTO user_balance (user_id, balance) VALUES ($1, $2)',
      [userId, STARTING_BONUS],
    )
    await client.query(
      `INSERT INTO token_transactions (user_id, delta, kind, meta)
       VALUES ($1, $2, 'starting-bonus', $3)`,
      [userId, STARTING_BONUS, JSON.stringify({ reason: 'first-login' })],
    )
    return STARTING_BONUS
  })
}

/**
 * Атомарное списание amount токенов. Возвращает финальный баланс.
 * Бросает InsufficientTokensError если на счету < amount (без изменений в БД).
 *
 * Безопасно от гонок: UPDATE WHERE balance >= amount гарантирует, что
 * параллельный второй запрос увидит уже уменьшенный баланс и упадёт
 * (или дождётся row-lock).
 */
export async function debit(
  userId: number,
  amount: number,
  kind: TxKind,
  meta?: Record<string, unknown>,
): Promise<number> {
  if (amount <= 0) throw new Error('debit amount must be positive')
  if (hasUnlimitedAiCredits(userId)) return UNLIMITED_BALANCE
  return withTx(async (client) => {
    const updated = await client.query<{ balance: number }>(
      `UPDATE user_balance
         SET balance = balance - $2,
             updated_at = now()
       WHERE user_id = $1 AND balance >= $2
       RETURNING balance`,
      [userId, amount],
    )
    if (updated.rows.length === 0) {
      const current = await client.query<{ balance: number }>(
        'SELECT balance FROM user_balance WHERE user_id = $1',
        [userId],
      )
      throw new InsufficientTokensError(current.rows[0]?.balance ?? 0)
    }
    await insertTx(client, userId, -amount, kind, meta)
    return updated.rows[0].balance
  })
}

/**
 * Начисление amount токенов. Используется для refund (при ошибке AI),
 * purchase (после успешного платежа), admin-grant (ручная выдача).
 * Возвращает финальный баланс.
 *
 * Если строки юзера ещё нет — создаёт (без стартового бонуса). Это покрывает
 * крайний случай «успешный платёж до первого ensureUser» — деньги не теряются.
 */
export async function credit(
  userId: number,
  amount: number,
  kind: TxKind,
  meta?: Record<string, unknown>,
): Promise<number> {
  if (amount <= 0) throw new Error('credit amount must be positive')
  if (hasUnlimitedAiCredits(userId)) return UNLIMITED_BALANCE
  return withTx(async (client) => {
    const updated = await client.query<{ balance: number }>(
      `INSERT INTO user_balance (user_id, balance)
            VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
            SET balance = user_balance.balance + EXCLUDED.balance,
                updated_at = now()
       RETURNING balance`,
      [userId, amount],
    )
    await insertTx(client, userId, amount, kind, meta)
    return updated.rows[0].balance
  })
}

/**
 * Идемпотентное начисление купленных AI-кредитов. Tribute ретраит webhooks,
 * поэтому сначала вставляем платеж с UNIQUE(provider, external_id); если
 * запись уже есть — повторно баланс не трогаем.
 */
export async function creditPurchaseOnce(
  input: CreditPurchaseInput,
): Promise<{ balance: number; credited: boolean }> {
  if (input.credits <= 0) throw new Error('purchase credits must be positive')
  return withTx(async (client) => {
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO payments (
         provider,
         external_id,
         user_id,
         amount_minor,
         currency,
         tokens,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'succeeded')
       ON CONFLICT (provider, external_id) DO NOTHING
       RETURNING id`,
      [
        input.provider,
        input.externalId,
        input.userId,
        input.amountMinor,
        input.currency,
        input.credits,
      ],
    )
    if (inserted.rows.length === 0) {
      const current = await client.query<{ balance: number }>(
        'SELECT balance FROM user_balance WHERE user_id = $1',
        [input.userId],
      )
      return { balance: current.rows[0]?.balance ?? 0, credited: false }
    }

    const updated = await client.query<{ balance: number }>(
      `INSERT INTO user_balance (user_id, balance)
            VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
            SET balance = user_balance.balance + EXCLUDED.balance,
                updated_at = now()
       RETURNING balance`,
      [input.userId, input.credits],
    )
    await insertTx(client, input.userId, input.credits, 'purchase', {
      provider: input.provider,
      externalId: input.externalId,
      paymentId: inserted.rows[0].id,
      ...(input.meta ?? {}),
    })
    return { balance: updated.rows[0].balance, credited: true }
  })
}

/**
 * Запись факта AI-анализа. Нужна для аудита, аналитики и бесплатных уточнений:
 * refine-запрос разрешаем только если parentAnalysisId принадлежит этому юзеру.
 */
export async function recordAiAnalysis(input: RecordAiAnalysisInput): Promise<number> {
  const rows = await query<{ id: string }>(
    `INSERT INTO ai_analyses (
       user_id,
       parent_analysis_id,
       input_type,
       model_provider,
       model_name,
       prompt_version,
       raw_input_text,
       result_json,
       confidence,
       status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      input.userId,
      input.parentAnalysisId ?? null,
      input.inputType,
      input.modelProvider,
      input.modelName,
      input.promptVersion,
      input.rawInputText ?? null,
      input.resultJson === undefined ? null : JSON.stringify(input.resultJson),
      input.confidence ?? null,
      input.status,
    ],
  )
  return Number(rows[0].id)
}

export async function assertCanRefine(userId: number, parentAnalysisId: number): Promise<void> {
  const rows = await query<{ id: string }>(
    `SELECT id
       FROM ai_analyses
      WHERE id = $1
        AND user_id = $2
        AND status = 'success'
      LIMIT 1`,
    [parentAnalysisId, userId],
  )
  if (rows.length === 0) throw new Error('invalid-refine-parent')
}

async function insertTx(
  client: PoolClient,
  userId: number,
  delta: number,
  kind: TxKind,
  meta?: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO token_transactions (user_id, delta, kind, meta)
     VALUES ($1, $2, $3, $4)`,
    [userId, delta, kind, meta ? JSON.stringify(meta) : null],
  )
}
