import type {
  TaskCover,
  TaskCoverColorPreset,
  TaskCoverGradientPreset,
  TaskCoverImageMimeType,
} from '@/types/task'
import {
  addAttachmentBlob,
  createAttachmentObjectUrl,
  createAttachmentStorageKey,
  createAttachmentTaskStoragePrefix,
  deleteAttachmentBlob,
  revokeAttachmentObjectUrl,
  validateAttachmentFile,
} from '@/lib/attachmentStorage'

export const MIN_TASK_COVER_WIDTH = 320
export const MIN_TASK_COVER_HEIGHT = 120
export const MAX_TASK_COVER_DIMENSION = 8192
export const MAX_TASK_COVER_PIXELS = 40_000_000

export interface TaskCoverPreset<T extends TaskCoverColorPreset | TaskCoverGradientPreset> {
  id: T
  label: string
  background: string
  foreground: '#ffffff'
}

/** All presets keep white controls above WCAG AA contrast on their darkest region. */
export const TASK_COVER_COLOR_PRESETS: readonly TaskCoverPreset<TaskCoverColorPreset>[] = [
  { id: 'slate', label: 'Slate', background: '#334155', foreground: '#ffffff' },
  { id: 'indigo', label: 'Indigo', background: '#4338ca', foreground: '#ffffff' },
  { id: 'blue', label: 'Blue', background: '#1d4ed8', foreground: '#ffffff' },
  { id: 'teal', label: 'Teal', background: '#0f766e', foreground: '#ffffff' },
  { id: 'emerald', label: 'Emerald', background: '#047857', foreground: '#ffffff' },
  { id: 'amber', label: 'Amber', background: '#92400e', foreground: '#ffffff' },
  { id: 'rose', label: 'Rose', background: '#be123c', foreground: '#ffffff' },
  { id: 'plum', label: 'Plum', background: '#7e22ce', foreground: '#ffffff' },
] as const

export const TASK_COVER_GRADIENT_PRESETS: readonly TaskCoverPreset<TaskCoverGradientPreset>[] = [
  { id: 'midnight', label: 'Midnight', background: 'linear-gradient(135deg, #111827 0%, #4338ca 100%)', foreground: '#ffffff' },
  { id: 'ocean', label: 'Ocean', background: 'linear-gradient(135deg, #075985 0%, #1d4ed8 55%, #312e81 100%)', foreground: '#ffffff' },
  { id: 'aurora', label: 'Aurora', background: 'linear-gradient(135deg, #065f46 0%, #0f766e 48%, #3730a3 100%)', foreground: '#ffffff' },
  { id: 'sunrise', label: 'Sunrise', background: 'linear-gradient(135deg, #9f1239 0%, #c2410c 55%, #92400e 100%)', foreground: '#ffffff' },
  { id: 'berry', label: 'Berry', background: 'linear-gradient(135deg, #581c87 0%, #be123c 100%)', foreground: '#ffffff' },
  { id: 'slate-sky', label: 'Slate sky', background: 'linear-gradient(135deg, #0f172a 0%, #0369a1 100%)', foreground: '#ffffff' },
] as const

const COVER_IMAGE_TYPES = new Set<TaskCoverImageMimeType>([
  'image/avif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

export class TaskCoverError extends Error {
  constructor(message: string, public readonly code: 'invalid_file' | 'invalid_dimensions' | 'decode_failed' | 'storage_failed') {
    super(message)
    this.name = 'TaskCoverError'
  }
}

export interface TaskCoverImageDimensions {
  width: number
  height: number
}

export function validateTaskCoverDimensions(width: number, height: number): TaskCoverImageDimensions {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TaskCoverError('This image does not report valid dimensions.', 'invalid_dimensions')
  }
  if (width < MIN_TASK_COVER_WIDTH || height < MIN_TASK_COVER_HEIGHT) {
    throw new TaskCoverError(
      `Cover images must be at least ${MIN_TASK_COVER_WIDTH} × ${MIN_TASK_COVER_HEIGHT} pixels.`,
      'invalid_dimensions',
    )
  }
  if (width > MAX_TASK_COVER_DIMENSION || height > MAX_TASK_COVER_DIMENSION || width * height > MAX_TASK_COVER_PIXELS) {
    throw new TaskCoverError('This image has too many pixels. Choose an image up to 8192 px and 40 megapixels.', 'invalid_dimensions')
  }
  return { width, height }
}

export function validateTaskCoverFile(file: Pick<File, 'name' | 'type' | 'size'>): TaskCoverImageMimeType {
  const validation = validateAttachmentFile(file)
  if (!validation.valid) throw new TaskCoverError(validation.error.message, 'invalid_file')
  if (!COVER_IMAGE_TYPES.has(validation.mimeType as TaskCoverImageMimeType)) {
    throw new TaskCoverError('Choose an AVIF, JPEG, PNG, or WebP image for the cover.', 'invalid_file')
  }
  return validation.mimeType as TaskCoverImageMimeType
}

async function dimensionsWithImageElement(file: File): Promise<TaskCoverImageDimensions> {
  if (typeof Image === 'undefined') throw new TaskCoverError('Image previews are not supported in this browser.', 'decode_failed')
  const url = createAttachmentObjectUrl(file)
  try {
    return await new Promise<TaskCoverImageDimensions>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => reject(new TaskCoverError('The selected image could not be decoded.', 'decode_failed'))
      image.src = url
    })
  } finally {
    revokeAttachmentObjectUrl(url)
  }
}

export async function readTaskCoverDimensions(file: File): Promise<TaskCoverImageDimensions> {
  validateTaskCoverFile(file)
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      try {
        return validateTaskCoverDimensions(bitmap.width, bitmap.height)
      } finally {
        bitmap.close()
      }
    }
    const dimensions = await dimensionsWithImageElement(file)
    return validateTaskCoverDimensions(dimensions.width, dimensions.height)
  } catch (error) {
    if (error instanceof TaskCoverError) throw error
    throw new TaskCoverError('The selected image could not be decoded.', 'decode_failed')
  }
}

function randomCoverId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `cover-${crypto.randomUUID()}`
  return `cover-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export async function storeTaskCoverImage(taskId: string, file: File): Promise<Extract<TaskCover, { type: 'image' }>> {
  const mimeType = validateTaskCoverFile(file)
  const { width, height } = await readTaskCoverDimensions(file)
  const storageKey = createAttachmentStorageKey(taskId, randomCoverId())
  try {
    await addAttachmentBlob(storageKey, file)
  } catch (error) {
    throw new TaskCoverError(error instanceof Error ? error.message : 'The cover image could not be stored.', 'storage_failed')
  }
  return { type: 'image', value: storageKey, mimeType, width, height, positionY: 50 }
}

export function isOwnedTaskCoverImage(taskId: string, cover: TaskCover | undefined): cover is Extract<TaskCover, { type: 'image' }> {
  if (cover?.type !== 'image') return false
  const prefix = createAttachmentTaskStoragePrefix(taskId)
  return cover.value.startsWith(`${prefix}cover-`)
}

/** Only removes keys created for this task's cover flow, never normal attachments. */
export async function deleteTaskCoverImage(taskId: string, cover: TaskCover | undefined): Promise<boolean> {
  if (!isOwnedTaskCoverImage(taskId, cover)) return false
  return deleteAttachmentBlob(cover.value)
}
