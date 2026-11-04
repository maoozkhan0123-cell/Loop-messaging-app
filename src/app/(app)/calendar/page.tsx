'use client'

import { FormEvent, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Plus, Video, X } from 'lucide-react'
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { useProfile } from '@/hooks/useProfile'
import { useWorkspaceEvents } from '@/hooks/useProductivity'

function localInput(date: Date) { return format(date, "yyyy-MM-dd'T'HH:mm") }

export default function CalendarPage() {
  const { data: profile } = useProfile()
  const { data: events = [], createEvent, isCreating, rsvp } = useWorkspaceEvents(profile?.id)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(() => startOfMonth(new Date()))
  const now = new Date(); const later = new Date(now.getTime() + 60 * 60 * 1000)
  const [form, setForm] = useState({ title: '', description: '', starts: localInput(now), ends: localInput(later), location: '', meetingUrl: '', recurrence: 'none' as 'none'|'daily'|'weekly'|'monthly' })
  const openForDay = (day: Date) => {
    const start = new Date(day); start.setHours(9, 0, 0, 0)
    setForm((old) => ({ ...old, starts: localInput(start), ends: localInput(new Date(start.getTime() + 60 * 60 * 1000)) }))
    setOpen(true)
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!profile) return
    setError('')
    try {
      await createEvent({ title: form.title.trim(), description: form.description.trim() || null, starts_at: new Date(form.starts).toISOString(), ends_at: new Date(form.ends).toISOString(), location: form.location.trim() || null, meeting_url: form.meetingUrl.trim() || null, recurrence: form.recurrence, created_by: profile.id })
      setOpen(false); setForm((old) => ({ ...old, title: '', description: '', location: '', meetingUrl: '' }))
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create event') }
  }

  return <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--content-bg)] text-[var(--text-primary)]">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--ui-border)] px-6 py-5"><div><h1 className="text-2xl font-bold">Calendar</h1><p className="mt-1 text-sm text-[var(--text-muted)]">Events, meetings and deadlines in one place.</p></div><button onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-bold text-white"><Plus size={16}/> New event</button></header>
    <section className="grid flex-1 gap-6 overflow-y-auto p-5 sm:p-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{format(month, 'MMMM yyyy')}</h2>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setMonth(startOfMonth(new Date()))} className="h-9 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] px-3 text-sm font-semibold hover:bg-[var(--surface-muted)]">Today</button>
            <button type="button" aria-label="Previous month" onClick={() => setMonth((value) => addMonths(value, -1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--surface-muted)]"><ChevronLeft size={18}/></button>
            <button type="button" aria-label="Next month" onClick={() => setMonth((value) => addMonths(value, 1))} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[var(--surface-muted)]"><ChevronRight size={18}/></button>
          </div>
        </div>
        <MonthGrid month={month} events={events} onDay={openForDay}/>
      </div>
      <aside className="min-w-0"><h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">Upcoming</h2>{events.length ? <div className="space-y-3">{events.map((item) => <article key={item.id} className="flex gap-4 rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] p-4 shadow-sm"><div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><span className="text-[10px] font-bold uppercase">{format(new Date(item.starts_at), 'MMM')}</span><strong className="text-xl leading-none">{format(new Date(item.starts_at), 'd')}</strong></div><div className="min-w-0 flex-1"><h3 className="font-bold">{item.title}</h3><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]"><span className="flex items-center gap-1"><Clock size={12}/>{format(new Date(item.starts_at), 'p')}–{format(new Date(item.ends_at), 'p')}</span>{item.location && <span className="flex items-center gap-1"><MapPin size={12}/>{item.location}</span>}{item.meeting_url && <a className="flex items-center gap-1 text-[var(--primary)] hover:underline" href={item.meeting_url} target="_blank" rel="noreferrer"><Video size={12}/>Join meeting</a>}</div>{item.description && <p className="mt-2 text-sm text-[var(--text-secondary)]">{item.description}</p>}<div className="mt-3 flex gap-2">{(['accepted','maybe','declined'] as const).map((response) => <button key={response} onClick={() => void rsvp({ eventId: item.id, response })} className="rounded-md border border-[var(--ui-border)] px-2.5 py-1 text-xs font-semibold capitalize hover:border-[var(--primary)]">{response === 'accepted' ? 'Going' : response}</button>)}</div></div></article>)}</div> : <div className="rounded-2xl border border-dashed border-[var(--ui-border)] px-4 py-12 text-center"><CalendarDays className="mx-auto text-[var(--text-muted)]"/><h2 className="mt-3 font-bold">No upcoming events</h2><p className="mt-1 text-sm text-[var(--text-muted)]">Create the first event for your workspace.</p></div>}</aside>
    </section>
    {open && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/45 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}><form onSubmit={submit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-[var(--surface)] p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-bold">Create event</h2><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-[var(--surface-muted)]"><X size={18}/></button></div><div className="space-y-4"><label className="block text-sm font-semibold">Title<input required maxLength={160} value={form.title} onChange={(e) => setForm({...form,title:e.target.value})} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-transparent px-3 font-normal outline-none focus:border-[var(--primary)]"/></label><label className="block text-sm font-semibold">Description<textarea value={form.description} onChange={(e) => setForm({...form,description:e.target.value})} rows={3} className="mt-1.5 w-full rounded-lg border border-[var(--ui-border)] bg-transparent p-3 font-normal outline-none focus:border-[var(--primary)]"/></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Starts<input required type="datetime-local" value={form.starts} onChange={(e) => setForm({...form,starts:e.target.value})} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-transparent px-3 font-normal"/></label><label className="text-sm font-semibold">Ends<input required type="datetime-local" value={form.ends} onChange={(e) => setForm({...form,ends:e.target.value})} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-transparent px-3 font-normal"/></label></div><label className="block text-sm font-semibold">Location<input value={form.location} onChange={(e) => setForm({...form,location:e.target.value})} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-transparent px-3 font-normal"/></label><label className="block text-sm font-semibold">Meeting link<input type="url" value={form.meetingUrl} onChange={(e) => setForm({...form,meetingUrl:e.target.value})} placeholder="https://" className="mt-1.5 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-transparent px-3 font-normal"/></label><label className="block text-sm font-semibold">Repeats<select value={form.recurrence} onChange={(e) => setForm({...form,recurrence:e.target.value as typeof form.recurrence})} className="mt-1.5 h-10 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] px-3 font-normal"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}<button disabled={isCreating} className="h-11 w-full rounded-lg bg-[var(--primary)] font-bold text-white disabled:opacity-60">{isCreating ? 'Creating…' : 'Create event'}</button></div></form></div>}
  </main>
}

type CalendarEvent = { id: string; title: string; starts_at: string }

function MonthGrid({ month, events, onDay }: { month: Date; events: CalendarEvent[]; onDay: (day: Date) => void }) {
  const first = startOfWeek(startOfMonth(month))
  const last = endOfWeek(endOfMonth(month))
  const days: Date[] = []
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day)
  return <div className="overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] shadow-sm">
    <div className="grid grid-cols-7 border-b border-[var(--ui-border)]">{days.slice(0, 7).map((day) => <div key={day.toISOString()} className="px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{format(day, 'EEE')}</div>)}</div>
    <div className="grid grid-cols-7">{days.map((day) => {
      const dayEvents = events.filter((item) => isSameDay(new Date(item.starts_at), day))
      return <button key={day.toISOString()} type="button" onClick={() => onDay(day)} title={`New event on ${format(day, 'MMMM d')}`} className={`group flex min-h-[72px] flex-col items-stretch gap-1 border-b border-r border-[var(--ui-border)] p-1.5 text-left transition-colors hover:bg-[var(--surface-muted)] sm:min-h-[104px] [&:nth-child(7n)]:border-r-0 ${isSameMonth(day, month) ? '' : 'bg-[var(--surface-muted)]/50 text-[var(--text-muted)]'}`}>
        <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${isToday(day) ? 'bg-[var(--primary)] text-white' : ''}`}>{format(day, 'd')}</span>
        {dayEvents.slice(0, 2).map((item) => <span key={item.id} className="truncate rounded-md bg-[var(--primary-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--primary)]">{format(new Date(item.starts_at), 'p')} {item.title}</span>)}
        {dayEvents.length > 2 && <span className="px-1.5 text-[11px] text-[var(--text-muted)]">+{dayEvents.length - 2} more</span>}
      </button>
    })}</div>
  </div>
}
