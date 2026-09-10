import { useEffect } from 'react'
import { ZH, accentAlpha, mixAlpha } from '../design/tokens'
import {
  AI_CREDIT_FREE_FLOWS,
  AI_CREDIT_PAID_UNIT,
  AI_CREDIT_POLICY_ROWS,
  AI_CREDIT_REFUND_NOTICE,
  aiCreditSummary,
  type AiCreditPolicyTone,
} from '../lib/aiCreditPolicy'
import { formatBalance, useBalanceStore, type AiCreditPackage } from '../lib/tokens'
import { BottomSheet } from './BottomSheet'

type Props = {
  open: boolean
  onClose: () => void
  /** Если true — заголовок и текст подчёркивают, что AI-кредиты кончились. */
  exhausted?: boolean
}

const FALLBACK_PACKAGES: AiCreditPackage[] = [
  {
    id: 'ai30',
    title: '30 AI-кредитов',
    credits: 30,
    priceLabel: '199 ₽',
    paymentUrl: null,
  },
  {
    id: 'ai100',
    title: '100 AI-кредитов',
    credits: 100,
    priceLabel: '599 ₽',
    paymentUrl: null,
  },
  {
    id: 'ai300',
    title: '300 AI-кредитов',
    credits: 300,
    priceLabel: '1490 ₽',
    paymentUrl: null,
  },
] as const

/**
 * Шторка с балансом AI-кредитов. В UI не используем слово «токены»:
 * пользователь покупает понятные AI-кредиты для распознавания еды.
 *
 * Используется в двух режимах:
 * 1. Просто посмотреть баланс (клик по индикатору) — exhausted=false.
 * 2. Реакция на 'insufficient-tokens' от AI-роута — exhausted=true,
 *    автооткрытие из AddEntrySheet/voice.
 */
export function BalanceSheet({ open, onClose, exhausted = false }: Props) {
  const balance = useBalanceStore((s) => s.balance)
  const unlimited = useBalanceStore((s) => s.unlimited)
  const startingBonus = useBalanceStore((s) => s.startingBonus)
  const packages = useBalanceStore((s) => s.packages)
  const fetchBalance = useBalanceStore((s) => s.fetch)
  const fetchPackages = useBalanceStore((s) => s.fetchPackages)
  const visiblePackages = packages.length > 0 ? packages : FALLBACK_PACKAGES

  useEffect(() => {
    if (!open) return
    // Повторяем неудачный запрос при открытии шторки, а не при смене loading.
    const state = useBalanceStore.getState()
    if (!state.loaded) void fetchBalance()
    if (!state.unlimited) void fetchPackages()
  }, [open, fetchBalance, fetchPackages])

  return (
    <BottomSheet open={open} onClose={onClose} title="AI-кредиты">
      <div style={{ padding: '4px 4px 32px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div
          style={{
            padding: '20px 16px',
            borderRadius: 14,
            background: unlimited
              ? `linear-gradient(135deg, ${accentAlpha(0.18)}, rgba(18,23,36,0.9) 50%, ${accentAlpha(0.08)})`
              : accentAlpha(exhausted ? 0.06 : 0.08),
            border: `1px solid ${accentAlpha(unlimited ? 0.5 : exhausted ? 0.2 : 0.3)}`,
            boxShadow: unlimited
              ? `0 0 0 1px ${accentAlpha(0.14)} inset, 0 0 28px ${accentAlpha(0.24)}`
              : undefined,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: ZH.mono,
              fontSize: 10,
              letterSpacing: '0.2em',
              color: ZH.textFaint,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            AI-кредитов осталось
          </div>
          <div
            style={{
              fontSize: unlimited ? 46 : 36,
              fontWeight: 600,
              color: exhausted && !unlimited ? ZH.textDim : ZH.accent,
              lineHeight: 1,
              letterSpacing: 0,
            }}
          >
            {formatBalance(balance, unlimited)}
          </div>
        </div>

        {unlimited ? (
          <div
            style={{
              fontSize: 13,
              color: ZH.textDim,
              lineHeight: 1.55,
              padding: '0 4px',
            }}
          >
            Для этого аккаунта включён режим разработчика: первичные AI-разборы
            не списывают AI-кредиты. Покупка кредитов не нужна. {AI_CREDIT_FREE_FLOWS}
          </div>
        ) : exhausted ? (
          <div
            style={{
              fontSize: 14,
              color: ZH.textDim,
              lineHeight: 1.55,
              padding: '0 4px',
            }}
          >
            AI-кредиты закончились. Дневник, календарь, заметки и ручной ввод остаются
            бесплатными. {AI_CREDIT_PAID_UNIT} Чтобы снова распознавать еду по фото,
            голосу или тексту, пополни AI-кредиты.
          </div>
        ) : (
          <div
            style={{
              fontSize: 13,
              color: ZH.textDim,
              lineHeight: 1.55,
              padding: '0 4px',
            }}
          >
            {aiCreditSummary(startingBonus)}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div
            style={{
              fontFamily: ZH.mono,
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: ZH.textFaint,
              padding: '0 4px',
            }}
          >
            что влияет на баланс
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {AI_CREDIT_POLICY_ROWS.map((row, index) => (
              <PolicyRow key={`${row.tone}_${index}`} tone={row.tone} label={row.label}>
                {row.text}
              </PolicyRow>
            ))}
          </div>
          <div style={{ padding: '0 4px', fontSize: 12, lineHeight: 1.45, color: ZH.textFaint }}>
            {AI_CREDIT_REFUND_NOTICE}
          </div>
        </div>
        {!unlimited && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visiblePackages.map((pack) => (
              <button
                key={pack.id}
                type="button"
                onClick={() => {
                  if (pack.paymentUrl) openPaymentUrl(pack.paymentUrl)
                }}
                disabled={!pack.paymentUrl}
                style={{
                  all: 'unset',
                  cursor: pack.paymentUrl ? 'pointer' : 'not-allowed',
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `1px solid ${accentAlpha(pack.paymentUrl ? 0.38 : 0.22)}`,
                  background: accentAlpha(pack.paymentUrl ? 0.08 : 0.05),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  opacity: pack.paymentUrl ? 1 : 0.7,
                }}
              >
                <span
                  style={{
                    fontFamily: ZH.mono,
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: ZH.accent,
                    textShadow: `0 0 10px ${accentAlpha(0.45)}`,
                  }}
                >
                  {pack.title}
                </span>
                <span style={{ fontSize: 13, color: ZH.textDim }}>{pack.priceLabel}</span>
              </button>
            ))}
          </div>
        )}
        {exhausted && !unlimited && (
          <button
            type="button"
            onClick={onClose}
            style={{
              all: 'unset',
              cursor: 'pointer',
              padding: '10px 12px',
              borderRadius: 10,
              textAlign: 'center',
              border: `1px solid ${ZH.line}`,
              color: ZH.textDim,
              fontSize: 13,
            }}
          >
            Ввести еду вручную бесплатно
          </button>
        )}
      </div>
    </BottomSheet>
  )
}

function PolicyRow({
  tone,
  label,
  children,
}: {
  tone: AiCreditPolicyTone
  label: string
  children: string
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '84px 1fr',
        gap: 10,
        alignItems: 'center',
        padding: '9px 10px',
        borderRadius: 10,
        border: `1px solid ${policyBorder(tone)}`,
        background: policyBackground(tone),
      }}
    >
      <span
        style={{
          fontFamily: ZH.mono,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: policyColor(tone),
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 12, lineHeight: 1.4, color: ZH.textDim }}>
        {children}
      </span>
    </div>
  )
}

function policyColor(tone: AiCreditPolicyTone): string {
  if (tone === 'paid') return ZH.accent
  if (tone === 'refund') return ZH.warn
  return ZH.textDim
}

function policyBorder(tone: AiCreditPolicyTone): string {
  if (tone === 'paid') return accentAlpha(0.28)
  if (tone === 'refund') return mixAlpha(ZH.warn, 28)
  return ZH.line
}

function policyBackground(tone: AiCreditPolicyTone): string {
  if (tone === 'paid') return accentAlpha(0.06)
  if (tone === 'refund') return mixAlpha(ZH.warn, 6)
  return ZH.panel
}

function openPaymentUrl(url: string): void {
  if (typeof window === 'undefined') return
  const webApp = window.Telegram?.WebApp as
    | {
        openTelegramLink?: (url: string) => void
        openLink?: (url: string) => void
      }
    | undefined
  if (url.startsWith('https://t.me/') && webApp?.openTelegramLink) {
    webApp.openTelegramLink(url)
    return
  }
  if (webApp?.openLink) {
    webApp.openLink(url)
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}
