export type AiCreditPolicyTone = 'paid' | 'free' | 'refund'

export type AiCreditPolicyRow = {
  tone: AiCreditPolicyTone
  label: string
  text: string
}

export const AI_CREDIT_PAID_UNIT =
  'Один первичный ввод еды или быстрый ввод всего дня стоит 1 AI-кредит.'

export const AI_CREDIT_FREE_FLOWS =
  'Уточнения результата, транскрипция аудио, Жвуша-советник, исправления, календарь, заметки и ручной ввод бесплатны.'

export const AI_CREDIT_REFUND_NOTICE =
  'Если AI не вернул пригодный результат, списанный AI-кредит возвращается.'

export const AI_CREDIT_POLICY_ROWS: readonly AiCreditPolicyRow[] = [
  {
    tone: 'paid',
    label: '1 кредит',
    text: 'первичный разбор еды: текст, фото или голос после транскрипции',
  },
  {
    tone: 'paid',
    label: '1 кредит',
    text: 'быстрый ввод всего дня: еда, вода и заметки одним AI-разбором',
  },
  {
    tone: 'free',
    label: '0 кредитов',
    text: 'уточнения уже оплаченного результата, Жвуша-советник, ручной ввод, календарь и заметки',
  },
  {
    tone: 'free',
    label: '0 кредитов',
    text: 'транскрипция аудио до AI-разбора',
  },
  {
    tone: 'refund',
    label: 'возврат',
    text: 'сбой AI, пустой или непригодный результат',
  },
] as const

export function aiCreditSummary(startingBonus: number): string {
  return `${AI_CREDIT_PAID_UNIT} Стартовый бонус — ${startingBonus} AI-кредитов. ${AI_CREDIT_FREE_FLOWS}`
}
