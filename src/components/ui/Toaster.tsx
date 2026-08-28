'use client'

import * as Toast from '@radix-ui/react-toast'
import { createContext, useContext, useState, useCallback } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastType = 'default' | 'success' | 'error'

interface ToastItem {
  id: string
  title: string
  description?: string
  type: ToastType
}

interface ToastContextValue {
  toast: (opts: { title: string; description?: string; type?: ToastType }) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const addToast = useCallback(
    ({ title, description, type = 'default' }: { title: string; description?: string; type?: ToastType }) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { id, title, description, type }])
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, 4000)
    },
    []
  )

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      <Toast.Provider swipeDirection="right">
        {toasts.map((t) => (
          <Toast.Root
            key={t.id}
            open={true}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg',
              'bg-white border-[#E5E7EB]',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4',
              'data-[state=closed]:animate-out data-[state=closed]:fade-out',
              'max-w-sm w-full'
            )}
          >
            <div className="flex-1 min-w-0">
              <Toast.Title className="text-sm font-medium text-[#111827]">{t.title}</Toast.Title>
              {t.description && (
                <Toast.Description className="text-xs text-[#6B7280] mt-0.5">{t.description}</Toast.Description>
              )}
            </div>
            <Toast.Close className="text-[#9CA3AF] hover:text-[#6B7280] flex-shrink-0">
              <X size={14} />
            </Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 z-[9999] w-full max-w-sm" />
      </Toast.Provider>
    </ToastContext.Provider>
  )
}
