'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, isPast } from 'date-fns'
import { ArrowRight, Check, ChevronRight, Clock3, FolderKanban, Search } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { RightSidebar } from '@/components/dashboard/RightSidebar'
import { useDashboard } from '@/hooks/useDashboard'
import { useCreateDM } from '@/hooks/useChannels'
import { useProfile } from '@/hooks/useProfile'
import type { Profile, ProjectTask, TaskPriority } from '@/types/database'
import { GanttChart, ViewSwitcher, type WorkView } from '@/components/ui/WorkViews'

export default function DashboardPage() {
  const router = useRouter()
  const { data: me } = useProfile()
  const { data, isLoading, error, completeTask, isCompletingTask, createTask, isCreatingTask } = useDashboard()
  const createDM = useCreateDM()
  const [query, setQuery] = useState('')
  const [taskError, setTaskError] = useState<string | null>(null)
  const [workspaceView, setWorkspaceView] = useState<WorkView>('list')

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

  const actionableTasks = view.tasks.filter((task) => !view.doneColumns.has(task.column_id)).sort((a,b) => a.due_date && b.due_date ? a.due_date.localeCompare(b.due_date) : a.due_date ? -1 : b.due_date ? 1 : b.created_at.localeCompare(a.created_at)).slice(0,5)
  const handleCompleteTask = async (task: ProjectTask) => { setTaskError(null); try { await completeTask({ taskId: task.id, boardId: task.board_id }) } catch (cause) { setTaskError(cause instanceof Error ? cause.message : 'Task could not be completed.') } }
  const messageMember = async (profile: Profile) => { const channelId = await createDM.mutateAsync(profile.id); router.push(`/dm/${channelId}`) }

  return <main className="min-w-0 flex-1 overflow-y-auto bg-[var(--app-bg)] text-[var(--foreground)]">
    <div className="mx-auto grid w-full max-w-[1600px] items-start xl:grid-cols-[minmax(0,1fr)_330px]">
      <section className="min-w-0 p-4 sm:p-6 lg:p-7">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-xl font-semibold tracking-[-.025em]">Workspace overview</h1><p className="mt-1 text-xs text-[var(--muted-foreground)]">Tasks and projects that need your attention.</p></div><label className="relative w-full sm:w-64"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks and projects" className="h-9 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] pl-9 pr-3 text-xs outline-none focus:border-[var(--primary)]" /></label></div>
        <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-base font-semibold">Recent tasks</h2><p className="text-[11px] text-[var(--muted-foreground)]">Next items in your queue</p></div><button onClick={() => router.push('/projects')} className="text-xs font-semibold text-[var(--primary)]">All tasks</button></div><div className="space-y-2">{taskError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{taskError}</div>}{actionableTasks.map((task) => <RecentTask key={task.id} task={task} profile={task.assignee_id ? view.profileMap.get(task.assignee_id) : undefined} onOpen={() => router.push(`/projects?board=${task.board_id}&task=${task.id}`)} onComplete={() => void handleCompleteTask(task)} disabled={isCompletingTask} />)}{!actionableTasks.length && <div className="flex items-center gap-3 rounded-xl bg-[var(--surface-muted)] px-4 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check size={18} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">You are all caught up</span><span className="text-xs text-[var(--muted-foreground)]">No open tasks need attention.</span></span><button onClick={() => router.push('/projects')} className="text-xs font-semibold text-[var(--primary)]">Open projects</button></div>}</div></section>
        <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Ongoing projects</h2><p className="text-[11px] text-[var(--muted-foreground)]">Live progress across active workspaces</p></div><div className="flex items-center gap-2"><ViewSwitcher value={workspaceView} onChange={setWorkspaceView}/><button onClick={() => router.push('/projects')} className="flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">All projects <ArrowRight size={13} /></button></div></div>
        {workspaceView === 'gantt' ? <GanttChart items={view.tasks.map((task) => ({ id: task.id, title: task.title, subtitle: view.boards.find((board) => board.id === task.board_id)?.name, start: task.start_date || task.created_at, end: task.due_date || task.start_date || task.created_at, color: task.priority === 'urgent' ? '#DC2626' : task.priority === 'high' ? '#EA580C' : 'var(--primary)', onClick: () => router.push(`/projects?board=${task.board_id}&task=${task.id}`) }))} emptyText="No workspace tasks to show on the timeline."/> : <div className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--surface)]">{view.boards.slice(0,8).map((board) => <button key={board.id} onClick={() => router.push(`/projects?board=${board.id}`)} className="grid w-full grid-cols-[minmax(0,1fr)_90px_100px] items-center gap-3 border-b border-[var(--ui-border)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--surface-muted)]"><span className="min-w-0"><strong className="block truncate text-sm">{board.name}</strong><span className="block truncate text-[11px] text-[var(--muted-foreground)]">{board.description || `${board.tasks.length} tasks`}</span></span><span className="text-xs text-[var(--muted-foreground)]">{board.finished}/{board.tasks.length} done</span><span className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]"><span className="block h-full rounded-full bg-[var(--primary)]" style={{width:`${board.progress}%`}}/></span><strong className="w-8 text-right text-[10px]">{board.progress}%</strong></span></button>)}{!view.boards.length && <button onClick={() => router.push('/projects')} className="flex min-h-28 w-full items-center justify-center gap-2 text-sm font-semibold"><FolderKanban size={18}/>Create a project</button>}</div>}
      </section>
      <RightSidebar tasks={data.tasks} boards={data.boards} columns={data.columns} profiles={data.profiles.filter((profile) => profile.id !== me?.id)} onCreateTask={createTask} onOpenTask={(task) => router.push(`/projects?board=${task.board_id}&task=${task.id}`)} onMessageMember={messageMember} onViewTeam={() => router.push('/people')} creatingTask={isCreatingTask} />
    </div>
  </main>
}

function RecentTask({ task, profile, onOpen, onComplete, disabled }: { task: ProjectTask; profile?: Profile; onOpen: () => void; onComplete: () => void; disabled: boolean }) {
  const overdue = !!task.due_date && isPast(new Date(task.due_date))
  return <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen() }} className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] px-4 py-3 text-left shadow-sm transition hover:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><button type="button" disabled={disabled} aria-label={`Mark ${task.title} complete`} onClick={(event) => { event.stopPropagation(); onComplete() }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--ui-border)] text-transparent hover:border-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"><Check size={14} /></button><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{task.title}</span><span className={`mt-0.5 flex items-center gap-1 text-[11px] ${overdue ? 'font-semibold text-red-600' : 'text-[var(--muted-foreground)]'}`}><Clock3 size={11} />{task.due_date ? format(new Date(task.due_date), 'MMM d') : 'No due date'} · {priorityLabel(task.priority)}</span></span>{profile ? <Avatar name={profile.display_name} src={profile.avatar_url} size={27} /> : <span className="hidden text-[10px] text-[var(--muted-foreground)] sm:block">Unassigned</span>}<ChevronRight size={15} className="text-[var(--muted-foreground)]" /></div>
}

function priorityLabel(priority: TaskPriority) { return { urgent:'Urgent', high:'High priority', medium:'Medium priority', low:'Low priority' }[priority] }
function Loading() { return <main className="flex-1 bg-[var(--app-bg)] p-6"><div className="mx-auto max-w-[1450px] animate-pulse"><div className="mb-5 h-20 rounded-xl bg-[var(--surface-muted)]" /><div className="h-[720px] rounded-xl bg-[var(--surface)]" /></div></main> }
