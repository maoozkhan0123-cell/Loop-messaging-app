'use client'

import { useMemo, useState } from 'react'
import { addDays, addMonths, endOfDay, format, isSameDay, isSameMonth, startOfDay, startOfMonth, subMonths } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog'
import { calendarDayKey, eventOccurrences, getMondayFirstCalendarGrid, parseCalendarDate } from '@/lib/calendar'
import type { Profile, ProjectBoard, ProjectColumn, ProjectTask, WorkspaceEvent } from '@/types/database'
import type { CreateDashboardTaskInput } from '@/hooks/useDashboard'

type InteractiveCalendarProps = {
  tasks: ProjectTask[]
  /** Company-wide events and meetings the user is invited to (repeats are expanded). */
  events?: WorkspaceEvent[]
  meId?: string
  boards: ProjectBoard[]
  columns: ProjectColumn[]
  profiles: Profile[]
  onCreateTask: (input: CreateDashboardTaskInput) => Promise<unknown>
  onOpenTask: (task: ProjectTask) => void
  creating?: boolean
}

export function InteractiveCalendar({ tasks, events = [], meId, boards, columns, profiles, onCreateTask, onOpenTask, creating }: InteractiveCalendarProps) {
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(startOfMonth(today))
  const [selectedDate, setSelectedDate] = useState(today)
  const [direction, setDirection] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  const days = useMemo(() => getMondayFirstCalendarGrid(currentDate), [currentDate])
  const tasksByDate = useMemo(() => {
    const map = new Map<string, ProjectTask[]>()
    for (const task of tasks) {
      const date = parseCalendarDate(task.due_date)
      if (!date) continue
      const key = calendarDayKey(date)
      map.set(key, [...(map.get(key) ?? []), task])
    }
    return map
  }, [tasks])
  const selectedTasks = tasksByDate.get(calendarDayKey(selectedDate)) ?? []
  // Event occurrences for the visible grid, keyed by day.
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Array<{ event: WorkspaceEvent; at: Date }>>()
    if (!days.length) return map
    const from = startOfDay(days[0]); const to = endOfDay(days[days.length - 1])
    for (const event of events) for (const at of eventOccurrences(event, from, to)) {
      const key = calendarDayKey(at)
      map.set(key, [...(map.get(key) ?? []), { event, at }])
    }
    return map
  }, [events, days])
  const selectedEvents = (eventsByDate.get(calendarDayKey(selectedDate)) ?? []).sort((a, b) => a.at.getTime() - b.at.getTime())

  const navigateMonth = (offset: number) => {
    setDirection(offset)
    setCurrentDate((date) => offset > 0 ? addMonths(date, 1) : subMonths(date, 1))
  }
  const chooseDate = (date: Date) => {
    setSelectedDate(date)
    if (!isSameMonth(date, currentDate)) setCurrentDate(startOfMonth(date))
  }
  const goToday = () => { const now = new Date(); setDirection(0); setCurrentDate(startOfMonth(now)); setSelectedDate(now) }

  return (
    <section aria-label="Task calendar">
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 text-base font-semibold text-[var(--foreground)]">{format(currentDate, 'MMMM yyyy')}</h2>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={() => navigateMonth(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-md border border-[var(--ui-border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"><ChevronLeft size={15} /></button>
          <button type="button" onClick={() => navigateMonth(1)} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-md border border-[var(--ui-border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"><ChevronRight size={15} /></button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted-foreground)]">Your deadlines and events</p>
        <button type="button" onClick={goToday} className="h-7 rounded-md border border-[var(--ui-border)] px-2.5 text-xs font-semibold text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]">Today</button>
      </div>

      <div className="mt-5 grid grid-cols-7 px-1 text-center" aria-hidden="true">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span key={day} className="text-[10px] font-semibold tracking-wider text-[var(--muted-foreground)]">{day}</span>)}
      </div>
      <div className="relative mt-2 min-h-[13.5rem] overflow-hidden p-1">
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div key={format(currentDate, 'yyyy-MM')} custom={direction} initial={{ opacity: 0, x: direction * 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -12 }} transition={{ duration: .15 }} className="grid grid-cols-7 gap-y-1">
            {days.map((day) => {
              const key = calendarDayKey(day)
              const count = tasksByDate.get(key)?.length ?? 0
              const eventCount = eventsByDate.get(key)?.length ?? 0
              const selected = isSameDay(day, selectedDate)
              const isToday = isSameDay(day, today)
              return <button key={key} type="button" aria-pressed={selected} aria-label={`${format(day, 'EEEE, MMMM d, yyyy')}${count ? `, ${count} task${count === 1 ? '' : 's'} due` : ''}${eventCount ? `, ${eventCount} event${eventCount === 1 ? '' : 's'}` : ''}`} onClick={() => chooseDate(day)} onKeyDown={(event) => {
                const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 7 : event.key === 'ArrowUp' ? -7 : 0
                if (!delta) return
                event.preventDefault(); chooseDate(addDays(day, delta))
              }} className={`relative mx-auto grid aspect-square w-full min-w-0 max-w-9 place-items-center rounded-lg text-xs font-medium transition ${selected ? 'bg-[var(--primary)] text-white shadow-sm' : isSameMonth(day,currentDate) ? 'text-[var(--foreground)] hover:bg-[var(--primary-soft)]' : 'text-[var(--muted-foreground)] opacity-45 hover:opacity-80'} ${isToday && !selected ? 'ring-1 ring-[var(--primary)]' : ''}`}>
                <span>{format(day, 'd')}</span>{(count > 0 || eventCount > 0) && <span className="absolute bottom-1 flex gap-0.5">{count > 0 && <span className={`h-1 w-1 rounded-full ${selected ? 'bg-white' : 'bg-[var(--primary)]'}`} />}{eventCount > 0 && <span className={`h-1 w-1 rounded-full ${selected ? 'bg-white/70' : 'bg-amber-500'}`} />}</span>}<span className="sr-only">{selected ? 'Selected' : ''}{isToday ? ' Today' : ''}</span>
              </button>
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <div aria-live="polite" className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--surface-muted)] p-3">
        <div className="flex items-start gap-2"><CalendarDays size={15} className="mt-0.5 shrink-0 text-[var(--primary)]" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[var(--foreground)]">{selectedTasks.length ? `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} due ${format(selectedDate, 'MMM d')}` : selectedEvents.length ? format(selectedDate, 'EEEE, MMM d') : 'Nothing on this date'}</p>
          {selectedEvents.length > 0 && <div className="mt-2 space-y-1">{selectedEvents.slice(0,4).map(({ event, at }) => <a key={`${event.id}-${at.toISOString()}`} href="/calendar" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-[var(--surface)]"><span className={`h-2 w-2 shrink-0 rounded-sm ${event.visibility === 'company' ? 'bg-amber-500' : 'bg-[var(--primary)]'}`} /><span className="shrink-0 text-[var(--muted-foreground)]">{format(at, 'p')}</span><span className="truncate">{event.title}</span></a>)}</div>}
          {selectedTasks.length > 0 && <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">{selectedTasks.slice(0,4).map((task) => <button key={task.id} type="button" onClick={() => onOpenTask(task)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--surface)]"><span className={`h-2 w-2 rounded-full ${task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-orange-500' : task.priority === 'medium' ? 'bg-blue-500' : 'bg-slate-400'}`} /><span className="truncate">{task.title}</span></button>)}</div>}
        </div></div>
        <button type="button" onClick={() => setCreateOpen(true)} disabled={!boards.length || !columns.length} className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--primary)] text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Plus size={13} />Add task for this day</button>
      </div>

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} selectedDate={selectedDate} boards={boards} columns={columns} profiles={profiles} meId={meId} creating={creating} onCreate={onCreateTask} availableLabels={Array.from(new Set(tasks.flatMap(task => task.labels ?? [])))} />
    </section>
  )
}
