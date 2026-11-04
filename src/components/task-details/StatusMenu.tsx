'use client'

import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Check, ChevronDown, CircleCheck, Diamond, Search } from 'lucide-react'
import type { ProjectColumn } from '@/types/database'
import type { TaskStatus } from '@/types/task'

export type StatusMeta = Record<TaskStatus, { label: string; color: string }>

const GROUPS: Array<{ label: string; statuses: TaskStatus[] }> = [
  { label: 'Not started', statuses: ['backlog', 'todo'] },
  { label: 'Active', statuses: ['in_progress', 'in_review'] },
  { label: 'Closed', statuses: ['done'] },
]

function StatusIcon({ status, color, size = 15 }: { status: TaskStatus; color: string; size?: number }) {
  if (status === 'done') return <CircleCheck size={size} className="flex-shrink-0 text-white" style={{ fill: color }} />
  const started = status === 'in_progress' || status === 'in_review'
  return <Diamond size={size} className="flex-shrink-0" style={{ color, fill: started ? `${color}33` : 'transparent' }} />
}

/** Searchable status picker grouped by workflow stage; each option is a board column. */
export function StatusMenu({
  columns,
  value,
  statusOf,
  meta,
  onChange,
  disabled,
  variant = 'badge',
}: {
  columns: ProjectColumn[]
  value: string
  statusOf: (columnName: string) => TaskStatus
  meta: StatusMeta
  onChange: (columnId: string) => void
  disabled?: boolean
  /** `badge` is a filled pill (properties); `field` is an outlined control (header). */
  variant?: 'badge' | 'field'
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const current = columns.find((column) => column.id === value)
  const currentStatus = statusOf(current?.name ?? '')
  const color = meta[currentStatus].color
  const needle = query.trim().toLowerCase()

  const groups = GROUPS.map((group) => ({
    ...group,
    columns: columns.filter((column) => group.statuses.includes(statusOf(column.name)) && (!needle || column.name.toLowerCase().includes(needle))),
  })).filter((group) => group.columns.length)

  const choose = (columnId: string) => {
    setOpen(false)
    setQuery('')
    if (columnId !== value) onChange(columnId)
  }

  return (
    <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery('') }}>
      <Popover.Trigger asChild disabled={disabled}>
        {variant === 'badge' ? (
          <button
            type="button"
            aria-label={`Status: ${current?.name ?? 'Not set'}`}
            className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
            style={{ background: color }}
          >
            <span className="truncate">{current?.name ?? 'Not set'}</span>
            <ChevronDown size={12} className="flex-shrink-0 opacity-80" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Status: ${current?.name ?? 'Not set'}`}
            className="flex h-9 max-w-48 items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] pl-2.5 pr-2 text-[11px] font-semibold outline-none hover:bg-[var(--surface-muted)] focus-visible:border-[var(--primary)] disabled:opacity-60"
          >
            <StatusIcon status={currentStatus} color={color} size={13} />
            <span className="truncate">{current?.name ?? 'Status'}</span>
            <ChevronDown size={12} className="flex-shrink-0" />
          </button>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-[120] w-60 overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] text-[var(--foreground)] shadow-xl outline-none"
        >
          <div className="border-b border-[var(--ui-border)] p-2">
            <label className="flex h-8 items-center gap-2 rounded-lg border border-[var(--ui-border)] px-2.5 focus-within:border-[var(--primary)]">
              <Search size={13} className="text-[var(--muted-foreground)]" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter' && groups[0]?.columns[0]) choose(groups[0].columns[0].id) }}
                placeholder="Search status…"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              />
            </label>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {groups.map((group) => (
              <div key={group.label} className="border-b border-[var(--ui-border)] py-1 last:border-b-0">
                <p className="px-3 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">{group.label}</p>
                {group.columns.map((column) => {
                  const status = statusOf(column.name)
                  const selected = column.id === value
                  return (
                    <button
                      key={column.id}
                      type="button"
                      onClick={() => choose(column.id)}
                      className={`mx-1 flex w-[calc(100%-0.5rem)] items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide hover:bg-[var(--surface-muted)] ${selected ? 'bg-[var(--surface-muted)]' : ''}`}
                    >
                      <StatusIcon status={status} color={meta[status].color} />
                      <span className="min-w-0 flex-1 truncate">{column.name}</span>
                      {selected && <Check size={14} className="flex-shrink-0 text-[var(--primary)]" />}
                    </button>
                  )
                })}
              </div>
            ))}
            {!groups.length && <p className="px-3 py-4 text-center text-xs text-[var(--muted-foreground)]">No matching status</p>}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
