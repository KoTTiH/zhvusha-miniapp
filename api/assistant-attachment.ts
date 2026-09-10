import { randomUUID } from 'node:crypto'
import { del, put } from '@vercel/blob'
import { query } from './_lib/db.js'
import {
  canUseDevAttachmentStore,
  deleteDevAttachment,
  isDevAttachmentPathname,
  makeDevAttachmentPathname,
  putDevAttachment,
} from './_lib/devAttachmentStore.js'
import { createRoute } from './_lib/handler.js'

type AttachmentKind = 'skin_photo' | 'photo'
type AttachmentAction = 'upload' | 'list' | 'delete'

type Input = {
  action?: AttachmentAction
  id?: number
  kind?: AttachmentKind
  data?: string
  mediaType?: string
  metadata?: Record<string, unknown> | null
}

type AttachmentOut = {
  id: number
  kind: AttachmentKind
  mediaType: string
  pathname: string
  size: number
  createdAt: string
}

type Output =
  | { attachment: AttachmentOut }
  | { attachments: AttachmentOut[] }
  | { ok: true }

type DbAttachment = {
  id: string
  kind: AttachmentKind
  media_type: string
  pathname: string
  metadata_json: unknown
  created_at: Date
}

type DbDeleteRow = {
  blob_url: string
  pathname: string
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const ALLOWED_MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp'])

export default createRoute<Input, Output>(async ({ input, userId }) => {
  const effectiveUserId = assistantUserId(userId)
  const action = input.action ?? 'upload'

  if (action === 'list') {
    return { attachments: await listAttachments(effectiveUserId) }
  }

  if (action === 'delete') {
    const id = positiveInt(input.id)
    const rows = await query<DbDeleteRow>(
      `UPDATE assistant_attachments
          SET deleted_at = now()
        WHERE user_id = $1
          AND id = $2
          AND deleted_at IS NULL
        RETURNING blob_url, pathname`,
      [effectiveUserId, id],
    )
    const row = rows[0]
    if (row) {
      const target = row.pathname || row.blob_url
      if (isDevAttachmentPathname(target)) {
        deleteDevAttachment(target)
      } else {
        await del(target).catch((err) => {
          console.warn('[assistant-attachment] blob delete failed:', err instanceof Error ? err.message : err)
        })
      }
    }
    return { ok: true }
  }

  const mediaType = parseMediaType(input.mediaType)
  const kind = input.kind === 'skin_photo' ? 'skin_photo' : 'photo'
  const data = typeof input.data === 'string' ? input.data.replace(/^data:[^;]+;base64,/, '') : ''
  if (!data) throw new Error('empty attachment')
  const buffer = Buffer.from(data, 'base64')
  if (buffer.byteLength <= 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
    throw new Error('attachment too large')
  }

  const ext = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg'
  let blobUrl: string
  let pathname: string
  if (canUseDevAttachmentStore()) {
    pathname = makeDevAttachmentPathname(effectiveUserId, ext)
    blobUrl = pathname
    putDevAttachment(pathname, buffer, mediaType)
  } else {
    pathname = `assistant/u${effectiveUserId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`
    const blob = await put(pathname, buffer, {
      access: 'private',
      contentType: mediaType,
      addRandomSuffix: false,
    })
    blobUrl = blob.url
    pathname = blob.pathname
  }
  const rows = await query<DbAttachment>(
    `INSERT INTO assistant_attachments (
       user_id,
       kind,
       blob_url,
       pathname,
       media_type,
       metadata_json
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING id, kind, media_type, pathname, metadata_json, created_at`,
    [
      effectiveUserId,
      kind,
      blobUrl,
      pathname,
      mediaType,
      JSON.stringify({ ...(input.metadata ?? {}), size: buffer.byteLength }),
    ],
  )
  return { attachment: attachmentOut(rows[0]) }
})

function assistantUserId(userId: number | null): number {
  if (userId !== null) return userId
  if (process.env.ALLOW_UNAUTH === '1') return 0
  throw new Error('assistant attachment requires user')
}

function positiveInt(value: unknown): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error('invalid id')
  return n
}

function parseMediaType(value: unknown): AttachmentOut['mediaType'] {
  if (typeof value !== 'string' || !ALLOWED_MEDIA.has(value)) {
    throw new Error('unsupported media type')
  }
  return value
}

async function listAttachments(userId: number): Promise<AttachmentOut[]> {
  const rows = await query<DbAttachment>(
    `SELECT id, kind, media_type, pathname, metadata_json, created_at
       FROM assistant_attachments
      WHERE user_id = $1
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 40`,
    [userId],
  )
  return rows.map(attachmentOut)
}

function attachmentOut(row: DbAttachment): AttachmentOut {
  const meta = row.metadata_json && typeof row.metadata_json === 'object'
    ? row.metadata_json as Record<string, unknown>
    : {}
  const size = Number(meta.size)
  return {
    id: Number(row.id),
    kind: row.kind,
    mediaType: row.media_type,
    pathname: row.pathname,
    size: Number.isFinite(size) ? Math.max(0, Math.round(size)) : 0,
    createdAt: row.created_at.toISOString(),
  }
}
