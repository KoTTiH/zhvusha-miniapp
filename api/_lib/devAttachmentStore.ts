import { randomUUID } from 'node:crypto'

type DevAttachment = {
  buffer: Buffer
  mediaType: string
}

const DEV_ATTACHMENT_PREFIX = 'dev-memory://assistant/'

type GlobalWithDevAttachments = typeof globalThis & {
  __zhvushaDevAttachments?: Map<string, DevAttachment>
}

function store(): Map<string, DevAttachment> {
  const g = globalThis as GlobalWithDevAttachments
  if (!g.__zhvushaDevAttachments) g.__zhvushaDevAttachments = new Map()
  return g.__zhvushaDevAttachments
}

export function canUseDevAttachmentStore(): boolean {
  return (
    process.env.ALLOW_UNAUTH === '1' &&
    process.env.VERCEL_ENV !== 'production' &&
    !process.env.BLOB_READ_WRITE_TOKEN
  )
}

export function makeDevAttachmentPathname(userId: number, ext: string): string {
  return `${DEV_ATTACHMENT_PREFIX}u${userId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`
}

export function putDevAttachment(pathname: string, buffer: Buffer, mediaType: string): void {
  store().set(pathname, { buffer, mediaType })
}

export function getDevAttachment(pathname: string): DevAttachment | null {
  return store().get(pathname) ?? null
}

export function deleteDevAttachment(pathname: string): void {
  store().delete(pathname)
}

export function isDevAttachmentPathname(value: string): boolean {
  return value.startsWith(DEV_ATTACHMENT_PREFIX)
}
