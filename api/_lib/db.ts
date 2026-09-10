import { Pool, type PoolClient } from 'pg'

/**
 * Postgres connection pool. Один pool на всё время жизни serverless-инстанса —
 * Vercel Fluid Compute переиспользует контейнеры, поэтому ленивая инициализация
 * + reuse экономит коннекты к Neon (там лимит подключений мал).
 *
 * DATABASE_URL ожидает форму postgres://user:pass@host/db?sslmode=require
 * (Neon выдаёт именно её). При отсутствии переменной getPool() кидает —
 * fail-fast, чтобы не отвечать 200 без записи в БД.
 */

let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  pool = new Pool({
    connectionString: url,
    // Neon-специфика: один pool-коннект на serverless-инстанс хватает.
    // Лимит 5 — запас для случаев параллельных подзапросов внутри одного хендлера.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  })
  return pool
}

/**
 * Хелпер для одиночных запросов. Для транзакций — withTx().
 */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params)
  return result.rows
}

/**
 * Транзакция с автоматическим BEGIN/COMMIT/ROLLBACK. Возвращает результат
 * колбэка. При ошибке внутри — ROLLBACK и проброс ошибки наружу.
 */
export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}
