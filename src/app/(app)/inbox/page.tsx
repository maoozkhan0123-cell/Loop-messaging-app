'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, CircleCheck, Clock3, Diamond, Inbox, LayoutGrid, ListChecks, MailOpen, Mail, RotateCcw, Search, User } from 'lucide-react'
import { format, isThisYear } from 'date-fns'
import { useProfile } from '@/hooks/useProfile'
import { useUnifiedInbox, type InboxItem } from '@/hooks/useProductivity'
import { cn } from '@/lib/utils'
import { InboxTaskDetail } from '@/components/InboxTaskDetail'

// Read and cleared state is kept per browser, keyed by user.
function useStoredIds(key: string | null) {
  const [ids, setIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (!key) return
    try { setIds(new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[])) } catch { setIds(new Set()) }
  }, [key])
  const update = (fn: (next: Set<string>) => void) => setIds((current) => {
    const next = new Set(current)
    fn(next)
    try { if (key) localStorage.setItem(key, JSON.stringify([...next])) } catch {}
    return next
  })
  return [ids, update] as const
}

type Tab = 'all' | 'pending' | 'cleared'

export default function InboxPage() {
  const { data: profile } = useProfile()
  const { data = [], isLoading } = useUnifiedInbox(profile?.id)
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<Tab>('all')
  const [openItem, setOpenItem] = useState<InboxItem | null>(null)
  const [readIds, updateRead] = useStoredIds(profile ? `inbox:${profile.id}:read` : null)
  const [clearedIds, updateCleared] = useStoredIds(profile ? `inbox:${profile.id}:cleared` : null)

  // All = everything not cleared; Pending = not cleared and not done; Cleared = dismissed by the user.
  const inTab = (item: InboxItem, value: Tab) => value === 'cleared' ? clearedIds.has(item.id) : !clearedIds.has(item.id) && (value === 'all' || !item.done)
  const visible = useMemo(() => data.filter((item) =>
    (tab === 'cleared' ? clearedIds.has(item.id) : !clearedIds.has(item.id) && (tab === 'all' || !item.done)) &&
    (!query || `${item.task.title} ${item.assigner?.display_name ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  ), [data, clearedIds, tab, query])

  const groups = useMemo(() => {
    const byMonth = new Map<string, InboxItem[]>()
    for (const item of visible) {
      const date = new Date(item.createdAt)
      const label = format(date, isThisYear(date) ? 'MMMM' : 'MMMM yyyy')
      byMonth.set(label, [...(byMonth.get(label) ?? []), item])
    }
    return [...byMonth.entries()]
  }, [visible])

  const unreadCount = data.filter((item) => !readIds.has(item.id) && !clearedIds.has(item.id)).length
  const tabs = [
    { value: 'all' as const, label: 'All', icon: LayoutGrid, hint: unreadCount ? `${unreadCount} unread` : null },
    { value: 'pending' as const, label: 'Pending', icon: Clock3, hint: `${data.filter((item) => inTab(item, 'pending')).length} open` },
    { value: 'cleared' as const, label: 'Cleared', icon: ListChecks, hint: null },
  ]

  const open = (item: InboxItem) => {
    updateRead((ids) => ids.add(item.id))
    setOpenItem(item)
  }

  if (openItem) return <InboxTaskDetail task={openItem.task} onClose={() => setOpenItem(null)} />

  return <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--content-bg)] text-[var(--text-primary)]">
    <header className="border-b border-[var(--ui-border)] bg-[var(--surface)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Inbox</h1>
          {unreadCount > 0 && <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--primary)]">{unreadCount} new</span>}
        </div>
        <label className="flex h-9 w-full items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] px-3 sm:w-72"><Search size={14} className="text-[var(--text-muted)]"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter tasks" className="w-full bg-transparent text-sm outline-none"/></label>
      </div>
      <nav aria-label="Inbox views" className="mt-3 grid grid-cols-3 px-2 sm:px-6">
        {tabs.map(({ value, label, icon: Icon, hint }) => <button key={value} type="button" onClick={() => setTab(value)} aria-current={tab === value ? 'page' : undefined} className={cn('flex min-w-0 items-center justify-center gap-2.5 border-b-2 px-2 py-2.5 text-left transition-colors sm:justify-start sm:px-4', tab === value ? 'border-[var(--primary)] text-[var(--text-primary)]' : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]')}>
          <Icon size={17} className="flex-shrink-0"/>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{label}</span>{hint && <span className="hidden truncate text-[11px] text-[var(--text-muted)] sm:block">{hint}</span>}</span>
        </button>)}
      </nav>
    </header>

    <section className="flex-1 overflow-y-auto px-5 py-4 sm:px-8 sm:py-6">
      {isLoading ? <div className="mt-6 h-7 w-7 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"/> : groups.length ? <div className="space-y-6">
        {groups.map(([month, items]) => <div key={month}>
          <h2 className="mb-2 px-1 text-sm font-semibold text-[var(--text-secondary)]">{month}</h2>
          <div className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--surface)]">
            {items.map((item) => {
              const unread = !readIds.has(item.id)
              const cleared = clearedIds.has(item.id)
              return <div key={item.id} role="button" tabIndex={0} onClick={() => open(item)} onKeyDown={(event) => { if (event.key === 'Enter') open(item) }} className="group flex h-11 cursor-pointer items-center gap-3 border-b border-[var(--ui-border)] px-4 last:border-b-0 hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none">
                {item.done
                  ? <CircleCheck size={16} className="flex-shrink-0 fill-emerald-500 text-white"/>
                  : <Diamond size={16} className={cn('flex-shrink-0', unread ? 'fill-[var(--primary-soft)] text-[var(--primary)]' : 'text-[var(--text-muted)]')}/>}
                <span className={cn('min-w-0 flex-1 truncate text-sm md:max-w-[40%] md:flex-none md:basis-[40%]', unread ? 'font-semibold' : 'text-[var(--text-secondary)]')}>{item.task.title}</span>
                <span className="hidden min-w-0 flex-1 items-center gap-2 truncate text-sm md:flex">
                  <User size={14} className="flex-shrink-0 text-[var(--text-muted)]"/>
                  <span className="truncate"><span className={unread ? 'font-semibold' : 'text-[var(--text-secondary)]'}>{item.assigner?.display_name ?? 'Someone'}</span> <span className="text-[var(--primary)]">assigned this task to you</span></span>
                </span>
                <span className="ml-auto flex flex-shrink-0 items-center gap-3">
                  <span className="hidden items-center gap-1 group-hover:flex">
                    <button type="button" title={unread ? 'Mark as read' : 'Mark as unread'} aria-label={unread ? 'Mark as read' : 'Mark as unread'} onClick={(event) => { event.stopPropagation(); updateRead((ids) => { if (unread) ids.add(item.id); else ids.delete(item.id) }) }} className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]">{unread ? <MailOpen size={15}/> : <Mail size={15}/>}</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); updateCleared((ids) => { if (cleared) ids.delete(item.id); else ids.add(item.id) }); updateRead((ids) => ids.add(item.id)) }} className="flex h-7 items-center gap-1 rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2.5 text-xs font-semibold shadow-sm hover:border-[var(--primary)]">{cleared ? <><RotateCcw size={13}/>Restore</> : <><Check size={13}/>Clear</>}</button>
                  </span>
                  {item.commentsCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full border border-[var(--ui-border)] px-1 text-[10px] text-[var(--text-secondary)] group-hover:hidden" title={`${item.commentsCount} comments`}>{item.commentsCount}</span>}
                  <time className={cn('w-12 text-right text-xs group-hover:hidden', unread ? 'font-semibold' : 'text-[var(--text-muted)]')}>{format(new Date(item.createdAt), 'MMM d')}</time>
                </span>
              </div>
            })}
          </div>
        </div>)}
      </div> : <div className="mt-2 max-w-sm"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><Inbox/></span><h2 className="mt-4 font-bold">{query ? 'No matching tasks' : tab === 'cleared' ? 'Nothing cleared' : tab === 'pending' ? 'No pending tasks' : 'You’re all caught up'}</h2><p className="mt-1 text-sm text-[var(--text-muted)]">{query ? 'Try a different search.' : tab === 'cleared' ? 'Tasks you clear will appear here.' : tab === 'pending' ? 'Every task assigned to you is done.' : 'Tasks assigned to you will appear here.'}</p></div>}
    </section>
  </main>
}
