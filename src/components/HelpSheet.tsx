import type { ReactNode } from 'react'
import { SysLabel } from '../design/primitives'
import { ZH, accentAlpha } from '../design/tokens'
import { BottomSheet } from './BottomSheet'

type Props = {
  open: boolean
  onClose: () => void
}

export function HelpSheet({ open, onClose }: Props) {
  return (
    <BottomSheet open={open} onClose={onClose} title="о приложении">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 20 }}>
        <section>
          <Paragraph tone="main">
            Жвуша помогает удерживать связь с тем, как на самом деле проходят твои дни.
          </Paragraph>
        </section>

        <section>
          <Paragraph>
            Обычный трекер быстро превращает жизнь в список требований: сколько сделал,
            сколько не сделал, какую серию сломал, до какой нормы не дотянул. В Жвуше
            день не получает оценку. Он просто остаётся таким, каким был.
          </Paragraph>
        </section>

        <section>
          <Paragraph>
            Ты можешь записать еду, заметку, событие, мысль или попытку. Можешь ничего
            не записывать. Пустой день — тоже часть карты.
          </Paragraph>
        </section>

        <section>
          <Paragraph>
            Главный принцип простой: приложение не должно понимать за тебя. Оно не
            говорит, что правильно, не мотивирует, не хвалит и не стыдит. Оно держит
            факты на месте, чтобы ты сам мог увидеть, что с тобой происходит.
          </Paragraph>
        </section>

        <section>
          <Paragraph>
            Здесь нет очков, уровней, серий и соревнования. Нет «надо» и «пора». Есть
            дни, записи и спокойная возможность посмотреть на них без шума.
          </Paragraph>
        </section>

        <section>
          <SysLabel color={ZH.textDim}>данные</SysLabel>
          <div style={{ marginTop: 8 }}>
            <Paragraph>
              Данные остаются у тебя. AI используется только там, где ты сам просишь
              разобрать еду по калориям. Он не делает выводов о тебе.
            </Paragraph>
          </div>
        </section>

        <section>
          <SysLabel color={ZH.textDim}>откуда это</SysLabel>
          <div style={{ marginTop: 8 }}>
            <Paragraph>
              Жвуша построена на философии Александра Фломастера: ошибок нет, есть
              попытки; осознание нельзя выдать извне; жизнь лучше видно по тому, что
              действительно было сделано.
            </Paragraph>
          </div>
        </section>

        <button
          type="button"
          onClick={onClose}
          style={{
            all: 'unset',
            cursor: 'pointer',
            padding: '14px 0',
            borderRadius: 12,
            textAlign: 'center',
            background: `linear-gradient(180deg, ${accentAlpha(0.8)}, ${accentAlpha(0.53)})`,
            border: `1px solid ${ZH.accent}`,
            boxShadow: `0 0 20px ${accentAlpha(0.35)}`,
          }}
        >
          <span
            style={{
              fontFamily: ZH.mono,
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: '0.22em',
              color: '#06131F',
              textTransform: 'uppercase',
            }}
          >
            закрыть
          </span>
        </button>
      </div>
    </BottomSheet>
  )
}

function Paragraph({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'main' | 'muted'
}) {
  return (
    <div
      style={{
        fontSize: tone === 'main' ? 14 : 13,
        color: tone === 'main' ? ZH.text : ZH.textDim,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  )
}
