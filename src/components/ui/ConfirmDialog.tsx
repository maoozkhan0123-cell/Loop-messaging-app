'use client'

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle } from 'lucide-react'

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Style the confirm button as destructive. Defaults to true. */
  danger?: boolean
}

type Request = ConfirmOptions & { resolve: (value: boolean) => void }

let show: ((request: Request) => void) | null = null

/**
 * In-app replacement for window.confirm. Resolves true when confirmed.
 * Falls back to the native dialog when no <ConfirmDialogHost /> is mounted (e.g. in tests).
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!show) return Promise.resolve(window.confirm(options.description ? `${options.title}\n\n${options.description}` : options.title))
  return new Promise((resolve) => show?.({ ...options, resolve }))
}

export function ConfirmDialogHost() {
  const [request, setRequest] = useState<Request | null>(null)

  useEffect(() => {
    show = setRequest
    return () => { show = null }
  }, [])

  const settle = (value: boolean) => {
    request?.resolve(value)
    setRequest(null)
  }
  const danger = request?.danger ?? true

  return (
    <Dialog.Root open={!!request} onOpenChange={(open) => { if (!open) settle(false) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[201] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] p-5 text-[var(--foreground)] shadow-2xl outline-none"
        >
          <div className="flex gap-3.5">
            <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full ${danger ? 'bg-red-50 text-red-600' : 'bg-[var(--primary-soft)] text-[var(--primary)]'}`}>
              <AlertTriangle size={18} />
            </span>
            <div className="min-w-0 pt-0.5">
              <Dialog.Title className="text-[15px] font-semibold">{request?.title}</Dialog.Title>
              {request?.description && <p className="mt-1 text-sm text-[var(--muted-foreground)]">{request.description}</p>}
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => settle(false)}
              className="h-9 rounded-lg border border-[var(--ui-border)] px-4 text-sm font-semibold hover:bg-[var(--surface-muted)]"
            >
              {request?.cancelLabel ?? 'Cancel'}
            </button>
            <button
              type="button"
              autoFocus
              onClick={() => settle(true)}
              className={`h-9 rounded-lg px-4 text-sm font-semibold text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[var(--primary)] hover:bg-[var(--primary-hover)]'}`}
            >
              {request?.confirmLabel ?? 'Delete'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
