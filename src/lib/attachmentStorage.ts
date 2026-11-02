/**
 * Local binary storage for task attachments.
 *
 * Task JSON stores only the serializable metadata returned by this module.
 * File contents live in IndexedDB and object URLs are always short-lived.
 */

export const ATTACHMENT_DB_NAME = 'workspace:task-attachments'
export const ATTACHMENT_DB_VERSION = 1
export const ATTACHMENT_STORE_NAME = 'attachment-blobs'
export const ATTACHMENT_STORAGE_KEY_PREFIX = 'workspace:task-attachment:v1'
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024

const FINGERPRINT_INDEX_NAME = 'by-fingerprint'
const MAX_FILE_NAME_LENGTH = 255
const MAX_STORAGE_KEY_LENGTH = 512

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'application/json',
  'application/rtf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const

export type AllowedAttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number]

export type AttachmentStorageErrorCode =
  | 'unsupported'
  | 'invalid_file'
  | 'file_too_large'
  | 'unsupported_type'
  | 'invalid_storage_key'
  | 'duplicate'
  | 'not_found'
  | 'quota_exceeded'
  | 'database_error'
  | 'download_failed'

export class AttachmentStorageError extends Error {
  readonly code: AttachmentStorageErrorCode
  override readonly cause?: unknown

  constructor(code: AttachmentStorageErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'AttachmentStorageError'
    this.code = code
    this.cause = cause
  }
}

/** Serializable fields that can safely accompany a TaskAttachment record. */
export interface AttachmentStorageMetadata {
  storageKey: string
  name: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  lastModified: number
  fingerprint: string
}

export interface StoredAttachmentRecord extends AttachmentStorageMetadata {
  blob: Blob
}

export interface AttachmentValidationSuccess {
  valid: true
  name: string
  mimeType: AllowedAttachmentMimeType
  sizeBytes: number
}

export interface AttachmentValidationFailure {
  valid: false
  error: AttachmentStorageError
}

export type AttachmentValidationResult = AttachmentValidationSuccess | AttachmentValidationFailure

export interface AddAttachmentOptions {
  /** ISO timestamp used in metadata. Defaults to the current time. */
  createdAt?: string
  /**
   * Detect the same file fingerprint before writing. A scope prefix limits the
   * check to one task, while omitting it checks the complete attachment store.
   */
  rejectDuplicate?: boolean
  duplicateScopePrefix?: string
}

const MIME_BY_EXTENSION: Readonly<Record<string, AllowedAttachmentMimeType>> = {
  avif: 'image/avif',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

const ALLOWED_MIME_TYPE_SET = new Set<string>(ALLOWED_ATTACHMENT_MIME_TYPES)

function attachmentError(
  code: AttachmentStorageErrorCode,
  message: string,
  cause?: unknown,
): AttachmentStorageError {
  return cause instanceof AttachmentStorageError
    ? cause
    : new AttachmentStorageError(code, message, cause)
}

function normalizedFileName(name: string): string {
  return name.split(/[\\/]/).at(-1)?.trim() ?? ''
}

function extensionOf(name: string): string {
  const extension = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  return extension ?? ''
}

function normalizedMimeType(file: Pick<File, 'name' | 'type'>): AllowedAttachmentMimeType | null {
  const suppliedType = file.type.trim().toLowerCase().split(';', 1)[0]
  if (ALLOWED_MIME_TYPE_SET.has(suppliedType)) return suppliedType as AllowedAttachmentMimeType

  // Some operating systems leave Office/text MIME types empty or generic.
  if (!suppliedType || suppliedType === 'application/octet-stream') {
    return MIME_BY_EXTENSION[extensionOf(file.name)] ?? null
  }

  return null
}

/** Validate before opening IndexedDB so failures are immediate and actionable. */
export function validateAttachmentFile(
  file: Pick<File, 'name' | 'type' | 'size'>,
): AttachmentValidationResult {
  const name = normalizedFileName(file.name)
  if (!name || name.length > MAX_FILE_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(name)) {
    return {
      valid: false,
      error: attachmentError(
        'invalid_file',
        `Choose a file with a valid name of ${MAX_FILE_NAME_LENGTH} characters or fewer.`,
      ),
    }
  }

  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    return {
      valid: false,
      error: attachmentError('invalid_file', 'The selected file is empty or has an invalid size.'),
    }
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return {
      valid: false,
      error: attachmentError('file_too_large', 'Attachments must be 10 MB or smaller.'),
    }
  }

  const mimeType = normalizedMimeType(file)
  if (!mimeType) {
    return {
      valid: false,
      error: attachmentError(
        'unsupported_type',
        'This file type is not supported. Upload an image, PDF, text file, or Office document.',
      ),
    }
  }

  return { valid: true, name, mimeType, sizeBytes: file.size }
}

function assertValidStorageKey(storageKey: string): string {
  const value = storageKey.trim()
  if (!value || value.length > MAX_STORAGE_KEY_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw attachmentError('invalid_storage_key', 'The attachment storage key is invalid.')
  }
  return value
}

function encodedKeyPart(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw attachmentError('invalid_storage_key', `${label} is required to create a storage key.`)
  return encodeURIComponent(trimmed)
}

/** Deterministic key: callers can persist it safely in task attachment metadata. */
export function createAttachmentStorageKey(taskId: string, attachmentId: string): string {
  return `${ATTACHMENT_STORAGE_KEY_PREFIX}:${encodedKeyPart(taskId, 'Task ID')}:${encodedKeyPart(
    attachmentId,
    'Attachment ID',
  )}`
}

export function createAttachmentTaskStoragePrefix(taskId: string): string {
  return `${ATTACHMENT_STORAGE_KEY_PREFIX}:${encodedKeyPart(taskId, 'Task ID')}:`
}

/**
 * A cheap duplicate signal suitable for upload UX. It deliberately avoids
 * reading an entire 10 MB file; callers may still allow two equal-looking files.
 */
export function createAttachmentFingerprint(
  file: Pick<File, 'name' | 'type' | 'size' | 'lastModified'>,
): string {
  const name = normalizedFileName(file.name).toLocaleLowerCase('en-US')
  const type = normalizedMimeType(file) ?? file.type.trim().toLowerCase()
  return [name, file.size, type, file.lastModified || 0].join('|')
}

export function areAttachmentsDuplicate(
  first: Pick<File, 'name' | 'type' | 'size' | 'lastModified'>,
  second: Pick<File, 'name' | 'type' | 'size' | 'lastModified'>,
): boolean {
  return createAttachmentFingerprint(first) === createAttachmentFingerprint(second)
}

function getIndexedDb(): IDBFactory {
  try {
    if (typeof globalThis.indexedDB === 'undefined') {
      throw attachmentError(
        'unsupported',
        'Local attachment storage is not available in this browser.',
      )
    }
    return globalThis.indexedDB
  } catch (error) {
    throw attachmentError(
      'unsupported',
      'Local attachment storage is unavailable. Check browser privacy or storage settings.',
      error,
    )
  }
}

export function isAttachmentStorageSupported(): boolean {
  try {
    return typeof globalThis.indexedDB !== 'undefined'
  } catch {
    return false
  }
}

function mapDatabaseError(error: unknown, fallbackMessage: string): AttachmentStorageError {
  if (error instanceof AttachmentStorageError) return error

  const name =
    error && typeof error === 'object' && 'name' in error && typeof error.name === 'string'
      ? error.name
      : ''

  if (name === 'QuotaExceededError') {
    return attachmentError(
      'quota_exceeded',
      'There is not enough local storage space for this attachment. Remove unused files and try again.',
      error,
    )
  }
  if (name === 'ConstraintError') {
    return attachmentError('duplicate', 'This attachment has already been stored.', error)
  }

  return attachmentError('database_error', fallbackMessage, error)
}

function openAttachmentDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest
    try {
      request = getIndexedDb().open(ATTACHMENT_DB_NAME, ATTACHMENT_DB_VERSION)
    } catch (error) {
      reject(mapDatabaseError(error, 'Could not open local attachment storage.'))
      return
    }

    request.onupgradeneeded = () => {
      const database = request.result
      const store = database.objectStoreNames.contains(ATTACHMENT_STORE_NAME)
        ? request.transaction!.objectStore(ATTACHMENT_STORE_NAME)
        : database.createObjectStore(ATTACHMENT_STORE_NAME, { keyPath: 'storageKey' })

      if (!store.indexNames.contains(FINGERPRINT_INDEX_NAME)) {
        store.createIndex(FINGERPRINT_INDEX_NAME, 'fingerprint', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(mapDatabaseError(request.error, 'Could not open local attachment storage.'))
    request.onblocked = () =>
      reject(
        attachmentError(
          'database_error',
          'Attachment storage is blocked by another open tab. Close it and try again.',
        ),
      )
  })
}

function requestResult<T>(request: IDBRequest<T>, fallbackMessage: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(mapDatabaseError(request.error, fallbackMessage))
  })
}

async function withObjectStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const database = await openAttachmentDatabase()
  try {
    const transaction = database.transaction(ATTACHMENT_STORE_NAME, mode)
    const result = await operation(transaction.objectStore(ATTACHMENT_STORE_NAME))

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onabort = () =>
        reject(mapDatabaseError(transaction.error, 'The attachment storage operation was cancelled.'))
      transaction.onerror = () => {
        // The abort handler reports the final transaction error.
      }
    })

    return result
  } catch (error) {
    throw mapDatabaseError(error, 'The local attachment storage operation failed.')
  } finally {
    database.close()
  }
}

function withoutBlob(record: StoredAttachmentRecord): AttachmentStorageMetadata {
  return {
    storageKey: record.storageKey,
    name: record.name,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    createdAt: record.createdAt,
    lastModified: record.lastModified,
    fingerprint: record.fingerprint,
  }
}

export async function findDuplicateAttachment(
  file: Pick<File, 'name' | 'type' | 'size' | 'lastModified'>,
  options: { scopePrefix?: string; excludeStorageKey?: string } = {},
): Promise<AttachmentStorageMetadata | null> {
  const fingerprint = createAttachmentFingerprint(file)
  const matches = await withObjectStore('readonly', (store) =>
    requestResult<StoredAttachmentRecord[]>(
      store.index(FINGERPRINT_INDEX_NAME).getAll(fingerprint),
      'Could not check for duplicate attachments.',
    ),
  )

  const match = matches.find(
    (record) =>
      record.storageKey !== options.excludeStorageKey &&
      (!options.scopePrefix || record.storageKey.startsWith(options.scopePrefix)),
  )
  return match ? withoutBlob(match) : null
}

/** Store one validated File. Existing storage keys are never silently overwritten. */
export async function addAttachmentBlob(
  storageKey: string,
  file: File,
  options: AddAttachmentOptions = {},
): Promise<AttachmentStorageMetadata> {
  const validStorageKey = assertValidStorageKey(storageKey)
  const validation = validateAttachmentFile(file)
  if (!validation.valid) throw validation.error

  if (options.rejectDuplicate) {
    const duplicate = await findDuplicateAttachment(file, {
      scopePrefix: options.duplicateScopePrefix,
      excludeStorageKey: validStorageKey,
    })
    if (duplicate) {
      throw attachmentError('duplicate', `“${validation.name}” has already been attached.`)
    }
  }

  const createdAt = options.createdAt ?? new Date().toISOString()
  if (Number.isNaN(Date.parse(createdAt))) {
    throw attachmentError('invalid_file', 'The attachment upload timestamp is invalid.')
  }

  const record: StoredAttachmentRecord = {
    storageKey: validStorageKey,
    name: validation.name,
    mimeType: validation.mimeType,
    sizeBytes: validation.sizeBytes,
    createdAt,
    lastModified: file.lastModified || 0,
    fingerprint: createAttachmentFingerprint(file),
    blob: file,
  }

  await withObjectStore('readwrite', (store) =>
    requestResult(store.add(record), 'Could not save this attachment locally.'),
  )
  return withoutBlob(record)
}

export async function getAttachmentRecord(storageKey: string): Promise<StoredAttachmentRecord | null> {
  const key = assertValidStorageKey(storageKey)
  const record = await withObjectStore('readonly', (store) =>
    requestResult<StoredAttachmentRecord | undefined>(
      store.get(key),
      'Could not read this attachment from local storage.',
    ),
  )
  return record ?? null
}

export async function getAttachmentBlob(storageKey: string): Promise<Blob | null> {
  return (await getAttachmentRecord(storageKey))?.blob ?? null
}

/** Returns false when the key was already absent. */
export async function deleteAttachmentBlob(storageKey: string): Promise<boolean> {
  const key = assertValidStorageKey(storageKey)
  return withObjectStore('readwrite', async (store) => {
    const existing = await requestResult<StoredAttachmentRecord | undefined>(
      store.get(key),
      'Could not inspect this attachment before deletion.',
    )
    if (!existing) return false
    await requestResult(store.delete(key), 'Could not delete this attachment from local storage.')
    return true
  })
}

function getObjectUrlApi(): Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> {
  if (
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw attachmentError('unsupported', 'File previews are not supported in this browser.')
  }
  return URL
}

export function createAttachmentObjectUrl(blob: Blob): string {
  try {
    return getObjectUrlApi().createObjectURL(blob)
  } catch (error) {
    throw attachmentError('unsupported', 'Could not create a temporary file preview.', error)
  }
}

export function revokeAttachmentObjectUrl(url: string): void {
  if (!url.startsWith('blob:')) return
  try {
    getObjectUrlApi().revokeObjectURL(url)
  } catch {
    // Revocation is best-effort and must never break component cleanup.
  }
}

export async function withAttachmentObjectUrl<T>(
  blob: Blob,
  consumeUrl: (url: string) => T | Promise<T>,
): Promise<T> {
  const url = createAttachmentObjectUrl(blob)
  try {
    return await consumeUrl(url)
  } finally {
    revokeAttachmentObjectUrl(url)
  }
}

/**
 * Download a stored attachment using a temporary object URL. The URL is
 * revoked even when link creation or clicking fails.
 */
export async function downloadAttachmentBlob(
  storageKey: string,
  preferredName?: string,
): Promise<AttachmentStorageMetadata> {
  const record = await getAttachmentRecord(storageKey)
  if (!record) throw attachmentError('not_found', 'This attachment is no longer available locally.')
  if (typeof document === 'undefined' || !document.body) {
    throw attachmentError('unsupported', 'Downloads are not available in this environment.')
  }

  const downloadName = normalizedFileName(preferredName ?? record.name) || record.name
  try {
    await withAttachmentObjectUrl(record.blob, (url) => {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = downloadName
      anchor.hidden = true
      document.body.append(anchor)
      try {
        anchor.click()
      } finally {
        anchor.remove()
      }
    })
  } catch (error) {
    if (error instanceof AttachmentStorageError) throw error
    throw attachmentError('download_failed', 'The attachment could not be downloaded.', error)
  }

  return withoutBlob(record)
}
