'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ArrowRight, Check, ChevronRight, Clock3, FolderKanban, Plus, Search } from 'lucide-react'
import { CreateTaskDialog } from '@/components/tasks/CreateTaskDialog'
import { TaskAssignees } from '@/components/tasks/TaskAssignees'
import { TaskCardSummary } from '@/components/tasks/TaskCardSummary'
import { RightSidebar } from '@/components/dashboard/RightSidebar'
import { DailyBrief } from '@/components/dashboard/DailyBrief'
import { useDashboard } from '@/hooks/useDashboard'
import { useCreateDM } from '@/hooks/useChannels'
import { useProfile } from '@/hooks/useProfile'
import { useWorkspaceEvents } from '@/hooks/useProductivity'
import { isOverdue, parseCalendarDate } from '@/lib/calendar'
import type { Profile, ProjectTask, TaskPriority } from '@/types/database'
import { GanttChart, ViewSwitcher, type WorkView } from '@/components/ui/WorkViews'

export default function DashboardPage() {
  const router = useRouter()
  const { data: me } = useProfile()
  const { data, isLoading, error, completeTask, isCompletingTask, createTask, isCreatingTask } = useDashboard()
  const createDM = useCreateDM()
  const { data: events = [] } = useWorkspaceEvents(me?.id)
  const [query, setQuery] = useState('')
  const [taskError, setTaskError] = useState<string | null>(null)
  const [workspaceView, setWorkspaceView] = useState<WorkView>('list')
  const [createOpen, setCreateOpen] = useState(false)

  const view = useMemo(() => {
    if (!data) return null
    const doneColumns = new Set(data.columns.filter((column) => /done|complete/i.test(column.name)).map((column) => column.id))
    const profileMap = new Map(data.profiles.map((profile) => [profile.id, profile]))
    const needle = query.trim().toLowerCase()
    const tasks = data.tasks.filter((task) => !needle || task.title.toLowerCase().includes(needle) || task.description?.toLowerCase().includes(needle))
    const boards = data.boards.map((board) => {
      const boardTasks = data.tasks.filter((task) => task.board_id === board.id)
      const finished = boardTasks.filter((task) => doneColumns.has(task.column_id)).length
      return { ...board, tasks: boardTasks, finished, progress: boardTasks.length ? Math.round((finished / boardTasks.length) * 100) : 0 }
    })
    return { doneColumns, profileMap, tasks, boards }
  }, [data, query])

  if (isLoading) return <Loading />
  if (error || !data || !view) return <div className="flex flex-1 items-center justify-center bg-[var(--app-bg)] text-sm text-[var(--muted-foreground)]">Unable to load your workspace.</div>

  // My open tasks, soonest due first; tasks without a due date come last, newest first.
  const myOpenTasks = view.tasks.filter((task) => data.myTaskIds.has(task.id) && !view.doneColumns.has(task.column_id))
  const actionableTasks = [...myOpenTasks].sort((a,b) => a.due_date && b.due_date ? a.due_date.localeCompare(b.due_date) : a.due_date ? -1 : b.due_date ? 1 : b.created_at.localeCompare(a.created_at)).slice(0,5)
  const handleCompleteTask = async (task: ProjectTask) => { setTaskError(null); try { await completeTask({ taskId: task.id, boardId: task.board_id }) } catch (cause) { setTaskError(cause instanceof Error ? cause.message : 'Task could not be completed.') } }
  const firstName = me?.display_name?.trim().split(/\s+/)[0] || 'there'
  const messageMember = async (profile: Profile) => { const channelId = await createDM.mutateAsync(profile.id); router.push(`/dm/${channelId}`) }

  return <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--app-bg)] text-[var(--foreground)]">
    <div className="mx-auto grid w-full max-w-[1600px] items-start gap-6 p-4 sm:p-6 lg:p-7 xl:grid-cols-[minmax(0,1fr)_330px]">
      <section className="min-w-0">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1 basis-40"><h1 className="truncate text-2xl font-semibold tracking-[-.03em]">Hi, {firstName}</h1><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Keep up the good work!</p></div>
          <div className="flex min-w-0 flex-1 basis-80 items-center gap-2 lg:max-w-lg"><label className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" /><input aria-label="Search your projects and tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks and projects" className="h-11 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] pl-10 pr-4 text-sm shadow-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]" /></label><button type="button" onClick={() => setCreateOpen(true)} disabled={!data.boards.length || !data.columns.length} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[var(--primary)] px-3 text-xs font-semibold text-white transition hover:bg-[var(--primary-hover)] disabled:opacity-50"><Plus size={15} />New task</button></div>
        </header>
        {me?.id && <DailyBrief userId={me.id} className="mb-5" />}
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-base font-semibold">My tasks</h2><p className="text-[11px] text-[var(--muted-foreground)]">{myOpenTasks.length ? `${myOpenTasks.length} open · soonest due first` : 'Assigned to you'}</p></div><button onClick={() => router.push('/inbox')} className="text-xs font-semibold text-[var(--primary)]">All my tasks</button></div><div className="space-y-2">{taskError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{taskError}</div>}{actionableTasks.map((task) => <RecentTask key={task.id} task={task} profiles={data.profiles} onOpen={() => router.push(`/projects?board=${task.board_id}&task=${task.id}`)} onComplete={() => void handleCompleteTask(task)} disabled={isCompletingTask} />)}{!actionableTasks.length && <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-muted)] px-4 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">You are all caught up</span><span className="text-xs text-[var(--muted-foreground)]">No open tasks are assigned to you.</span></span><button onClick={() => router.push('/projects')} className="text-xs font-semibold text-[var(--primary)]">Open projects</button></div>}</div></section>
        <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Ongoing projects</h2><p className="text-[11px] text-[var(--muted-foreground)]">Live progress across active workspaces</p></div><div className="flex items-center gap-2"><ViewSwitcher value={workspaceView} onChange={setWorkspaceView}/><button onClick={() => router.push('/projects')} className="flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">All projects <ArrowRight size={13} /></button></div></div>
        {workspaceView === 'gantt' ? <GanttChart items={view.tasks.map((task) => ({ id: task.id, title: task.title, subtitle: view.boards.find((board) => board.id === task.board_id)?.name, start: task.start_date || task.created_at, end: task.due_date || task.start_date || task.created_at, color: task.priority === 'urgent' ? '#DC2626' : task.priority === 'high' ? '#EA580C' : 'var(--primary)', onClick: () => router.push(`/projects?board=${task.board_id}&task=${task.id}`) }))} emptyText="No workspace tasks to show on the timeline."/> : <div className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--surface)]">{view.boards.slice(0,8).map((board) => <button key={board.id} onClick={() => router.push(`/projects?board=${board.id}`)} className="grid w-full grid-cols-[minmax(0,1fr)_90px_100px] items-center gap-3 border-b border-[var(--ui-border)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--surface-muted)]"><span className="min-w-0"><strong className="block truncate text-sm">{board.name}</strong><span className="block truncate text-[11px] text-[var(--muted-foreground)]">{board.description || `${board.tasks.length} tasks`}</span></span><span className="text-xs text-[var(--muted-foreground)]">{board.finished}/{board.tasks.length} done</span><span className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]"><span className="block h-full rounded-full bg-[var(--primary)]" style={{width:`${board.progress}%`}}/></span><strong className="w-8 text-right text-[10px]">{board.progress}%</strong></span></button>)}{!view.boards.length && <button onClick={() => router.push('/projects')} className="flex min-h-28 w-full items-center justify-center gap-2 text-sm font-semibold"><FolderKanban size={18}/>Create a project</button>}</div>}
      </section>
      <RightSidebar tasks={myOpenTasks} events={events} meId={me?.id} boards={data.boards} columns={data.columns} profiles={data.profiles} onCreateTask={createTask} onOpenTask={(task) => router.push(`/projects?board=${task.board_id}&task=${task.id}`)} onMessageMember={messageMember} onViewTeam={() => router.push('/people')} creatingTask={isCreatingTask} />
    </div>
    <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} boards={data.boards} columns={data.columns} profiles={data.profiles} meId={me?.id} creating={isCreatingTask} onCreate={createTask} availableLabels={Array.from(new Set(data.tasks.flatMap(task => task.labels ?? [])))} />
  </main>
}

function RecentTask({ task, profiles, onOpen, onComplete, disabled }: { task: ProjectTask; profiles: Profile[]; onOpen: () => void; onComplete: () => void; disabled: boolean }) {
  const overdue = isOverdue(task.due_date)
  const due = parseCalendarDate(task.due_date)
  return <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen() }} className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] px-4 py-3 text-left shadow-sm transition hover:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><button type="button" disabled={disabled} aria-label={`Mark ${task.title} complete`} onClick={(event) => { event.stopPropagation(); onComplete() }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--ui-border)] text-transparent hover:border-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"><Check size={14} /></button><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{task.title}</span><TaskCardSummary task={task} className="mt-1" /><span className={`mt-0.5 flex items-center gap-1 text-[11px] ${overdue ? 'font-semibold text-red-600' : 'text-[var(--muted-foreground)]'}`}><Clock3 size={11} />{due ? `${overdue ? 'Overdue · ' : ''}${format(due, 'MMM d')}` : 'No due date'} · {priorityLabel(task.priority)}</span></span><TaskAssignees task={task} profiles={profiles} size={27} max={3} /><ChevronRight size={15} className="text-[var(--muted-foreground)]" /></div>
}

function priorityLabel(priority: TaskPriority) { return { urgent:'Urgent', high:'High priority', medium:'Medium priority', low:'Low priority' }[priority] }
function Loading() { return <main className="flex-1 bg-[var(--app-bg)] p-6"><div className="mx-auto max-w-[1450px] animate-pulse"><div className="mb-5 h-20 rounded-xl bg-[var(--surface-muted)]" /><div className="h-[720px] rounded-xl bg-[var(--surface)]" /></div></main> }
