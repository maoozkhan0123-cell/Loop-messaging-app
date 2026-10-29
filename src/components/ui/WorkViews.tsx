'use client'

import { BarChart3, Kanban, List } from 'lucide-react'
import { cn } from '@/lib/utils'

export type WorkView = 'board' | 'list' | 'gantt'

export function ViewSwitcher({ value, onChange, includeBoard = false }: { value: WorkView; onChange: (view: WorkView) => void; includeBoard?: boolean }) {
  const options: Array<[WorkView, string, typeof List]> = [
    ...(includeBoard ? [['board', 'Board', Kanban] as [WorkView, string, typeof List]] : []),
    ['list', 'List', List],
    ['gantt', 'Gantt', BarChart3],
  ]
  return <div className="inline-flex h-9 items-center rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] p-1" aria-label="Choose view">
    {options.map(([id, label, Icon]) => <button key={id} type="button" aria-label={`${label} view`} aria-pressed={value === id} title={`${label} view`} onClick={() => onChange(id)} className={cn('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors', value === id ? 'bg-[var(--primary)] text-white shadow-sm' : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]')}><Icon size={13}/><span className="hidden sm:inline">{label}</span></button>)}
  </div>
}

export type GanttItem = { id: string; title: string; subtitle?: string; start: string | Date; end?: string | Date | null; color?: string; onClick?: () => void }

const DAY = 86_400_000
const dayStart = (value: string | Date) => { const date = new Date(value); return new Date(date.getFullYear(), date.getMonth(), date.getDate()) }

export function GanttChart({ items, emptyText = 'No dated items to show.' }: { items: GanttItem[]; emptyText?: string }) {
  if (!items.length) return <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-[var(--ui-border)] text-sm text-[var(--muted-foreground)]">{emptyText}</div>
  const normalized = items.map((item) => ({ ...item, startDate: dayStart(item.start), endDate: dayStart(item.end || item.start) }))
  const earliest = Math.min(...normalized.map((item) => item.startDate.getTime()))
  const latest = Math.max(...normalized.map((item) => item.endDate.getTime()))
  const actualDays = Math.max(1, Math.ceil((latest - earliest) / DAY) + 1)
  const displayDays = Math.max(7, actualDays)
  const span = Math.min(31, displayDays)
  const rangeStart = new Date(earliest)
  const interval = span === 1 ? 0 : (displayDays - 1) / (span - 1)
  const days = Array.from({ length: span }, (_, index) => new Date(rangeStart.getTime() + Math.round(index * interval) * DAY))

  return <div className="overflow-x-auto rounded-xl border border-[var(--ui-border)] bg-[var(--surface)]">
    <div className="min-w-[760px]" style={{ gridTemplateColumns: `220px repeat(${span}, minmax(32px, 1fr))` }}>
      <div className="sticky top-0 z-10 grid border-b border-[var(--ui-border)] bg-[var(--surface-raised)]" style={{ gridTemplateColumns: `220px repeat(${span}, minmax(32px, 1fr))` }}>
        <div className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Item</div>
        {days.map((day, index) => <div key={`${day.toISOString()}-${index}`} className="border-l border-[var(--ui-border)] px-1 py-2 text-center"><span className="block text-[9px] uppercase text-[var(--muted-foreground)]">{day.toLocaleDateString(undefined, displayDays > 31 ? {month:'short'} : {weekday:'short'})}</span><strong className="text-[11px]">{day.getDate()}</strong></div>)}
      </div>
      {normalized.map((item) => {
        const start = Math.max(0, (item.startDate.getTime() - rangeStart.getTime()) / DAY)
        const end = Math.min(displayDays - 1, Math.max(start, (item.endDate.getTime() - rangeStart.getTime()) / DAY))
        return <button key={item.id} type="button" onClick={item.onClick} aria-label={item.onClick ? `Open ${item.title}` : undefined} className={cn('grid w-full text-left border-b border-[var(--ui-border)] last:border-b-0', item.onClick ? 'cursor-pointer hover:bg-[var(--surface-muted)]' : 'cursor-default')} style={{ gridTemplateColumns: `220px repeat(${span}, minmax(32px, 1fr))` }}>
          <div className="min-w-0 px-4 py-3"><span className="block truncate text-xs font-semibold">{item.title}</span>{item.subtitle && <span className="block truncate text-[10px] text-[var(--muted-foreground)]">{item.subtitle}</span>}</div>
          <div className="relative col-span-full col-start-2 row-start-1 grid" style={{ gridTemplateColumns: `repeat(${span}, minmax(32px, 1fr))` }}>{days.map((day,index) => <span key={`${day.toISOString()}-${index}`} className="h-full border-l border-[var(--ui-border)]" />)}<span className="absolute top-1/2 h-5 min-w-2 -translate-y-1/2 rounded-full shadow-sm" style={{ left:`calc(${start} * 100% / ${displayDays} + 4px)`, width:`max(8px, calc(${end - start + 1} * 100% / ${displayDays} - 8px))`, background:item.color || 'var(--primary)' }} /></div>
        </button>
      })}
    </div>
  </div>
}
