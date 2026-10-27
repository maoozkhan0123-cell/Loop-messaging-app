'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, isPast } from 'date-fns'
import { ArrowRight, Check, ChevronRight, Clock3, FolderKanban, Search } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { DashboardHeader } from '@/components/dashboard/DashboardHeader'
import { RightSidebar } from '@/components/dashboard/RightSidebar'
import { useDashboard } from '@/hooks/useDashboard'
import { useCreateDM } from '@/hooks/useChannels'
import { useProfile } from '@/hooks/useProfile'
import type { Profile, ProjectTask, TaskPriority } from '@/types/database'

const projectTones = [
  { background: 'var(--primary-soft)', accent: 'var(--primary)', icon: 'var(--surface)' },
  { background: '#FFF0F6', accent: '#C93677', icon: '#FFE1EE' },
  { background: '#EAF8FB', accent: '#167D96', icon: '#D5F1F6' },
  { background: '#FFF6E3', accent: '#B66E0B', icon: '#FFE9BC' },
]

export default function DashboardPage() {
  const router = useRouter()
  const { data: me } = useProfile()
  const { data, isLoading, error, completeTask, isCompletingTask, createTask, isCreatingTask } = useDashboard()
  const createDM = useCreateDM()
  const [query, setQuery] = useState('')
  const [taskError, setTaskError] = useState<string | null>(null)

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
    <DashboardHeader user={me} query={query} onQueryChange={setQuery} onNewTask={() => router.push('/projects?newTask=1')} onNewMessage={() => router.push('/people')} />
    <div className="mx-auto grid min-h-[calc(100vh-130px)] max-w-[1500px] xl:grid-cols-[minmax(0,1fr)_390px]">
      <section className="min-w-0 p-5 sm:p-7 lg:p-9">
        <div className="mb-7 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><h2 className="text-xl font-semibold tracking-[-.025em]">Recent tasks</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">Stay focused on the work that needs attention next.</p></div><div className="flex items-center gap-2"><label className="relative lg:hidden"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" className="h-10 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] pl-9 pr-3 text-xs outline-none" /></label><button onClick={() => router.push('/projects')} className="whitespace-nowrap text-xs font-semibold text-[var(--primary)]">All tasks</button></div></div>
        <div className="space-y-2.5">{taskError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{taskError}</div>}{actionableTasks.map((task) => <RecentTask key={task.id} task={task} profile={task.assignee_id ? view.profileMap.get(task.assignee_id) : undefined} onOpen={() => router.push(`/projects?board=${task.board_id}&task=${task.id}`)} onComplete={() => void handleCompleteTask(task)} disabled={isCompletingTask} />)}{!actionableTasks.length && <div className="flex flex-col items-center rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--surface)] py-8 text-center"><span className="grid h-10 w-10 place-items-center rounded-full bg-emerald-50 text-emerald-600"><Check size={20} /></span><p className="mt-2 text-sm font-semibold">You are all caught up</p><button onClick={() => router.push('/projects')} className="mt-1 text-xs font-semibold text-[var(--primary)]">Open projects</button></div>}</div>
        <div className="mb-4 mt-9 flex items-center justify-between"><div><h2 className="text-xl font-semibold tracking-[-.025em]">Ongoing projects</h2><p className="mt-1 text-xs text-[var(--muted-foreground)]">Live progress across active workspaces</p></div><button onClick={() => router.push('/projects')} className="flex items-center gap-1 text-xs font-semibold text-[var(--primary)]">All projects <ArrowRight size={13} /></button></div>
        <div className="grid gap-3 sm:grid-cols-2">{view.boards.slice(0,4).map((board,index) => <ProjectCard key={board.id} name={board.name} description={board.description} total={board.tasks.length} finished={board.finished} progress={board.progress} tone={projectTones[index % projectTones.length]} profiles={board.tasks.map((task) => task.assignee_id ? view.profileMap.get(task.assignee_id) : undefined).filter(Boolean) as Profile[]} onClick={() => router.push(`/projects?board=${board.id}`)} />)}{!view.boards.length && <button onClick={() => router.push('/projects')} className="col-span-full flex min-h-32 items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--ui-border)] bg-[var(--surface)] text-sm font-semibold"><FolderKanban size={18} />Create a project</button>}</div>
      </section>
      <RightSidebar tasks={data.tasks} boards={data.boards} columns={data.columns} profiles={data.profiles.filter((profile) => profile.id !== me?.id)} onCreateTask={createTask} onOpenTask={(task) => router.push(`/projects?board=${task.board_id}&task=${task.id}`)} onMessageMember={messageMember} onViewTeam={() => router.push('/people')} creatingTask={isCreatingTask} />
    </div>
  </main>
}

function RecentTask({ task, profile, onOpen, onComplete, disabled }: { task: ProjectTask; profile?: Profile; onOpen: () => void; onComplete: () => void; disabled: boolean }) {
  const overdue = !!task.due_date && isPast(new Date(task.due_date))
  return <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onOpen() }} className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] px-4 py-3 text-left shadow-sm transition hover:border-[var(--primary)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><button type="button" disabled={disabled} aria-label={`Mark ${task.title} complete`} onClick={(event) => { event.stopPropagation(); onComplete() }} className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--ui-border)] text-transparent hover:border-[var(--primary)] hover:bg-[var(--primary)] hover:text-white"><Check size={14} /></button><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{task.title}</span><span className={`mt-0.5 flex items-center gap-1 text-[11px] ${overdue ? 'font-semibold text-red-600' : 'text-[var(--muted-foreground)]'}`}><Clock3 size={11} />{task.due_date ? format(new Date(task.due_date), 'MMM d') : 'No due date'} · {priorityLabel(task.priority)}</span></span>{profile ? <Avatar name={profile.display_name} src={profile.avatar_url} size={27} /> : <span className="hidden text-[10px] text-[var(--muted-foreground)] sm:block">Unassigned</span>}<ChevronRight size={15} className="text-[var(--muted-foreground)]" /></div>
}

function ProjectCard({ name, description, total, finished, progress, tone, profiles, onClick }: { name: string; description: string | null; total: number; finished: number; progress: number; tone: typeof projectTones[number]; profiles: Profile[]; onClick: () => void }) {
  const people = Array.from(new Map(profiles.map((profile) => [profile.id,profile])).values()).slice(0,4)
  return <button onClick={onClick} className="group rounded-xl border border-transparent p-4 text-left transition hover:-translate-y-0.5 hover:border-[var(--ui-border)] hover:shadow-md" style={{ background: tone.background }}><div className="flex items-start justify-between"><span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: tone.icon, color: tone.accent }}><FolderKanban size={17} /></span><span className="text-xs font-bold" style={{ color: tone.accent }}>{progress}%</span></div><h3 className="mt-3 truncate text-sm font-semibold">{name}</h3><p className="mt-1 truncate text-[11px] text-[var(--muted-foreground)]">{description || `${finished} of ${total} tasks complete`}</p><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/70"><div className="h-full rounded-full" style={{ width: `${progress}%`, background: tone.accent }} /></div><div className="mt-3 flex items-center justify-between"><span className="text-[10px] text-[var(--muted-foreground)]">{finished}/{total} completed</span><span className="flex -space-x-1.5">{people.map((profile) => <span key={profile.id} className="rounded-full ring-2 ring-white"><Avatar name={profile.display_name} src={profile.avatar_url} size={21} /></span>)}</span></div></button>
}

function priorityLabel(priority: TaskPriority) { return { urgent:'Urgent', high:'High priority', medium:'Medium priority', low:'Low priority' }[priority] }
function Loading() { return <main className="flex-1 bg-[var(--app-bg)] p-6"><div className="mx-auto max-w-[1450px] animate-pulse"><div className="mb-5 h-20 rounded-xl bg-[var(--surface-muted)]" /><div className="h-[720px] rounded-xl bg-[var(--surface)]" /></div></main> }
