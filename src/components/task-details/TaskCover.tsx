'use client'

import * as Popover from '@radix-ui/react-popover'
import { Check, Image as ImageIcon, Loader2, MoveVertical, Palette, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createAttachmentObjectUrl, getAttachmentBlob, revokeAttachmentObjectUrl } from '@/lib/attachmentStorage'
import {
  deleteTaskCoverImage,
  storeTaskCoverImage,
  TASK_COVER_COLOR_PRESETS,
  TASK_COVER_GRADIENT_PRESETS,
} from '@/lib/taskCover'
import type { TaskCover as TaskCoverValue, TaskCoverColorPreset, TaskCoverGradientPreset } from '@/types/task'

type CoverChangeResult = void | boolean | { ok: boolean; error?: unknown }

export interface TaskCoverProps {
  taskId: string
  cover?: TaskCoverValue
  onChange: (cover?: TaskCoverValue) => CoverChangeResult | Promise<CoverChangeResult>
  disabled?: boolean
  className?: string
}

function changeAccepted(result: CoverChangeResult): boolean {
  if (result === false) return false
  if (typeof result === 'object' && result !== null && 'ok' in result) return result.ok
  return true
}

function changeError(result: CoverChangeResult): string {
  if (typeof result !== 'object' || result === null || !('error' in result)) return 'The cover change could not be saved.'
  const error = result.error
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message
  return 'The cover change could not be saved.'
}

function presetBackground(cover: TaskCoverValue | undefined): string | undefined {
  if (cover?.type === 'color') return TASK_COVER_COLOR_PRESETS.find((preset) => preset.id === cover.value)?.background
  if (cover?.type === 'gradient') return TASK_COVER_GRADIENT_PRESETS.find((preset) => preset.id === cover.value)?.background
  return undefined
}

export function TaskCover({ taskId, cover, onChange, disabled = false, className = '' }: TaskCoverProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let objectUrl: string | null = null
    setImageUrl(null)
    if (cover?.type !== 'image') return () => { active = false }

    void getAttachmentBlob(cover.value)
      .then((blob) => {
        if (!blob) throw new Error('This cover image is no longer available in local browser storage.')
        objectUrl = createAttachmentObjectUrl(blob)
        if (active) setImageUrl(objectUrl)
        else revokeAttachmentObjectUrl(objectUrl)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'The cover image could not be loaded.')
      })

    return () => {
      active = false
      if (objectUrl) revokeAttachmentObjectUrl(objectUrl)
    }
  }, [cover])

  const background = useMemo(() => presetBackground(cover), [cover])

  const commit = async (nextCover?: TaskCoverValue, cleanPrevious = false) => {
    const result = await onChange(nextCover)
    if (!changeAccepted(result)) throw new Error(changeError(result))
    if (cleanPrevious && cover?.type === 'image' && cover.value !== (nextCover?.type === 'image' ? nextCover.value : undefined)) {
      await deleteTaskCoverImage(taskId, cover).catch(() => false)
    }
  }

  const choosePreset = async (nextCover: TaskCoverValue) => {
    setBusy(true)
    setError(null)
    try {
      await commit(nextCover, true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The cover could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  const upload = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setError(null)
    let nextCover: Extract<TaskCoverValue, { type: 'image' }> | undefined
    try {
      nextCover = await storeTaskCoverImage(taskId, file)
      await commit(nextCover, true)
      setOpen(false)
    } catch (cause) {
      if (nextCover) await deleteTaskCoverImage(taskId, nextCover).catch(() => false)
      setError(cause instanceof Error ? cause.message : 'The image could not be used as a cover.')
      setOpen(true)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      await commit(undefined, true)
      setOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The cover could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  const popover = (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (next) setError(null) }}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled || busy}
          className={cover
            ? 'absolute right-3 top-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-md border border-white/25 bg-black/45 px-2.5 text-xs font-semibold text-white shadow-sm backdrop-blur-sm transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60'
            : 'inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2.5 text-xs font-semibold text-[var(--foreground)] shadow-sm transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:opacity-60'}
          aria-label={cover ? 'Change task cover' : 'Add task cover'}
        >
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Palette size={14} aria-hidden="true" />}
          {cover ? 'Cover' : 'Add cover'}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          align="end"
          collisionPadding={12}
          className="z-[150] w-[min(22rem,calc(100vw-1.5rem))] rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-2xl outline-none"
        >
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Task cover</h3>
              <p className="text-[11px] text-[var(--muted-foreground)]">Choose a color, gradient, or local image.</p>
            </div>
            <Popover.Close className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]" aria-label="Close cover settings">
              <X size={14} />
            </Popover.Close>
          </div>

          {error && <p role="alert" className="mb-3 rounded-md bg-red-500/10 px-2.5 py-2 text-xs text-[var(--danger)]">{error}</p>}

          <fieldset disabled={busy}>
            <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Solid</legend>
            <div className="grid grid-cols-8 gap-1.5">
              {TASK_COVER_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => void choosePreset({ type: 'color', value: preset.id as TaskCoverColorPreset })}
                  className="grid aspect-square place-items-center rounded-md border border-black/10 shadow-sm transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                  style={{ background: preset.background }}
                  aria-label={`${preset.label} solid cover`}
                  aria-pressed={cover?.type === 'color' && cover.value === preset.id}
                >
                  {cover?.type === 'color' && cover.value === preset.id && <Check size={14} className="text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>

            <p className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Gradient</p>
            <div className="grid grid-cols-3 gap-1.5">
              {TASK_COVER_GRADIENT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => void choosePreset({ type: 'gradient', value: preset.id as TaskCoverGradientPreset })}
                  className="relative h-10 rounded-md border border-black/10 shadow-sm transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
                  style={{ background: preset.background }}
                  aria-label={`${preset.label} gradient cover`}
                  aria-pressed={cover?.type === 'gradient' && cover.value === preset.id}
                >
                  {cover?.type === 'gradient' && cover.value === preset.id && <Check size={14} className="absolute right-1.5 top-1.5 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>

            <div className="mt-3 border-t border-[var(--ui-border)] pt-3">
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                accept="image/avif,image/jpeg,image/png,image/webp,.avif,.jpg,.jpeg,.png,.webp"
                onChange={(event) => void upload(event.currentTarget.files?.[0])}
              />
              <button type="button" onClick={() => inputRef.current?.click()} className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[var(--ui-border)] text-xs font-semibold hover:bg-[var(--surface-muted)]">
                <Upload size={14} /> Upload image
              </button>
              <p className="mt-1.5 text-center text-[10px] text-[var(--muted-foreground)]">AVIF, JPEG, PNG, or WebP · 10 MB max · at least 320 × 120</p>
            </div>

            {cover?.type === 'image' && (
              <label className="mt-3 block border-t border-[var(--ui-border)] pt-3 text-xs font-medium">
                <span className="mb-2 flex items-center gap-1.5"><MoveVertical size={13} /> Vertical position <output className="ml-auto text-[var(--muted-foreground)]">{Math.round(cover.positionY)}%</output></span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={cover.positionY}
                  onChange={(event) => void choosePreset({ ...cover, positionY: Number(event.currentTarget.value) })}
                  className="w-full accent-[var(--primary)]"
                  aria-label="Cover image vertical position"
                />
              </label>
            )}

            {cover && (
              <button type="button" onClick={() => void remove()} className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs font-semibold text-[var(--danger)] hover:bg-red-500/10">
                <X size={13} /> Remove cover
              </button>
            )}
          </fieldset>
          <Popover.Arrow className="fill-[var(--surface)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )

  if (!cover) return <div className={className}>{popover}</div>

  return (
    <div className={`relative isolate h-32 w-full overflow-hidden rounded-xl bg-[var(--surface-muted)] sm:h-36 ${className}`}>
      {cover.type === 'image' ? (
        imageUrl ? (
          // A CSS background keeps this decorative banner out of the document image flow.
          <div
            role="img"
            aria-label="Task cover image"
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${JSON.stringify(imageUrl)})`, backgroundPosition: `center ${cover.positionY}%` }}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-[var(--muted-foreground)]"><ImageIcon size={22} aria-hidden="true" /></div>
        )
      ) : (
        <div className="absolute inset-0" style={{ background }} aria-hidden="true" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/10" aria-hidden="true" />
      {popover}
    </div>
  )
}
