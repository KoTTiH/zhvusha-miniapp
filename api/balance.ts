import { createRoute } from './_lib/handler.js'
import {
  ensureUser,
  getBalance,
  hasUnlimitedAiCredits,
  STARTING_BONUS,
  UNLIMITED_BALANCE,
} from './_lib/tokens.js'

type Input = Record<string, never>
type Output = { balance: number; startingBonus: number; unlimited?: boolean }

/**
 * Возвращает текущий баланс юзера. Если юзер новый — создаёт строку со
 * стартовым бонусом и возвращает его. Используется клиентом для отображения
 * индикатора баланса в SystemWindow.
 *
 * В dev (ALLOW_UNAUTH=1) userId=null → возвращаем 0 (UI показывает «—»).
 */
export default createRoute<Input, Output>(async ({ userId }) => {
  if (userId === null) {
    return { balance: 0, startingBonus: STARTING_BONUS }
  }
  if (hasUnlimitedAiCredits(userId)) {
    return { balance: UNLIMITED_BALANCE, startingBonus: STARTING_BONUS, unlimited: true }
  }
  const existing = await getBalance(userId)
  const balance = existing ?? (await ensureUser(userId))
  return { balance, startingBonus: STARTING_BONUS }
})
