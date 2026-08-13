/**
 * Storage durability and full-device backup.
 *
 * Everything in BookSpace lives in this browser's IndexedDB. Without asking,
 * a browser is free to evict "best-effort" storage under disk pressure, and a
 * different origin (a different port, a different deployed URL) is a
 * completely separate database — neither looks like an error, both look like
 * "my data disappeared." This module makes both situations visible and gives
 * the user a real way out: request durable storage, and take a backup they
 * control.
 */

import { DB_VERSION, getAll, putMany, type StoreName } from '@/data/db'

const STORE_NAMES: StoreName[] = [
  'profiles',
  'books',
  'user_books',
  'shelves',
  'shelf_books',
  'reading_sessions',
  'reading_goals',
  'reviews',
  'quotes',
  'notes',
  'learnings',
  'activities',
  'tabs',
  'credentials',
  'meta',
  'spaces',
  'space_pages',
  'space_objects',
  'space_templates',
  'files',
]

export interface StorageStatus {
  /** False in browsers without the Storage API (very old Safari/Firefox). */
  supported: boolean
  persisted: boolean
  usageBytes: number | null
  quotaBytes: number | null
}

/**
 * Asks the browser to treat this origin's storage as durable rather than
 * best-effort-evictable. Chrome grants this quietly based on site-engagement
 * heuristics; it is not something the app can force, only request.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (!navigator.storage) {
    return { supported: false, persisted: false, usageBytes: null, quotaBytes: null }
  }
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(false),
    navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(undefined),
  ])
  return {
    supported: true,
    persisted,
    usageBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
  }
}

/* -------------------------------------------------------------- serializing */

interface SerializedBlob {
  __blob: true
  type: string
  base64: string
}

function isSerializedBlob(value: unknown): value is SerializedBlob {
  return Boolean(value) && typeof value === 'object' && (value as { __blob?: unknown }).__blob === true
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  // Chunked to avoid blowing the call stack on large files (String.fromCharCode
  // with a huge spread argument list throws on multi-MB PDFs).
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

/** Blobs (uploaded files) don't survive JSON.stringify — encode as base64. */
async function serializeValue(value: unknown): Promise<unknown> {
  if (value instanceof Blob) {
    const buffer = await value.arrayBuffer()
    return {
      __blob: true,
      type: value.type,
      base64: bytesToBase64(new Uint8Array(buffer)),
    } satisfies SerializedBlob
  }
  if (Array.isArray(value)) return Promise.all(value.map(serializeValue))
  if (value && typeof value === 'object') {
    const entries = await Promise.all(
      Object.entries(value).map(async ([key, v]) => [key, await serializeValue(v)] as const),
    )
    return Object.fromEntries(entries)
  }
  return value
}

function deserializeValue(value: unknown): unknown {
  if (isSerializedBlob(value)) {
    const bytes = Uint8Array.from(atob(value.base64), (c) => c.charCodeAt(0))
    return new Blob([bytes], { type: value.type })
  }
  if (Array.isArray(value)) return value.map(deserializeValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, deserializeValue(v)]),
    )
  }
  return value
}

/* ------------------------------------------------------------------- export */

export interface BackupFile {
  app: 'bookspace'
  backupVersion: 1
  dbVersion: number
  exportedAt: string
  origin: string
  stores: Partial<Record<StoreName, unknown[]>>
}

export async function buildBackup(): Promise<BackupFile> {
  const stores: Partial<Record<StoreName, unknown[]>> = {}
  for (const name of STORE_NAMES) {
    const rows = await getAll<unknown>(name)
    if (rows.length) stores[name] = await Promise.all(rows.map(serializeValue))
  }
  return {
    app: 'bookspace',
    backupVersion: 1,
    dbVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    origin: location.origin,
    stores,
  }
}

/**
 * Downloads a full backup, including password hashes (never plaintext — see
 * `auth.ts`) so a restore leaves sign-in working, not just the data. This is
 * the user's own file, for the user's own device; treat it like any other
 * local backup that can log you in, and keep it somewhere private.
 */
export async function downloadBackup(): Promise<void> {
  const backup = await buildBackup()
  const date = new Date().toISOString().slice(0, 10)
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(backup)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `bookspace-backup-${date}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------- import */

export class BackupError extends Error {}

/**
 * Restores a backup by upserting every record back into IndexedDB, keyed by
 * its original id. This never deletes — it only adds or overwrites — so
 * restoring can't destroy data that was created after the backup was taken.
 */
export async function restoreBackup(file: File): Promise<{ records: number }> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new BackupError('That file is not valid JSON.')
  }
  const backup = parsed as Partial<BackupFile>
  if (backup.app !== 'bookspace' || !backup.stores) {
    throw new BackupError('That file is not a BookSpace backup.')
  }

  let records = 0
  for (const [name, rows] of Object.entries(backup.stores)) {
    if (!STORE_NAMES.includes(name as StoreName) || !Array.isArray(rows) || !rows.length) {
      continue
    }
    const restored = rows.map(deserializeValue)
    await putMany(name as StoreName, restored)
    records += restored.length
  }
  return { records }
}

export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`
}
