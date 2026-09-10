import { getStorageKind, type StorageKind } from './storage'
import { isInsideTelegram } from './tma'

export type DataStorageTone = 'primary' | 'fallback' | 'scope' | 'export'

export type DataStorageRow = {
  tone: DataStorageTone
  label: string
  text: string
}

export type DataStorageStatus = {
  kind: StorageKind
  title: string
  summary: string
  rows: readonly DataStorageRow[]
}

export function currentDataStorageStatus(): DataStorageStatus {
  const kind = getStorageKind()
  return {
    kind,
    title: 'Где хранятся данные',
    summary: storageSummary(kind),
    rows: [
      {
        tone: 'primary',
        label: 'основное',
        text: storagePrimaryText(kind),
      },
      {
        tone: 'fallback',
        label: 'fallback',
        text: 'Telegram CloudStorage и localStorage остаются резервом и источником ленивого переноса старых записей',
      },
      {
        tone: 'scope',
        label: 'область',
        text: storageScopeText(),
      },
      {
        tone: 'export',
        label: 'копия',
        text: 'JSON-экспорт собирается через текущие storage-адаптеры и не содержит сырой Telegram id',
      },
    ] as const,
  }
}

function storageSummary(kind: StorageKind): string {
  if (kind === 'postgres') {
    return 'Сейчас дневник синхронизируется через серверное хранилище приложения.'
  }
  if (kind === 'telegram') {
    return 'Сейчас приложение использует Telegram CloudStorage как fallback-хранилище.'
  }
  return 'Сейчас данные лежат только в localStorage этого браузера.'
}

function storagePrimaryText(kind: StorageKind): string {
  if (kind === 'postgres') {
    return 'еда, вода, заметки, продукты, блюда, recent, цели и day meta пишутся через serverless API'
  }
  if (kind === 'telegram') {
    return 'записи пишутся в Telegram CloudStorage текущего аккаунта, если основной API недоступен'
  }
  return 'записи пишутся в localStorage текущего браузера; другой браузер их не увидит'
}

function storageScopeText(): string {
  return isInsideTelegram()
    ? 'данные привязаны к текущему Telegram-аккаунту; локальные fallback-ключи изолированы по пользователю'
    : 'вне Telegram используется anon-область localStorage для разработки и ручной проверки UI'
}
