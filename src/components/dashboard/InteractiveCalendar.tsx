'use client'

import { useMemo, useState } from 'react'
import { addDays, addMonths, format, isSameDay, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { AnimatePresence, motion } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { calendarDayKey, getMondayFirstCalendarGrid, parseCalendarDate } from '@/lib/calendar'
import type { Profile, ProjectBoard, ProjectColumn, ProjectTask, TaskPriority } from '@/types/database'
import type { CreateDashboardTaskInput } from '@/hooks/useDashboard'

type InteractiveCalendarProps = {
  tasks: ProjectTask[]
  boards: ProjectBoard[]
  columns: ProjectColumn[]
  profiles: Profile[]
  onCreateTask: (input: CreateDashboardTaskInput) => Promise<unknown>
  onOpenTask: (task: ProjectTask) => void
  creating?: boolean
}

export function InteractiveCalendar({ tasks, boards, columns, profiles, onCreateTask, onOpenTask, creating }: InteractiveCalendarProps) {
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
      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold text-[var(--foreground)]">{format(currentDate, 'MMMM yyyy')}</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Task due dates</p></div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={goToday} className="mr-1 h-8 rounded-md border border-[var(--ui-border)] px-2.5 text-xs font-semibold text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]">Today</button>
          <button type="button" onClick={() => navigateMonth(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-md border border-[var(--ui-border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"><ChevronLeft size={15} /></button>
          <button type="button" onClick={() => navigateMonth(1)} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-md border border-[var(--ui-border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-7 text-center" aria-hidden="true">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span key={day} className="text-[10px] font-semibold tracking-wider text-[var(--muted-foreground)]">{day}</span>)}
      </div>
      <div className="relative mt-2 min-h-[216px] overflow-hidden">
        <AnimatePresence initial={false} mode="wait" custom={direction}>
          <motion.div key={format(currentDate, 'yyyy-MM')} custom={direction} initial={{ opacity: 0, x: direction * 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: direction * -12 }} transition={{ duration: .15 }} className="grid grid-cols-7 gap-y-1">
            {days.map((day) => {
              const key = calendarDayKey(day)
              const count = tasksByDate.get(key)?.length ?? 0
              const selected = isSameDay(day, selectedDate)
              const isToday = isSameDay(day, today)
              return <button key={key} type="button" aria-pressed={selected} aria-label={`${format(day, 'EEEE, MMMM d, yyyy')}${count ? `, ${count} task${count === 1 ? '' : 's'} due` : ''}`} onClick={() => chooseDate(day)} onKeyDown={(event) => {
                const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? 7 : event.key === 'ArrowUp' ? -7 : 0
                if (!delta) return
                event.preventDefault(); chooseDate(addDays(day, delta))
              }} className={`relative mx-auto grid h-9 w-9 place-items-center rounded-lg text-xs font-medium transition ${selected ? 'bg-[var(--primary)] text-white shadow-sm' : isSameMonth(day,currentDate) ? 'text-[var(--foreground)] hover:bg-[var(--primary-soft)]' : 'text-[var(--muted-foreground)] opacity-45 hover:opacity-80'} ${isToday && !selected ? 'ring-1 ring-[var(--primary)]' : ''}`}>
                <span>{format(day, 'd')}</span>{count > 0 && <span className={`absolute bottom-1 h-1 w-1 rounded-full ${selected ? 'bg-white' : 'bg-[var(--primary)]'}`} />}<span className="sr-only">{selected ? 'Selected' : ''}{isToday ? ' Today' : ''}</span>
              </button>
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      <div aria-live="polite" className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--surface-muted)] p-3">
        <div className="flex items-start gap-2"><CalendarDays size={15} className="mt-0.5 shrink-0 text-[var(--primary)]" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-[var(--foreground)]">{selectedTasks.length ? `${selectedTasks.length} task${selectedTasks.length === 1 ? '' : 's'} due ${format(selectedDate, 'MMM d')}` : 'No tasks due on this date'}</p>
          {selectedTasks.length > 0 && <div className="mt-2 max-h-28 space-y-1 overflow-y-auto">{selectedTasks.slice(0,4).map((task) => <button key={task.id} type="button" onClick={() => onOpenTask(task)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--surface)]"><span className={`h-2 w-2 rounded-full ${task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-orange-500' : task.priority === 'medium' ? 'bg-blue-500' : 'bg-slate-400'}`} /><span className="truncate">{task.title}</span></button>)}</div>}
        </div></div>
        <button type="button" onClick={() => setCreateOpen(true)} disabled={!boards.length || !columns.length} className="mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--primary)] text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Plus size={13} />Add task for this day</button>
      </div>

      <TaskDialog open={createOpen} onOpenChange={setCreateOpen} selectedDate={selectedDate} boards={boards} columns={columns} profiles={profiles} creating={creating} onCreate={onCreateTask} />
    </section>
  )
}

function TaskDialog({ open, onOpenChange, selectedDate, boards, columns, profiles, creating, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; selectedDate: Date; boards: ProjectBoard[]; columns: ProjectColumn[]; profiles: Profile[]; creating?: boolean; onCreate: (input: CreateDashboardTaskInput) => Promise<unknown> }) {
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '')
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [priority, setPriority] = useState<TaskPriority>('medium'); const [assigneeId, setAssigneeId] = useState(''); const [error, setError] = useState<string | null>(null)
  const boardColumns = columns.filter((column) => column.board_id === boardId).sort((a,b) => a.position-b.position)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(null)
    const columnId = boardColumns[0]?.id
    if (!title.trim() || !boardId || !columnId) { setError('Select a project and enter a task title.'); return }
    try { await onCreate({ boardId, columnId, title, description, priority, assigneeId: assigneeId || undefined, dueDate: calendarDayKey(selectedDate) }); setTitle(''); setDescription(''); onOpenChange(false) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Task could not be created.') }
  }
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[120] bg-black/50" /><Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-[121] w-[min(480px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] p-5 shadow-2xl"><div className="flex items-start justify-between"><div><Dialog.Title className="text-lg font-semibold">New task</Dialog.Title><p className="mt-1 text-xs text-[var(--muted-foreground)]">Due {format(selectedDate, 'EEEE, MMMM d, yyyy')}</p></div><Dialog.Close aria-label="Close task form" className="rounded-md p-1.5 hover:bg-[var(--surface-muted)]"><X size={17} /></Dialog.Close></div><form onSubmit={(event) => void submit(event)} className="mt-5 space-y-3">{error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}<Field label="Title"><input required value={title} onChange={(e) => setTitle(e.target.value)} className="member-input" autoFocus /></Field><Field label="Description"><textarea value={description} onChange={(e) => setDescription(e.target.value)} className="member-input min-h-20 py-2" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Project"><select value={boardId} onChange={(e) => setBoardId(e.target.value)} className="member-input">{boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select></Field><Field label="Priority"><select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className="member-input"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field></div><Field label="Assignee"><select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="member-input"><option value="">Unassigned</option>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.display_name}</option>)}</select></Field><div className="flex justify-end gap-2 pt-2"><Dialog.Close className="h-9 rounded-md border border-[var(--ui-border)] px-4 text-xs font-semibold">Cancel</Dialog.Close><button disabled={creating} className="h-9 rounded-md bg-[var(--primary)] px-4 text-xs font-semibold text-white disabled:opacity-60">{creating ? 'Creating…' : 'Create task'}</button></div></form></Dialog.Content></Dialog.Portal></Dialog.Root>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-semibold text-[var(--foreground)]">{label}<div className="mt-1.5">{children}</div></label> }
