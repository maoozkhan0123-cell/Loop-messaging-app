import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AttachmentStorageError,
  MAX_ATTACHMENT_SIZE_BYTES,
  addAttachmentBlob,
  areAttachmentsDuplicate,
  createAttachmentFingerprint,
  createAttachmentObjectUrl,
  createAttachmentStorageKey,
  createAttachmentTaskStoragePrefix,
  deleteAttachmentBlob,
  findDuplicateAttachment,
  getAttachmentBlob,
  getAttachmentRecord,
  revokeAttachmentObjectUrl,
  validateAttachmentFile,
  withAttachmentObjectUrl,
} from './attachmentStorage'

type RequestShape<T> = {
  result: T
  error: DOMException | null
  onsuccess: ((event: Event) => void) | null
  onerror: ((event: Event) => void) | null
}

class MemoryTransaction {
  oncomplete: ((event: Event) => void) | null = null
  onabort: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  error: DOMException | null = null
  private pending = 0

  constructor(private readonly records: Map<string, Record<string, unknown>>) {}

  objectStore() {
    return new MemoryObjectStore(this.records, this)
  }

  request<T>(operation: () => T): IDBRequest<T> {
    const request: RequestShape<T> = {
      result: undefined as T,
      error: null,
      onsuccess: null,
      onerror: null,
    }
    this.pending += 1
    setTimeout(() => {
      try {
        request.result = operation()
        request.onsuccess?.(new Event('success'))
      } catch (error) {
        request.error = error as DOMException
        this.error = request.error
        request.onerror?.(new Event('error'))
      } finally {
        this.pending -= 1
        setTimeout(() => {
          if (this.pending === 0) {
            if (this.error) this.onabort?.(new Event('abort'))
            else this.oncomplete?.(new Event('complete'))
          }
        }, 0)
      }
    }, 0)
    return request as unknown as IDBRequest<T>
  }
}

class MemoryObjectStore {
  readonly indexNames = { contains: (name: string) => name === 'by-fingerprint' } as unknown as DOMStringList

  constructor(
    private readonly records: Map<string, Record<string, unknown>>,
    private readonly transaction: MemoryTransaction,
  ) {}

  createIndex() {
    return {} as IDBIndex
  }

  add(record: Record<string, unknown>) {
    return this.transaction.request(() => {
      const key = record.storageKey as string
      if (this.records.has(key)) throw new DOMException('Duplicate key', 'ConstraintError')
      this.records.set(key, record)
      return key
    })
  }

  get(key: IDBValidKey) {
    return this.transaction.request(() => this.records.get(String(key)))
  }

  delete(key: IDBValidKey) {
    return this.transaction.request(() => {
      this.records.delete(String(key))
      return undefined
    })
  }

  index() {
    return {
      getAll: (fingerprint: IDBValidKey) =>
        this.transaction.request(() =>
          [...this.records.values()].filter((record) => record.fingerprint === fingerprint),
        ),
    } as IDBIndex
  }
}

function createMemoryIndexedDb(): IDBFactory {
  const records = new Map<string, Record<string, unknown>>()
  const upgradeTransaction = new MemoryTransaction(records)
  const database = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => new MemoryObjectStore(records, upgradeTransaction),
    transaction: () => new MemoryTransaction(records),
    close: vi.fn(),
  } as unknown as IDBDatabase

  return {
    open: () => {
      const request = {
        result: database,
        error: null,
        transaction: upgradeTransaction,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      } as unknown as IDBOpenDBRequest
      setTimeout(() => {
        request.onupgradeneeded?.(new Event('upgradeneeded') as IDBVersionChangeEvent)
        request.onsuccess?.(new Event('success'))
      }, 0)
      return request
    },
  } as unknown as IDBFactory
}

const originalIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')

function setIndexedDb(value: IDBFactory | undefined) {
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value })
}

function file(name: string, type: string, contents = 'content', lastModified = 42) {
  return new File([contents], name, { type, lastModified })
}

beforeEach(() => setIndexedDb(createMemoryIndexedDb()))

afterEach(() => {
  vi.restoreAllMocks()
  if (originalIndexedDb) Object.defineProperty(globalThis, 'indexedDB', originalIndexedDb)
  else Reflect.deleteProperty(globalThis, 'indexedDB')
  if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl)
  else Reflect.deleteProperty(URL, 'createObjectURL')
  if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl)
  else Reflect.deleteProperty(URL, 'revokeObjectURL')
})

describe('attachment validation and identity', () => {
  it('accepts supported content and infers generic Office MIME types', () => {
    expect(validateAttachmentFile(file('brief.pdf', 'application/pdf'))).toMatchObject({
      valid: true,
      mimeType: 'application/pdf',
    })
    expect(validateAttachmentFile(file('report.docx', 'application/octet-stream'))).toMatchObject({
      valid: true,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
  })

  it('rejects unsupported, empty, and oversized files with typed errors', () => {
    const unsupported = validateAttachmentFile(file('script.exe', 'application/x-msdownload'))
    const empty = validateAttachmentFile(file('empty.txt', 'text/plain', ''))
    const oversized = validateAttachmentFile({
      name: 'huge.pdf',
      type: 'application/pdf',
      size: MAX_ATTACHMENT_SIZE_BYTES + 1,
    })

    expect(unsupported).toMatchObject({ valid: false, error: { code: 'unsupported_type' } })
    expect(empty).toMatchObject({ valid: false, error: { code: 'invalid_file' } })
    expect(oversized).toMatchObject({ valid: false, error: { code: 'file_too_large' } })
  })

  it('creates stable scoped keys and duplicate fingerprints', () => {
    expect(createAttachmentStorageKey('task 1', 'attachment/1')).toBe(
      'workspace:task-attachment:v1:task%201:attachment%2F1',
    )
    expect(createAttachmentTaskStoragePrefix('task 1')).toBe(
      'workspace:task-attachment:v1:task%201:',
    )

    const first = file('Design.PNG', 'image/png', 'one', 100)
    const second = file('design.png', 'image/png', 'two', 100)
    expect(createAttachmentFingerprint(first)).toBe(createAttachmentFingerprint(second))
    expect(areAttachmentsDuplicate(first, second)).toBe(true)
  })
})

describe('IndexedDB attachment storage', () => {
  it('adds, reads, finds, and deletes a binary without localStorage', async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, 'setItem')
    const upload = file('specification.pdf', 'application/pdf')
    const storageKey = createAttachmentStorageKey('task-1', 'attachment-1')

    const metadata = await addAttachmentBlob(storageKey, upload)
    expect(metadata).toMatchObject({
      storageKey,
      name: 'specification.pdf',
      mimeType: 'application/pdf',
      sizeBytes: upload.size,
    })
    expect(metadata).not.toHaveProperty('blob')
    expect(await getAttachmentBlob(storageKey)).toBeInstanceOf(Blob)
    expect(await getAttachmentRecord(storageKey)).toMatchObject({ storageKey, name: upload.name })
    expect(await findDuplicateAttachment(upload)).toMatchObject({ storageKey })
    expect(localStorageSpy).not.toHaveBeenCalled()

    await expect(deleteAttachmentBlob(storageKey)).resolves.toBe(true)
    await expect(deleteAttachmentBlob(storageKey)).resolves.toBe(false)
    await expect(getAttachmentBlob(storageKey)).resolves.toBeNull()
  })

  it('does not silently overwrite a stable storage key', async () => {
    const storageKey = createAttachmentStorageKey('task-1', 'attachment-1')
    await addAttachmentBlob(storageKey, file('one.txt', 'text/plain'))

    await expect(addAttachmentBlob(storageKey, file('two.txt', 'text/plain'))).rejects.toMatchObject({
      code: 'duplicate',
    })
  })

  it('reports unavailable IndexedDB as a recoverable typed failure', async () => {
    setIndexedDb(undefined)
    await expect(
      addAttachmentBlob('valid-key', file('brief.txt', 'text/plain')),
    ).rejects.toMatchObject({ code: 'unsupported' })
  })
})

describe('object URL lifecycle', () => {
  it('always revokes preview URLs, including when the consumer fails', async () => {
    const create = vi.fn(() => 'blob:preview-1')
    const revoke = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
    const blob = new Blob(['preview'], { type: 'text/plain' })

    const directUrl = createAttachmentObjectUrl(blob)
    expect(directUrl).toBe('blob:preview-1')
    revokeAttachmentObjectUrl(directUrl)
    await expect(
      withAttachmentObjectUrl(blob, async () => {
        throw new Error('preview failed')
      }),
    ).rejects.toThrow('preview failed')
    expect(create).toHaveBeenCalledTimes(2)
    expect(revoke).toHaveBeenCalledTimes(2)
  })

  it('uses a typed error class for UI-safe branching', () => {
    const error = new AttachmentStorageError('not_found', 'Missing')
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('not_found')
  })
})
