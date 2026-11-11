'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Loader2, X } from 'lucide-react'
import { useDashboard } from '@/hooks/useDashboard'
import { CreateTaskDialog } from './CreateTaskDialog'
import { messageTaskDraft, withMessageSource } from '@/lib/messageTask'
import type { Message } from '@/types/database'

export function CreateMessageTaskDialog({ message, conversation, isDM, currentUserId, onClose }: {
  message: Message; conversation: string; isDM: boolean; currentUserId: string; onClose: () => void
}) {
  const { data, isLoading, error, refetch, createTask, isCreatingTask } = useDashboard()
  const draft = messageTaskDraft(message, conversation, isDM, typeof location === 'undefined' ? '' : location.origin)
  if (!data) return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}><Dialog.Portal>
    <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/50" />
    <Dialog.Content className="fixed left-1/2 top-1/2 z-[121] w-[min(440px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-[var(--surface)] p-6 text-[var(--foreground)] shadow-xl">
      <Dialog.Title className="font-semibold">Create task from message</Dialog.Title>
      <Dialog.Description className="mt-2 text-sm text-[var(--muted-foreground)]">Choose a project and review the message before creating a task.</Dialog.Description>
      <Dialog.Close aria-label="Close task form" className="absolute right-3 top-3 rounded p-1"><X size={16} /></Dialog.Close>
      {isLoading ? <p role="status" className="mt-5 flex items-center gap-2 text-sm"><Loader2 size={16} className="animate-spin" />Loading projects…</p>
        : <div className="mt-5"><p role="alert" className="text-sm">{error instanceof Error ? error.message : 'Projects could not be loaded.'}</p><button type="button" onClick={() => void refetch()} className="mt-3 text-sm font-semibold text-[var(--primary)]">Retry projects</button></div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
  return <CreateTaskDialog open onOpenChange={(open) => { if (!open) onClose() }}
    boards={data.boards} columns={data.columns} profiles={data.profiles} meId={currentUserId}
    defaultTitle={draft.title} defaultDescription={draft.description} sourceMessage={draft.source}
    availableLabels={Array.from(new Set(data.tasks.flatMap((task) => task.labels ?? [])))} creating={isCreatingTask}
    onCreate={(input) => createTask({ ...input, description: withMessageSource(input.description, draft.source) })} />
}
