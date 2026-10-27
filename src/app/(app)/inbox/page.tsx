'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AtSign, CheckCheck, Inbox, ListTodo, MessageSquare, Search } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { useProfile } from '@/hooks/useProfile'
import { useUnifiedInbox } from '@/hooks/useProductivity'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'unread' | 'mention' | 'task'

export default function InboxPage() {
  const router = useRouter()
  const { data: profile } = useProfile()
  const { data = [], isLoading } = useUnifiedInbox(profile?.id)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const visible = useMemo(() => data.filter((item) => {
    if (filter === 'unread' && !item.unread) return false
    if (filter === 'mention' && item.kind !== 'mention') return false
    if (filter === 'task' && item.kind !== 'task') return false
    return !query || `${item.title} ${item.detail}`.toLowerCase().includes(query.toLowerCase())
  }), [data, filter, query])
  const icons = { mention: AtSign, message: MessageSquare, task: ListTodo }

  return <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--content-bg)] text-[var(--text-primary)]">
    <header className="border-b border-[var(--ui-border)] px-5 py-4 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold">Inbox</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Messages, mentions and assignments that need your attention.</p></div><span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-bold text-[var(--primary)]">{data.filter((item) => item.unread).length} unread</span></div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(['all','unread','mention','task'] as Filter[]).map((value) => <button key={value} onClick={() => setFilter(value)} className={cn('rounded-lg px-3 py-2 text-xs font-semibold capitalize', filter === value ? 'bg-[var(--primary)] text-white' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]')}>{value === 'mention' ? 'Mentions' : value === 'task' ? 'Tasks' : value}</button>)}
        <label className="ml-auto flex h-9 min-w-52 items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] px-3"><Search size={14} className="text-[var(--text-muted)]"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter inbox" className="w-full bg-transparent text-sm outline-none"/></label>
      </div>
    </header>
    <section className="flex-1 overflow-y-auto p-4 sm:p-6">
      {isLoading ? <div className="mx-auto mt-20 h-7 w-7 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent"/> : visible.length ? <div className="mx-auto max-w-4xl space-y-2">{visible.map((item) => { const Icon = icons[item.kind]; return <button key={item.id} onClick={() => router.push(item.href)} className="group flex w-full items-start gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] p-4 text-left shadow-sm transition hover:-translate-y-px hover:border-[var(--primary)]"><span className={cn('mt-0.5 rounded-lg p-2', item.unread ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'bg-[var(--surface-muted)] text-[var(--text-muted)]')}><Icon size={17}/></span><span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="text-sm">{item.title}</strong>{item.unread && <span className="h-2 w-2 rounded-full bg-[var(--primary)]"/>}</span><span className="mt-1 block truncate text-sm text-[var(--text-secondary)]">{item.detail}</span></span><time className="whitespace-nowrap text-xs text-[var(--text-muted)]">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</time></button>})}</div> : <div className="mx-auto mt-20 max-w-sm text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]">{filter === 'unread' ? <CheckCheck/> : <Inbox/>}</span><h2 className="mt-4 font-bold">You’re all caught up</h2><p className="mt-1 text-sm text-[var(--text-muted)]">New messages, mentions and task assignments will appear here.</p></div>}
    </section>
  </main>
}
