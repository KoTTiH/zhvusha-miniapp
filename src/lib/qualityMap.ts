export type QualityMapTone = 'data' | 'ai' | 'food' | 'ui' | 'gate'

export type QualityMapRow = {
  tone: QualityMapTone
  label: string
  command: string
  text: string
}

export const QUALITY_MAP_TITLE = 'Карта проверок'

export const QUALITY_MAP_SUMMARY =
  'Локальные контракты, которые держат ключевые поверхности приложения. Команды здесь не запускаются.'

export const QUALITY_MAP_ROWS: readonly QualityMapRow[] = [
  {
    tone: 'food',
    label: 'еда',
    command: 'pnpm nutrition:check',
    text: 'уверенность AI, основание порции и source-line не исчезают из UI еды',
  },
  {
    tone: 'food',
    label: 'штрихкод',
    command: 'pnpm barcode:check',
    text: 'EAN, UPC, GTIN-14, GS1 Data Matrix, GS1-128 и FNC1 нормализуются одним кодом',
  },
  {
    tone: 'data',
    label: 'день',
    command: 'pnpm day-voice:check',
    text: 'быстрая запись дня сохраняет еду, воду, заметки и пометку примерного AI-дня',
  },
  {
    tone: 'ai',
    label: 'стоимость',
    command: 'pnpm ai-credit:check',
    text: 'первичный AI-разбор списывает 1 кредит, уточнения и транскрипция остаются бесплатными',
  },
  {
    tone: 'ai',
    label: 'AI-данные',
    command: 'pnpm ai-privacy:check',
    text: 'граница внешних AI-данных, audit scope и отсутствие сырых фото в журнале закреплены',
  },
  {
    tone: 'ai',
    label: 'Жвуша',
    command: 'pnpm assistant:check',
    text: 'вкладка советника, no-diagnosis copy, подтверждаемая память и private photo boundary закреплены',
  },
  {
    tone: 'data',
    label: 'экспорт',
    command: 'pnpm data-export:check',
    text: 'JSON-экспорт, двухшаговый импорт, backup-статус и целостность данных держатся вместе',
  },
  {
    tone: 'data',
    label: 'storage',
    command: 'pnpm storage-status:check',
    text: 'панель текущего хранилища читает тот же backend, что и export/import',
  },
  {
    tone: 'ui',
    label: 'виджеты',
    command: 'pnpm widgets:check',
    text: 'главная не включает скрытые виджеты и показывает нижние быстрые кнопки только после выбора',
  },
  {
    tone: 'ui',
    label: 'быстро UI',
    command: 'pnpm smoke:smart-history',
    text: 'browser-smoke проходит убрать из быстро, журнал быстро и отмену действия',
  },
  {
    tone: 'ui',
    label: 'данные UI',
    command: 'pnpm smoke:data-export',
    text: 'browser-smoke проходит вкладку данных, JSON import/export, fingerprint и grouped integrity diagnostics',
  },
  {
    tone: 'ui',
    label: 'доступ',
    command: 'pnpm accessibility:check',
    text: 'диалоги, фокус и настройка виджетов с клавиатуры закреплены локальным контрактом',
  },
  {
    tone: 'ui',
    label: 'доступ UI',
    command: 'pnpm smoke:accessibility',
    text: 'browser-smoke проходит keyboard edit mode, focus trap, Escape и возврат фокуса',
  },
  {
    tone: 'gate',
    label: 'bundle',
    command: 'pnpm bundle:check',
    text: 'production dist держит стартовый JS и ленивые экраны вне первого modulepreload',
  },
  {
    tone: 'gate',
    label: 'gate',
    command: 'pnpm quality-gate:check',
    text: 'package scripts, pre-commit hook и GitHub Actions не теряют обязательные проверки',
  },
] as const
