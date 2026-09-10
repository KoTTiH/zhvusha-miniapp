import { telegramUserId } from './tma'
import type { ZhvushaExport, ZhvushaImportSummary } from './dataExport'

export const DATA_BACKUP_STATUS_EVENT = 'zhvusha:data-backup-status'

export type DataBackupCounts = Pick<
  ZhvushaExport['counts'],
  'days' | 'foodEntries' | 'waterEntries' | 'notes' | 'foods' | 'meals' | 'widgets'
>

export type DataBackupImportSummary = Pick<
  ZhvushaImportSummary,
  'days' | 'foodEntries' | 'waterEntries' | 'notes' | 'foods' | 'meals' | 'widgets'
>

export type DataBackupStatus = {
  lastExportedAt: string | null
  lastExportFingerprint: string | null
  lastExportCounts: DataBackupCounts | null
  lastImportedAt: string | null
  lastImportFingerprint: string | null
  lastImportSummary: DataBackupImportSummary | null
}

function dataBackupStatusKey(): string {
  const uid = telegramUserId()
  return uid ? `zhvusha:u${uid}:data_backup_status` : 'zhvusha:anon:data_backup_status'
}

export function loadDataBackupStatus(): DataBackupStatus {
  if (typeof window === 'undefined') return emptyDataBackupStatus()
  try {
    const raw = window.localStorage.getItem(dataBackupStatusKey())
    if (!raw) return emptyDataBackupStatus()
    return normalizeDataBackupStatus(JSON.parse(raw) as unknown)
  } catch {
    return emptyDataBackupStatus()
  }
}

export function rememberDataExport(data: ZhvushaExport): DataBackupStatus {
  const next: DataBackupStatus = {
    ...loadDataBackupStatus(),
    lastExportedAt: data.exportedAt,
    lastExportFingerprint: data.fingerprint,
    lastExportCounts: pickExportCounts(data.counts),
  }
  saveDataBackupStatus(next)
  return next
}

export function rememberDataImport(
  summary: ZhvushaImportSummary,
  now = new Date(),
): DataBackupStatus {
  const next: DataBackupStatus = {
    ...loadDataBackupStatus(),
    lastImportedAt: now.toISOString(),
    lastImportFingerprint: summary.fingerprint,
    lastImportSummary: pickImportSummary(summary),
  }
  saveDataBackupStatus(next)
  return next
}

function saveDataBackupStatus(status: DataBackupStatus): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(dataBackupStatusKey(), JSON.stringify(status))
    window.dispatchEvent(new Event(DATA_BACKUP_STATUS_EVENT))
  } catch {
    /* статус копии не должен ломать сам экспорт */
  }
}

function emptyDataBackupStatus(): DataBackupStatus {
  return {
    lastExportedAt: null,
    lastExportFingerprint: null,
    lastExportCounts: null,
    lastImportedAt: null,
    lastImportFingerprint: null,
    lastImportSummary: null,
  }
}

function normalizeDataBackupStatus(input: unknown): DataBackupStatus {
  const raw = asRecord(input)
  if (!raw) return emptyDataBackupStatus()
  return {
    lastExportedAt: normalizeIsoDate(raw.lastExportedAt),
    lastExportFingerprint: normalizeFingerprint(raw.lastExportFingerprint),
    lastExportCounts: normalizeExportCounts(raw.lastExportCounts),
    lastImportedAt: normalizeIsoDate(raw.lastImportedAt),
    lastImportFingerprint: normalizeFingerprint(raw.lastImportFingerprint),
    lastImportSummary: normalizeImportSummary(raw.lastImportSummary),
  }
}

function pickExportCounts(counts: ZhvushaExport['counts']): DataBackupCounts {
  return {
    days: counts.days,
    foodEntries: counts.foodEntries,
    waterEntries: counts.waterEntries,
    notes: counts.notes,
    foods: counts.foods,
    meals: counts.meals,
    widgets: counts.widgets,
  }
}

function pickImportSummary(summary: ZhvushaImportSummary): DataBackupImportSummary {
  return {
    days: summary.days,
    foodEntries: summary.foodEntries,
    waterEntries: summary.waterEntries,
    notes: summary.notes,
    foods: summary.foods,
    meals: summary.meals,
    widgets: summary.widgets,
  }
}

function normalizeExportCounts(input: unknown): DataBackupCounts | null {
  const raw = asRecord(input)
  if (!raw) return null
  return {
    days: normalizeCount(raw.days),
    foodEntries: normalizeCount(raw.foodEntries),
    waterEntries: normalizeCount(raw.waterEntries),
    notes: normalizeCount(raw.notes),
    foods: normalizeCount(raw.foods),
    meals: normalizeCount(raw.meals),
    widgets: normalizeCount(raw.widgets),
  }
}

function normalizeImportSummary(input: unknown): DataBackupImportSummary | null {
  const raw = asRecord(input)
  if (!raw) return null
  return {
    days: normalizeCount(raw.days),
    foodEntries: normalizeCount(raw.foodEntries),
    waterEntries: normalizeCount(raw.waterEntries),
    notes: normalizeCount(raw.notes),
    foods: normalizeCount(raw.foods),
    meals: normalizeCount(raw.meals),
    widgets: normalizeCount(raw.widgets),
  }
}

function normalizeIsoDate(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const date = new Date(input)
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}

function normalizeFingerprint(input: unknown): string | null {
  return typeof input === 'string' && /^[0-9a-f]{8}$/.test(input)
    ? input
    : null
}

function normalizeCount(input: unknown): number {
  const n = Math.round(Number(input))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}
