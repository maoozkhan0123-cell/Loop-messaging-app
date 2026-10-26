'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isPast, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths,
} from 'date-fns'
import {
  ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight,
  Clock3, FolderKanban, ListChecks, MessageCircle, Search, Users,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useDashboard } from '@/hooks/useDashboard'
import { useProfile } from '@/hooks/useProfile'
import type { Profile, ProjectTask, TaskPriority } from '@/types/database'

const projectTones = [
  { background: '#EEECFF', accent: '#5547C7', icon: '#DDD8FF' },
  { background: '#FFEAF4', accent: '#E83E8C', icon: '#FFD2E6' },
  { background: '#E4F8FC', accent: '#219EBB', icon: '#C6F0F6' },
  { background: '#FFF2D5', accent: '#D99218', icon: '#FFE4AD' },
]

export default function DashboardPage() {
  const router = useRouter()
  const { data: me } = useProfile()
  const { data, isLoading, error, completeTask, isCompletingTask } = useDashboard()
  const [query, setQuery] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(startOfMonth(new Date()))
  const [taskError, setTaskError] = useState<string | null>(null)

  const view = useMemo(() => {
    if (!data) return null
    const doneColumns = new Set(data.columns.filter((column) => /done|complete/i.test(column.name)).map((column) => column.id))
    const profileMap = new Map(data.profiles.map((profile) => [profile.id, profile]))
    const tasks = data.tasks.filter((task) => {
      const needle = query.trim().toLowerCase()
      return !needle || task.title.toLowerCase().includes(needle) || task.description?.toLowerCase().includes(needle)
    })
    const boards = data.boards.map((board) => {
      const boardTasks = data.tasks.filter((task) => task.board_id === board.id)
      const finished = boardTasks.filter((task) => doneColumns.has(task.column_id)).length
      return { ...board, tasks: boardTasks, finished, progress: boardTasks.length ? Math.round((finished / boardTasks.length) * 100) : 0 }
    })
    return { doneColumns, profileMap, tasks, boards }
  }, [data, query])

  if (isLoading) return <Loading />
  if (error || !data || !view) return <div className="flex flex-1 items-center justify-center bg-[#F3F2FA] text-sm text-[#77758B]">Unable to load your workspace.</div>

  const firstName = me?.display_name?.split(' ')[0] || 'team'
  const online = data.profiles.filter((profile) => profile.status === 'online').length
  const actionableTasks = view.tasks
    .filter((task) => !view.doneColumns.has(task.column_id))
    .sort((a, b) => {
      if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
      if (a.due_date) return -1
      if (b.due_date) return 1
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    .slice(0, 5)

  const handleCompleteTask = async (task: ProjectTask) => {
    setTaskError(null)
    try {
      await completeTask({ taskId: task.id, boardId: task.board_id })
    } catch (completeError) {
      setTaskError(completeError instanceof Error ? completeError.message : 'Task could not be completed.')
    }
  }

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-[#F3F2FA] text-[#17152F]">
      <section className="relative min-h-full overflow-hidden bg-[radial-gradient(circle_at_86%_5%,rgba(229,62,140,.34),transparent_23%),radial-gradient(circle_at_5%_80%,rgba(40,158,216,.26),transparent_24%),linear-gradient(135deg,#28399A_0%,#4B2DB1_52%,#352090_100%)] p-3 sm:p-5 lg:p-7">
        <div className="pointer-events-none absolute -left-28 top-24 h-72 w-72 rounded-full border border-white/15" />
        <div className="pointer-events-none absolute -bottom-40 right-10 h-80 w-80 rounded-full border border-white/15" />

        <header className="relative mx-auto mb-5 flex max-w-[1450px] flex-col gap-4 px-1 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-white/60">BySync workspace</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-.03em] sm:text-3xl">Hi, {firstName}</h1>
            <p className="mt-1 text-sm text-white/65">Keep up the good work — here is your team at a glance.</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/55" size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your projects and tasks" className="h-11 w-72 rounded-2xl border border-white/10 bg-white/15 pl-10 pr-4 text-sm text-white outline-none backdrop-blur placeholder:text-white/50 focus:border-white/40 focus:bg-white/20" />
            </label>
            <button onClick={() => router.push('/profile')} className="flex items-center gap-2 rounded-2xl bg-white/12 p-1.5 pr-3 text-left transition hover:bg-white/20">
              <Avatar name={me?.display_name || 'Member'} src={me?.avatar_url} size={36} />
              <span className="hidden sm:block"><span className="block text-xs font-semibold">{me?.display_name || 'Team member'}</span><span className="block text-[10px] text-white/60">{me?.job_title || 'View profile'}</span></span>
            </button>
          </div>
        </header>

        <div className="relative mx-auto max-w-[1450px] overflow-hidden rounded-[28px] bg-white shadow-[0_28px_80px_rgba(15,12,55,.28)]">
          <div className="grid min-h-[720px] xl:grid-cols-[minmax(0,1.65fr)_390px]">
            <div className="min-w-0 p-5 sm:p-7 lg:p-9">
              <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-xl font-semibold tracking-[-.025em]">Recent tasks</h2>
                  <p className="mt-1 text-xs text-[#8A879D]">Stay focused on the work that needs attention next.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative md:hidden"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9995AB]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" className="h-10 w-full rounded-xl bg-[#F5F4FA] pl-9 pr-3 text-xs outline-none" /></label>
                  <button onClick={() => router.push('/projects')} className="whitespace-nowrap text-xs font-semibold text-[#E83E8C] hover:text-[#B72A69]">All tasks</button>
                </div>
              </div>

              <div className="space-y-2.5">
                {taskError && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{taskError}</div>}
                {actionableTasks.map((task) => <RecentTask key={task.id} task={task} profile={task.assignee_id ? view.profileMap.get(task.assignee_id) : undefined} onOpen={() => router.push(`/projects?board=${task.board_id}&task=${task.id}`)} onComplete={() => void handleCompleteTask(task)} disabled={isCompletingTask} />)}
                {!actionableTasks.length && <div className="flex w-full flex-col items-center justify-center rounded-2xl border border-dashed border-[#D9D5E7] py-7 text-center"><span className="grid h-10 w-10 place-items-center rounded-full bg-[#E8F7F1] text-[#249676]"><Check size={20} /></span><p className="mt-2 text-sm font-semibold text-[#37324D]">You are all caught up</p><button onClick={() => router.push('/projects')} className="mt-1 text-xs font-semibold text-[#E83E8C]">Open projects</button></div>}
              </div>

              <div className="mb-4 mt-9 flex items-center justify-between">
                <div><h2 className="text-xl font-semibold tracking-[-.025em]">Ongoing projects</h2><p className="mt-1 text-xs text-[#8A879D]">Live progress across active workspaces</p></div>
                <button onClick={() => router.push('/projects')} className="flex items-center gap-1 text-xs font-semibold text-[#E83E8C] hover:text-[#B72A69]">All projects <ArrowRight size={13} /></button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {view.boards.slice(0, 4).map((board, index) => <ProjectCard key={board.id} name={board.name} description={board.description} total={board.tasks.length} finished={board.finished} progress={board.progress} tone={projectTones[index % projectTones.length]} profiles={board.tasks.map((task) => task.assignee_id ? view.profileMap.get(task.assignee_id) : undefined).filter(Boolean) as Profile[]} onClick={() => router.push('/projects')} />)}
                {!view.boards.length && <button onClick={() => router.push('/projects')} className="col-span-full flex min-h-32 items-center justify-center gap-2 rounded-2xl border border-dashed border-[#D9D5E7] text-sm font-semibold text-[#514C70]"><FolderKanban size={18} /> Create a project</button>}
              </div>
            </div>

            <aside className="border-t border-[#ECEAF3] bg-[#FCFBFE] p-5 sm:p-7 xl:border-l xl:border-t-0">
              <Calendar month={calendarMonth} tasks={data.tasks} onPrevious={() => setCalendarMonth((month) => subMonths(month, 1))} onNext={() => setCalendarMonth((month) => addMonths(month, 1))} />

              <div className="mt-9">
                <div className="mb-4 flex items-end justify-between"><div><h2 className="text-lg font-semibold tracking-[-.02em]">Team members</h2><p className="mt-1 text-xs text-[#8A879D]">{online} online · {data.profiles.length} members</p></div><button onClick={() => router.push('/people')} className="text-xs font-semibold text-[#E83E8C]">View all</button></div>
                <div className="space-y-1">
                  {data.profiles.slice(0, 6).map((profile) => <button key={profile.id} onClick={() => router.push('/people')} className="group flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition hover:bg-white hover:shadow-[0_8px_22px_rgba(53,32,144,.07)]"><Avatar name={profile.display_name} src={profile.avatar_url} status={profile.status} size={39} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#25213E]">{profile.display_name}</span><span className="block truncate text-[11px] text-[#9793A8]">{profile.job_title || 'Team member'}</span></span><span className="grid h-8 w-8 place-items-center rounded-full border border-[#E4E1EC] text-[#625D7A] group-hover:border-[#5141BF] group-hover:text-[#5141BF]"><MessageCircle size={14} /></span></button>)}
                </div>
              </div>

              <div className="mt-7 grid grid-cols-3 gap-2">
                <QuickStat icon={FolderKanban} value={data.boards.length} label="Projects" />
                <QuickStat icon={ListChecks} value={data.tasks.length} label="Tasks" />
                <QuickStat icon={Users} value={online} label="Online" />
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  )
}

function RecentTask({ task, profile, onOpen, onComplete, disabled }: { task: ProjectTask; profile?: Profile; onOpen: () => void; onComplete: () => void; disabled: boolean }) {
  const overdue = !!task.due_date && isPast(new Date(task.due_date))
  return <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen() }} className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border border-transparent bg-[#F5F4FA] px-4 py-3 text-left transition hover:border-[#DED9EE] hover:bg-white hover:shadow-[0_9px_26px_rgba(57,42,132,.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5948C5]"><button type="button" disabled={disabled} aria-label={`Mark ${task.title} complete`} title="Mark task complete" onClick={(event) => { event.stopPropagation(); onComplete() }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[#C8C4D6] bg-white text-transparent transition hover:border-[#E83E8C] hover:bg-[#E83E8C] hover:text-white disabled:cursor-wait disabled:opacity-50"><Check size={14} strokeWidth={3} /></button><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[#292541]">{task.title}</span><span className={`mt-0.5 flex items-center gap-1 text-[11px] ${overdue ? 'font-semibold text-[#DD4D5D]' : 'text-[#9692A6]'}`}><Clock3 size={11} />{task.due_date ? (overdue ? `Overdue · ${format(new Date(task.due_date), 'MMM d')}` : format(new Date(task.due_date), 'EEEE · MMM d')) : 'No due date'} · {priorityLabel(task.priority)}</span></span>{profile ? <Avatar name={profile.display_name} src={profile.avatar_url} size={27} /> : <span className="hidden text-[10px] font-medium text-[#A09CAF] sm:block">Unassigned</span>}<ChevronRight size={15} className="text-[#B4B0C1] transition group-hover:translate-x-0.5 group-hover:text-[#5948C5]" /></div>
}

function ProjectCard({ name, description, total, finished, progress, tone, profiles, onClick }: { name: string; description: string | null; total: number; finished: number; progress: number; tone: typeof projectTones[number]; profiles: Profile[]; onClick: () => void }) {
  const people = Array.from(new Map(profiles.map((profile) => [profile.id, profile])).values()).slice(0, 4)
  return <button onClick={onClick} className="group rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(53,32,144,.12)]" style={{ background: tone.background }}><div className="flex items-start justify-between gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: tone.icon, color: tone.accent }}><FolderKanban size={17} /></span><span className="text-xs font-bold" style={{ color: tone.accent }}>{progress}%</span></div><h3 className="mt-3 truncate text-sm font-semibold text-[#292541]">{name}</h3><p className="mt-1 truncate text-[11px] text-[#77728A]">{description || `${finished} of ${total} tasks complete`}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/80"><div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: tone.accent }} /></div><div className="mt-3 flex items-center justify-between"><span className="text-[10px] font-medium text-[#77728A]">{finished}/{total} completed</span><span className="flex -space-x-1.5">{people.map((profile) => <span key={profile.id} className="rounded-full ring-2 ring-white/80"><Avatar name={profile.display_name} src={profile.avatar_url} size={21} /></span>)}</span></div></button>
}

function Calendar({ month, tasks, onPrevious, onNext }: { month: Date; tasks: ProjectTask[]; onPrevious: () => void; onNext: () => void }) {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start, end })
  return <section><div className="flex items-center justify-between"><h2 className="text-lg font-semibold tracking-[-.02em]">{format(month, 'MMMM yyyy')}</h2><div className="flex gap-1"><button onClick={onPrevious} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-full border border-[#E4E1EC] bg-white text-[#625D7A] hover:border-[#5141BF] hover:text-[#5141BF]"><ChevronLeft size={15} /></button><button onClick={onNext} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-full border border-[#E4E1EC] bg-white text-[#625D7A] hover:border-[#5141BF] hover:text-[#5141BF]"><ChevronRight size={15} /></button></div></div><div className="mt-5 grid grid-cols-7 gap-y-2 text-center"><span className="contents">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day) => <span key={day} className="text-[10px] font-semibold text-[#AAA6B7]">{day}</span>)}</span>{days.map((day) => { const count = tasks.filter((task) => task.due_date && isSameDay(new Date(task.due_date), day)).length; const today = isSameDay(day, new Date()); return <button key={day.toISOString()} onClick={() => count && undefined} className={`relative mx-auto grid h-8 w-8 place-items-center rounded-full text-xs font-medium ${today ? 'bg-[#E83E8C] text-white shadow-[0_5px_13px_rgba(232,62,140,.35)]' : isSameMonth(day, month) ? 'text-[#37324D] hover:bg-[#EEEAFB]' : 'text-[#C5C1CF]'}`}>{format(day, 'd')}{count > 0 && !today && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-[#E83E8C]" />}</button> })}</div><div className="mt-4 flex items-center gap-2 rounded-xl bg-[#F4F1FC] px-3 py-2.5 text-[11px] text-[#716C82]"><CalendarDays size={14} className="text-[#5847C5]" /><b className="text-[#38334F]">{tasks.filter((task) => task.due_date && isSameMonth(new Date(task.due_date), month)).length}</b> tasks due this month</div></section>
}

function QuickStat({ icon: Icon, value, label }: { icon: typeof Users; value: number; label: string }) {
  return <div className="rounded-2xl border border-[#ECE9F3] bg-white p-3 text-center"><Icon size={15} className="mx-auto text-[#5948C5]" /><strong className="mt-1.5 block text-base text-[#292541]">{value}</strong><span className="block text-[10px] text-[#9A96A9]">{label}</span></div>
}

function priorityLabel(priority: TaskPriority) {
  return { urgent: 'Urgent', high: 'High priority', medium: 'Medium priority', low: 'Low priority' }[priority]
}

function Loading() {
  return <main className="flex-1 bg-[#34249A] p-5"><div className="mx-auto max-w-[1450px] animate-pulse"><div className="mb-5 h-20 rounded-2xl bg-white/10" /><div className="h-[720px] rounded-[28px] bg-white/95" /></div></main>
}
