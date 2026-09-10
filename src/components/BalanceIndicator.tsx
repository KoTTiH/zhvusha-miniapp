import { useEffect } from 'react'
import { ZH, accentAlpha } from '../design/tokens'
import { formatBalance, useBalanceStore } from '../lib/tokens'

type Props = {
  onClick?: () => void
}

/**
 * Компактный индикатор остатка AI-кредитов в header SystemWindow.
 * Лениво грузит только баланс при первом mount; пакеты покупки грузятся
 * уже внутри BalanceSheet, когда пользователь реально открывает шторку.
 *
 * Клик — открывает BalanceSheet.
 */
export function BalanceIndicator({ onClick }: Props) {
  const balance = useBalanceStore((s) => s.balance)
  const unlimited = useBalanceStore((s) => s.unlimited)
  const fetchBalance = useBalanceStore((s) => s.fetch)

  useEffect(() => {
    // Ошибка запроса не должна повторно запускать эффект через loading.
    if (!useBalanceStore.getState().loaded) void fetchBalance()
  }, [fetchBalance])

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={
        unlimited
          ? 'AI-кредиты безлимитны для разработчика'
          : `осталось ${formatBalance(balance)} AI-кредитов`
      }
      style={{
        all: 'unset',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        padding: '3px 8px',
        minWidth: 42,
        minHeight: 20,
        boxSizing: 'border-box',
        borderRadius: 7,
        border: `1px solid ${accentAlpha(unlimited ? 0.55 : 0.35)}`,
        background: unlimited
          ? `linear-gradient(135deg, ${accentAlpha(0.22)}, rgba(18,23,36,0.88) 48%, ${accentAlpha(0.12)})`
          : accentAlpha(0.1),
        boxShadow: unlimited
          ? `0 0 0 1px ${accentAlpha(0.14)} inset, 0 0 18px ${accentAlpha(0.28)}`
          : undefined,
        fontFamily: ZH.mono,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.12em',
        color: ZH.accent,
      }}
    >
      <TokenGlyph />
      <span
        style={{
          minWidth: 14,
          textAlign: 'center',
          fontSize: unlimited ? 15 : undefined,
          lineHeight: 1,
        }}
      >
        {formatBalance(balance, unlimited)}
      </span>
    </button>
  )
}

function TokenGlyph() {
  return (
    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path
        d="M6 1.5L10.5 6L6 10.5L1.5 6L6 1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
