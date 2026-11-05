'use client'

import { FormEvent, useMemo, useState } from 'react'
import Link from 'next/link'
import { Building2, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Flag, Lock, MapPin, Plus, Search, Trash2, Users, Video, X } from 'lucide-react'
import { addDays, addMonths, endOfDay, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfDay, startOfMonth, startOfWeek } from 'date-fns'
import { useIsWorkspaceAdmin, useProfile } from '@/hooks/useProfile'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useUnifiedInbox, useWorkspaceEvents } from '@/hooks/useProductivity'
import { Avatar } from '@/components/ui/Avatar'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'
import { eventOccurrences, nextOccurrence, parseCalendarDate } from '@/lib/calendar'
import type { WorkspaceEvent } from '@/types/database'

function localInput(date: Date) { return format(date, "yyyy-MM-dd'T'HH:mm") }

/** One entry on the calendar: a company event, a private meeting, or one of the user's task deadlines. */
type CalendarItem = { id: string; title: string; at: Date; kind: 'company' | 'invite' | 'task'; href?: string }

const KIND_STYLE: Record<CalendarItem['kind'], string> = {
  company: 'bg-amber-100 text-amber-800',
  invite: 'bg-[var(--primary-soft)] text-[var(--primary)]',
  task: 'bg-rose-50 text-rose-700',
}

const EMPTY_FORM = { title: '', description: '', starts: '', ends: '', location: '', meetingUrl: '', recurrence: 'none' as WorkspaceEvent['recurrence'], visibility: 'invite' as WorkspaceEvent['visibility'], inviteeIds: [] as string[] }

export default function CalendarPage() {
  const { data: profile } = useProfile()
  const isAdmin = useIsWorkspaceAdmin()
  const { data: events = [], createEvent, isCreating, deleteEvent, rsvp } = useWorkspaceEvents(profile?.id)
  const { data: inbox = [] } = useUnifiedInbox(profile?.id)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const [form, setForm] = useState(EMPTY_FORM)

  const openForm = (day = new Date()) => {
    const start = new Date(day)
    // Today: the next full hour. Other days: 9 AM.
    if (isToday(day)) start.setHours(start.getHours() + 1, 0, 0, 0)
    else start.setHours(9, 0, 0, 0)
    setForm({ ...EMPTY_FORM, starts: localInput(start), ends: localInput(new Date(start.getTime() + 60 * 60 * 1000)) })
    setError('')
    setOpen(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!profile) return
    setError('')
    if (new Date(form.ends) <= new Date(form.starts)) { setError('The end time must be after the start time.'); return }
    try {
      await createEvent({
        title: form.title.trim(), description: form.description.trim() || null,
        starts_at: new Date(form.starts).toISOString(), ends_at: new Date(form.ends).toISOString(),
        location: form.location.trim() || null, meeting_url: form.meetingUrl.trim() || null,
        recurrence: form.recurrence, visibility: form.visibility,
        inviteeIds: form.visibility === 'invite' ? form.inviteeIds : [],
      })
      setOpen(false)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create event') }
  }

  // Event occurrences in the visible grid (repeats expanded) plus deadlines of open tasks assigned to the user.
  const items = useMemo<CalendarItem[]>(() => {
    const from = startOfDay(startOfWeek(startOfMonth(month))); const to = endOfDay(endOfWeek(endOfMonth(month)))
    return [
      ...events.flatMap((item) => eventOccurrences(item, from, to).map((at) => ({ id: `${item.id}-${at.toISOString()}`, title: item.title, at, kind: item.visibility }))),
      ...inbox.flatMap((entry) => {
        const due = entry.done ? null : parseCalendarDate(entry.task.due_date)
        return due ? [{ id: `task-${entry.id}`, title: entry.task.title, at: due, kind: 'task' as const, href: '/inbox' }] : []
      }),
    ]
  }, [events, inbox, month])

  const today = startOfDay(new Date())
  // Each event once, at its next occurrence (repeating events roll forward).
  const upcomingEvents = events.flatMap((item) => {
    const next = nextOccurrence(item)
    if (!next) return []
    const length = Date.parse(item.ends_at) - Date.parse(item.starts_at)
    return [{ ...item, starts_at: next.toISOString(), ends_at: new Date(next.getTime() + length).toISOString() }]
  }).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
  const upcomingDeadlines = inbox.flatMap((entry) => {
    const due = entry.done ? null : parseCalendarDate(entry.task.due_date)
    return due && due >= today ? [{ entry, due }] : []
  }).sort((a, b) => a.due.getTime() - b.due.getTime()).slice(0, 8)

  const remove = async (item: WorkspaceEvent) => {
    if (!(await confirmDialog({ title: `Delete “${item.title}”?`, description: 'It will be removed from everyone’s calendar.' }))) return
    await deleteEvent(item.id)
  }

  return <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--content-bg)] text-[var(--text-primary)]">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ui-border)] px-6 py-5">
      <div><h1 className="text-2xl font-bold">Calendar</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Company events, your meetings and your task deadlines.</p></div>
      <button onClick={() => openForm()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-bold text-white hover:bg-[var(--primary-hover)]"><Plus size={16}/> New event</button>
    </header>
    <section className="grid flex-1 gap-6 overflow-y-auto p-5 sm:p-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{format(month, 'MMMM yyyy')}</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMonth(startOfMonth(new Date()))} className="h-9 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-muted)]">Today</button>
            <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => addMonths(value, -1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--surface-muted)]"><ChevronLeft size={18}/></button>
            <button type="button" aria-label="Next month" onClick={() => setMonth((value) => addMonths(value, 1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--surface-muted)]"><ChevronRight size={18}/></button>
          </div>
        </div>
        <MonthGrid month={month} items={items} onDay={openForm}/>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--text-muted)]">
          <Legend kind="company" label="Company-wide" hint="holidays and events for everyone"/>
          <Legend kind="invite" label="Meetings" hint="only you and the people invited"/>
          <Legend kind="task" label="Your deadlines" hint="due dates of tasks assigned to you"/>
        </div>
      </div>

      <aside className="min-w-0 space-y-6">
        <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Upcoming events</h2>
          {upcomingEvents.length ? <div className="space-y-3">{upcomingEvents.map((item) => <EventCard key={item.id} item={item} meId={profile?.id} onRsvp={(response) => void rsvp({ eventId: item.id, response })} onDelete={() => void remove(item)}/>)}</div>
            : <div className="rounded-2xl border border-dashed border-[var(--ui-border)] px-4 py-10 text-center"><CalendarDays className="mx-auto text-[var(--text-muted)]"/><h3 className="mt-3 font-bold">No upcoming events</h3><p className="mt-1 text-sm text-[var(--text-muted)]">Meetings you create or are invited to show here.</p></div>}
        </div>
        {upcomingDeadlines.length > 0 && <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Your deadlines</h2>
          <div className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)]">
            {upcomingDeadlines.map(({ entry, due }) => <Link key={entry.id} href="/inbox" className="flex items-center gap-3 border-b border-[var(--ui-border)] px-4 py-3 last:border-b-0 hover:bg-[var(--surface-muted)]">
              <Flag size={14} className="shrink-0 text-rose-600"/>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{entry.task.title}</span>
              <span className={cn('shrink-0 text-xs font-semibold', isToday(due) ? 'text-rose-600' : 'text-[var(--text-muted)]')}>{isToday(due) ? 'Today' : format(due, 'MMM d')}</span>
            </Link>)}
          </div>
        </div>}
      </aside>
    </section>

    {open && <EventForm form={form} setForm={setForm} isAdmin={isAdmin} meId={profile?.id} error={error} isCreating={isCreating} onSubmit={submit} onClose={() => setOpen(false)}/>}
  </main>
}

const LEGEND_SWATCH: Record<CalendarItem['kind'], string> = { company: 'bg-amber-400', invite: 'bg-[var(--primary)]', task: 'bg-rose-500' }

function Legend({ kind, label, hint }: { kind: CalendarItem['kind']; label: string; hint: string }) {
  return <span className="flex items-center gap-1.5" title={hint}>
    {kind === 'task' ? <Flag size={12} className="text-rose-600"/> : <span className={cn('h-2.5 w-2.5 rounded-sm', LEGEND_SWATCH[kind])}/>}
    <span><span className="font-medium text-[var(--text-secondary)]">{label}</span> <span className="hidden sm:inline">· {hint}</span></span>
  </span>
}

function EventCard({ item, meId, onRsvp, onDelete }: { item: WorkspaceEvent; meId?: string; onRsvp: (response: 'accepted' | 'declined' | 'maybe') => void; onDelete: () => void }) {
  const mine = item.created_by === meId
  const company = item.visibility === 'company'
  return <article className="rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] p-4 shadow-sm">
    <div className="flex gap-4">
      <div className={cn('flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl', company ? 'bg-amber-100 text-amber-800' : 'bg-[var(--primary-soft)] text-[var(--primary)]')}>
        <span className="text-[10px] font-bold uppercase">{format(new Date(item.starts_at), 'MMM')}</span>
        <strong className="text-xl leading-none">{format(new Date(item.starts_at), 'd')}</strong>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 font-bold">{item.title}</h3>
          {mine && <button type="button" aria-label="Delete event" onClick={onDelete} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--text-muted)] hover:bg-red-50 hover:text-red-600"><Trash2 size={14}/></button>}
        </div>
        <span className={cn('mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', company ? 'bg-amber-50 text-amber-800' : 'bg-[var(--surface-muted)] text-[var(--text-secondary)]')}>
          {company ? <><Building2 size={11}/>Company-wide</> : <><Lock size={11}/>Private · {item.attendee_count ?? 1} {item.attendee_count === 1 ? 'person' : 'people'}</>}
        </span>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
          <span className="flex items-center gap-1"><Clock size={12}/>{format(new Date(item.starts_at), 'p')}–{format(new Date(item.ends_at), 'p')}{item.recurrence !== 'none' && ` · repeats ${item.recurrence}`}</span>
          {item.location && <span className="flex items-center gap-1"><MapPin size={12}/>{item.location}</span>}
          {item.meeting_url && <a className="flex items-center gap-1 text-[var(--primary)] hover:underline" href={item.meeting_url} target="_blank" rel="noreferrer"><Video size={12}/>Join meeting</a>}
        </div>
        {item.description && <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.description}</p>}
        <p className="mt-2 text-xs text-[var(--text-muted)]">{mine ? 'You organised this' : `Organised by ${item.creator?.display_name ?? 'a teammate'}`}</p>
        {!mine && <div className="mt-3 flex gap-2">
          {(['accepted', 'maybe', 'declined'] as const).map((response) => <button key={response} type="button" onClick={() => onRsvp(response)} aria-pressed={item.my_response === response}
            className={cn('flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-semibold capitalize', item.my_response === response ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--ui-border)] hover:border-[var(--primary)]')}>
            {item.my_response === response && <Check size={12}/>}{response === 'accepted' ? 'Going' : response === 'declined' ? 'Not going' : 'Maybe'}
          </button>)}
        </div>}
      </div>
    </div>
  </article>
}

function EventForm({ form, setForm, isAdmin, meId, error, isCreating, onSubmit, onClose }: {
  form: typeof EMPTY_FORM; setForm: (form: typeof EMPTY_FORM) => void; isAdmin: boolean; meId?: string; error: string; isCreating: boolean
  onSubmit: (event: FormEvent) => void; onClose: () => void
}) {
  const { data: profiles = [] } = useAllProfiles()
  const [query, setQuery] = useState('')
  const people = profiles.filter((person) => person.id !== meId)
  const matches = people.filter((person) => !form.inviteeIds.includes(person.id) && `${person.display_name} ${person.email ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  const invited = people.filter((person) => form.inviteeIds.includes(person.id))
  const field = 'mt-1.5 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-transparent px-3 font-normal outline-none focus:border-[var(--primary)]'

  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <form onSubmit={onSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--surface)] p-6 shadow-2xl">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">New event</h2><button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-2 hover:bg-[var(--surface-muted)]"><X size={18}/></button></div>
      <div className="space-y-4">
        <label className="block text-sm font-semibold">Title<input required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={field}/></label>

        <fieldset>
          <legend className="text-sm font-semibold">Who can see this</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <VisibilityOption active={form.visibility === 'invite'} onClick={() => setForm({ ...form, visibility: 'invite' })} icon={<Lock size={15}/>} title="Invite only" hint="You and the people you invite"/>
            <VisibilityOption active={form.visibility === 'company'} disabled={!isAdmin} onClick={() => setForm({ ...form, visibility: 'company' })} icon={<Building2 size={15}/>} title="Company-wide" hint={isAdmin ? 'Everyone, e.g. holidays' : 'Only admins can post these'}/>
          </div>
        </fieldset>

        {form.visibility === 'invite' && <div>
          <span className="flex items-center gap-1.5 text-sm font-semibold"><Users size={14}/>Invite people</span>
          {invited.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{invited.map((person) => <span key={person.id} className="flex items-center gap-1.5 rounded-full bg-[var(--primary-soft)] py-0.5 pl-0.5 pr-2 text-xs font-semibold text-[var(--primary)]">
            <Avatar src={person.avatar_url} name={person.display_name} size={20}/>{person.display_name}
            <button type="button" aria-label={`Remove ${person.display_name}`} onClick={() => setForm({ ...form, inviteeIds: form.inviteeIds.filter((id) => id !== person.id) })}><X size={12}/></button>
          </span>)}</div>}
          <label className="mt-2 flex h-9 items-center gap-2 rounded-lg border border-[var(--ui-border)] px-3 focus-within:border-[var(--primary)]"><Search size={14} className="text-[var(--text-muted)]"/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search teammates" className="min-w-0 flex-1 bg-transparent text-sm outline-none"/></label>
          <div className="mt-1 max-h-36 overflow-y-auto">{matches.length ? matches.map((person) => <button key={person.id} type="button" onClick={() => { setForm({ ...form, inviteeIds: [...form.inviteeIds, person.id] }); setQuery('') }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-[var(--surface-muted)]">
            <Avatar src={person.avatar_url} name={person.display_name} size={26}/><span className="min-w-0 flex-1 truncate">{person.display_name}</span><Plus size={14} className="text-[var(--text-muted)]"/>
          </button>) : <p className="px-2 py-2 text-xs text-[var(--text-muted)]">{query ? 'No one matches.' : 'Everyone is invited.'}</p>}</div>
        </div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Starts<input required type="datetime-local" value={form.starts} onChange={(e) => setForm({ ...form, starts: e.target.value })} className={field}/></label>
          <label className="text-sm font-semibold">Ends<input required type="datetime-local" value={form.ends} min={form.starts} onChange={(e) => setForm({ ...form, ends: e.target.value })} className={field}/></label>
        </div>
        <label className="block text-sm font-semibold">Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1.5 w-full rounded-lg border border-[var(--ui-border)] bg-transparent p-3 font-normal outline-none focus:border-[var(--primary)]"/></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className={field}/></label>
          <label className="text-sm font-semibold">Repeats<select value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as typeof form.recurrence })} className={cn(field, 'bg-[var(--surface)]')}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        </div>
        <label className="block text-sm font-semibold">Meeting link<input type="url" value={form.meetingUrl} onChange={(e) => setForm({ ...form, meetingUrl: e.target.value })} placeholder="https://" className={field}/></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <button disabled={isCreating} className="h-11 w-full rounded-lg bg-[var(--primary)] font-bold text-white hover:bg-[var(--primary-hover)] disabled:opacity-60">{isCreating ? 'Creating…' : form.visibility === 'company' ? 'Post to everyone' : form.inviteeIds.length ? `Create and invite ${form.inviteeIds.length}` : 'Create event'}</button>
      </div>
    </form>
  </div>
}

function VisibilityOption({ active, disabled, onClick, icon, title, hint }: { active: boolean; disabled?: boolean; onClick: () => void; icon: React.ReactNode; title: string; hint: string }) {
  return <button type="button" disabled={disabled} onClick={onClick} aria-pressed={active}
    className={cn('flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50', active ? 'border-[var(--primary)] bg-[var(--primary-soft)]' : 'border-[var(--ui-border)] hover:border-[var(--primary)]')}>
    <span className={cn('mt-0.5', active ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]')}>{icon}</span>
    <span><span className="block text-sm font-semibold">{title}</span><span className="block text-xs font-normal text-[var(--text-muted)]">{hint}</span></span>
  </button>
}

function MonthGrid({ month, items, onDay }: { month: Date; items: CalendarItem[]; onDay: (day: Date) => void }) {
  const first = startOfWeek(startOfMonth(month))
  const last = endOfWeek(endOfMonth(month))
  const days: Date[] = []
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day)
  return <div className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] shadow-sm">
    <div className="grid grid-cols-7 border-b border-[var(--ui-border)]">{days.slice(0, 7).map((day) => <div key={day.toISOString()} className="px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{format(day, 'EEE')}</div>)}</div>
    <div className="grid grid-cols-7">{days.map((day) => {
      const dayItems = items.filter((item) => isSameDay(item.at, day)).sort((a, b) => a.at.getTime() - b.at.getTime())
      return <div key={day.toISOString()} role="button" tabIndex={0} onClick={() => onDay(day)} onKeyDown={(e) => { if (e.key === 'Enter') onDay(day) }} title={`New event on ${format(day, 'MMMM d')}`}
        className={cn('flex min-h-[72px] cursor-pointer flex-col items-stretch gap-1 border-b border-r border-[var(--ui-border)] p-1.5 text-left transition-colors hover:bg-[var(--surface-muted)] sm:min-h-[104px] [&:nth-child(7n)]:border-r-0', !isSameMonth(day, month) && 'bg-[var(--surface-muted)]/50 text-[var(--text-muted)]')}>
        <span className={cn('grid h-7 w-7 place-items-center rounded-full text-xs font-semibold', isToday(day) && 'bg-[var(--primary)] text-white')}>{format(day, 'd')}</span>
        {dayItems.slice(0, 3).map((item) => {
          const label = <>{item.kind === 'task' ? <Flag size={10} className="mr-1 inline"/> : item.kind === 'invite' ? `${format(item.at, 'p')} ` : ''}{item.title}</>
          return item.href
            ? <Link key={item.id} href={item.href} onClick={(e) => e.stopPropagation()} className={cn('truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold hover:opacity-80', KIND_STYLE[item.kind])}>{label}</Link>
            : <span key={item.id} className={cn('truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold', KIND_STYLE[item.kind])}>{label}</span>
        })}
        {dayItems.length > 3 && <span className="px-1.5 text-[11px] text-[var(--text-muted)]">+{dayItems.length - 3} more</span>}
      </div>
    })}</div>
  </div>
}
