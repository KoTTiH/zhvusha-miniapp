import { loadDataBackupStatus, type DataBackupStatus } from './dataBackupStatus'
import { currentDataStorageStatus } from './dataStorageStatus'

export type AppReadinessTone = 'ok' | 'warn' | 'info'

export type AppReadinessRow = {
  tone: AppReadinessTone
  label: string
  text: string
}

export type AppReadinessReport = {
  title: 'Паспорт готовности'
  summary: string
  rows: readonly AppReadinessRow[]
}

export function buildAppReadinessReport(
  backupStatus: DataBackupStatus = loadDataBackupStatus(),
  now: Date = new Date(),
): AppReadinessReport {
  const storage = currentDataStorageStatus()
  const backupAge = daysSince(backupStatus.lastExportedAt, now)
  const backupTone: AppReadinessTone = backupAge === null || backupAge > 14 ? 'warn' : 'ok'
  const fingerprintMatch = backupStatus.lastExportFingerprint !== null &&
    backupStatus.lastExportFingerprint === backupStatus.lastImportFingerprint
  const fingerprintMismatch = backupStatus.lastExportFingerprint !== null &&
    backupStatus.lastImportFingerprint !== null &&
    backupStatus.lastExportFingerprint !== backupStatus.lastImportFingerprint

  return {
    title: 'Паспорт готовности',
    summary: 'Быстрая локальная проверка без AI, без сетевых запросов и без записи данных.',
    rows: [
      {
        tone: storage.kind === 'local' ? 'info' : 'ok',
        label: 'хранилище',
        text: storage.kind === 'local'
          ? 'сейчас используется localStorage этого браузера'
          : `сейчас используется ${storage.kind}`,
      },
      {
        tone: backupTone,
        label: 'копия',
        text: backupAge === null
          ? 'JSON-экспорт ещё не собирался'
          : backupAge === 0
            ? 'JSON-экспорт был сегодня'
            : `JSON-экспорт был ${backupAge} дн. назад`,
      },
      {
        tone: backupStatus.lastImportedAt ? 'ok' : 'info',
        label: 'импорт',
        text: backupStatus.lastImportedAt
          ? 'последний импорт зафиксирован локально'
          : 'восстановление доступно как двухшаговый JSON-import',
      },
      {
        tone: fingerprintMismatch ? 'warn' : fingerprintMatch ? 'ok' : 'info',
        label: 'сверка',
        text: fingerprintMismatch
          ? 'последний импорт был из другого JSON-файла'
          : fingerprintMatch
            ? `последний импорт сверяется с копией ${backupStatus.lastExportFingerprint}`
            : 'сверки export/import по коду ещё не было',
      },
      {
        tone: 'ok',
        label: 'AI',
        text: 'проверка не запускает AI; граница AI-данных показана ниже',
      },
      {
        tone: localStorageReadable() ? 'ok' : 'warn',
        label: 'браузер',
        text: localStorageReadable()
          ? 'localStorage доступен для настроек, backup-статуса и fallback-ключей'
          : 'localStorage недоступен: часть локальных настроек может не сохраниться',
      },
    ] as const,
  }
}

function daysSince(value: string | null, now: Date): number | null {
  if (!value) return null
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return null
  return Math.max(0, Math.floor((now.getTime() - time) / 86_400_000))
}

function localStorageReadable(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return typeof window.localStorage.length === 'number'
  } catch {
    return false
  }
}
