'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Download, FileText, Image as ImageIcon, Loader2, Paperclip, Plus, Trash2, Upload, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  createAttachmentObjectUrl,
  downloadAttachmentBlob,
  getAttachmentBlob,
  revokeAttachmentObjectUrl,
} from '@/lib/attachmentStorage'
import type { TaskAttachment } from '@/types/task'
import { confirmDialog } from '@/components/ui/ConfirmDialog'

interface AttachmentSectionProps {
  attachments: TaskAttachment[]
  onUpload: (files: File[]) => Promise<void>
  onRemove: (attachment: TaskAttachment) => Promise<void>
}

interface AttachmentPreview {
  attachment: TaskAttachment
  url: string
}

const ACCEPTED_FILES = 'image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx'

export function AttachmentSection({ attachments, onUpload, onRemove }: AttachmentSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null)
  const previewRequestRef = useRef(0)
  const dragDepthRef = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<AttachmentPreview | null>(null)

  useEffect(() => {
    const request = previewRequestRef
    return () => { request.current += 1 }
  }, [])

  useEffect(() => {
    const url = preview?.url
    return () => { if (url) revokeAttachmentObjectUrl(url) }
  }, [preview?.url])

  const upload = async (files: File[]) => {
    if (!files.length || uploading) return
    setUploading(true)
    setError(null)
    try {
      await onUpload(files)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Files could not be attached.')
    } finally {
      setUploading(false)
    }
  }

  const openPreview = async (attachment: TaskAttachment, trigger: HTMLButtonElement) => {
    const requestId = ++previewRequestRef.current
    previewTriggerRef.current = trigger
    setOpeningId(attachment.id)
    setError(null)
    try {
      const blob = await getAttachmentBlob(attachment.storageKey)
      if (!blob) throw new Error('The local file is no longer available.')
      const url = createAttachmentObjectUrl(blob)
      if (requestId !== previewRequestRef.current) {
        revokeAttachmentObjectUrl(url)
        return
      }
      setPreview({ attachment, url })
    } catch (cause) {
      if (requestId === previewRequestRef.current) {
        setError(cause instanceof Error ? cause.message : 'Preview is unavailable.')
      }
    } finally {
      if (requestId === previewRequestRef.current) setOpeningId(null)
    }
  }

  const download = async (attachment: TaskAttachment) => {
    setError(null)
    try {
      await downloadAttachmentBlob(attachment.storageKey, attachment.name)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Download failed.')
    }
  }

  const remove = async (attachment: TaskAttachment) => {
    if (!(await confirmDialog({ title: `Remove “${attachment.name}”?`, description: 'The file will be removed from this task.', confirmLabel: 'Remove' }))) return
    setRemovingId(attachment.id)
    setError(null)
    try {
      await onRemove(attachment)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The attachment could not be removed.')
    } finally {
      setRemovingId(null)
    }
  }

  const containsFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes('Files')
  const onDragEnter = (event: React.DragEvent<HTMLElement>) => {
    if (!containsFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setDragging(true)
  }
  const onDragOver = (event: React.DragEvent<HTMLElement>) => {
    if (!containsFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = (event: React.DragEvent<HTMLElement>) => {
    if (!dragging && !containsFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDragging(false)
  }
  const onDrop = (event: React.DragEvent<HTMLElement>) => {
    if (!containsFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = 0
    setDragging(false)
    void upload(Array.from(event.dataTransfer.files))
  }

  return (
    <section
      aria-labelledby="attachments-heading"
      className="relative"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="attachments-heading" className="flex items-center gap-2 text-sm font-semibold">
            <Paperclip size={15} className="text-[var(--primary)]" /> Attachments
          </h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">Stored locally in this browser · 10 MB maximum</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--ui-border)] px-2.5 text-xs font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-50"
        >
          {uploading ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {uploading ? 'Adding…' : 'Add'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          accept={ACCEPTED_FILES}
          onChange={(event) => {
            void upload(Array.from(event.currentTarget.files ?? []))
            event.currentTarget.value = ''
          }}
        />
      </div>

      <p className="sr-only" aria-live="polite">{uploading ? 'Uploading attachments.' : ''}</p>
      {error && <p role="alert" className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-[var(--danger)]">{error}</p>}

      {!attachments.length ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`grid w-full place-items-center rounded-xl border border-dashed px-4 py-8 text-center transition ${dragging ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-[var(--ui-border)] hover:border-[var(--primary)] hover:bg-[var(--surface-muted)]'}`}
        >
          <span>
            <Upload size={20} className="mx-auto text-[var(--muted-foreground)]" />
            <strong className="mt-2 block text-xs">Drop files here or browse</strong>
            <span className="mt-1 block text-[10px] text-[var(--muted-foreground)]">Images, PDF, text, and Office documents</span>
          </span>
        </button>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {attachments.map((attachment) => (
            <article key={attachment.id} className="group flex min-w-0 items-center gap-2.5 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] p-2.5">
              <button
                type="button"
                onClick={(event) => void openPreview(attachment, event.currentTarget)}
                disabled={openingId === attachment.id}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)] disabled:opacity-60"
                aria-label={`Preview ${attachment.name}`}
              >
                {openingId === attachment.id
                  ? <Loader2 size={16} className="animate-spin" />
                  : attachment.mimeType.startsWith('image/') ? <ImageIcon size={16} /> : <FileText size={16} />}
              </button>
              <button type="button" onClick={(event) => void openPreview(attachment, event.currentTarget)} className="min-w-0 flex-1 text-left">
                <strong className="block truncate text-xs">{attachment.name}</strong>
                <span className="block text-[10px] text-[var(--muted-foreground)]">{formatBytes(attachment.sizeBytes)} · {new Date(attachment.createdAt).toLocaleDateString()}</span>
              </button>
              <div className="flex shrink-0">
                <button type="button" onClick={() => void download(attachment)} className="grid h-7 w-7 place-items-center rounded text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]" aria-label={`Download ${attachment.name}`}>
                  <Download size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => void remove(attachment)}
                  disabled={removingId === attachment.id}
                  className="grid h-7 w-7 place-items-center rounded text-[var(--muted-foreground)] hover:bg-red-500/10 hover:text-[var(--danger)] disabled:opacity-50"
                  aria-label={`Remove ${attachment.name}`}
                >
                  {removingId === attachment.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-xl border-2 border-dashed border-[var(--primary)] bg-[var(--surface)]/95 text-center shadow-lg" aria-hidden="true">
          <div><Upload size={24} className="mx-auto text-[var(--primary)]" /><strong className="mt-2 block text-xs">Drop to add files</strong></div>
        </div>
      )}

      <Dialog.Root open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null) }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[140] bg-black/75 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
          {preview && (
            <Dialog.Content
              className="fixed left-1/2 top-1/2 z-[141] max-h-[90dvh] w-[min(92vw,960px)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] text-[var(--foreground)] shadow-2xl outline-none"
              onCloseAutoFocus={(event) => {
                event.preventDefault()
                previewTriggerRef.current?.focus()
              }}
            >
              <div className="flex min-h-12 items-center gap-3 border-b border-[var(--ui-border)] px-4 pr-12">
                <div className="min-w-0">
                  <Dialog.Title className="truncate text-sm font-semibold">{preview.attachment.name}</Dialog.Title>
                  <Dialog.Description className="text-[10px] text-[var(--muted-foreground)]">Attachment preview · {formatBytes(preview.attachment.sizeBytes)}</Dialog.Description>
                </div>
                <button type="button" onClick={() => void download(preview.attachment)} className="ml-auto flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-[var(--ui-border)] px-2.5 text-xs font-semibold hover:bg-[var(--surface-muted)]">
                  <Download size={13} /> Download
                </button>
              </div>
              <Dialog.Close asChild>
                <button type="button" className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]" aria-label="Close attachment preview">
                  <X size={16} />
                </button>
              </Dialog.Close>
              <div className="grid max-h-[calc(90dvh-3rem)] min-h-56 place-items-center overflow-auto bg-[var(--surface-muted)] p-3 sm:p-5">
                {preview.attachment.mimeType.startsWith('image/') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.url} alt={preview.attachment.name} className="max-h-[calc(90dvh-7rem)] max-w-full rounded-lg object-contain shadow-sm" />
                ) : preview.attachment.mimeType === 'application/pdf' ? (
                  <iframe src={preview.url} title={`Preview of ${preview.attachment.name}`} className="h-[calc(90dvh-7rem)] min-h-96 w-full rounded-lg bg-white" />
                ) : (
                  <div className="grid min-h-56 place-items-center p-8 text-center">
                    <div>
                      <FileText size={38} className="mx-auto text-[var(--primary)]" />
                      <p className="mt-3 text-sm font-semibold">Preview is not available for this file type.</p>
                      <button type="button" onClick={() => void download(preview.attachment)} className="mt-4 rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white">Download file</button>
                    </div>
                  </div>
                )}
              </div>
            </Dialog.Content>
          )}
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
