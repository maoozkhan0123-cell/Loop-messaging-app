'use client'

import { useId, useMemo, useState } from 'react'
import { ArrowRight, FolderKanban, Plus, Search, SearchX, X } from 'lucide-react'
import type { ProjectBoard, ProjectColumn, ProjectTask } from '@/types/database'

export interface ProjectsOverviewProps {
  boards: ProjectBoard[]
  tasks: ProjectTask[]
  columns: ProjectColumn[]
  onOpenBoard: (id: string) => void
  onCreateBoard: () => void
}

export function ProjectsOverview({ boards, tasks, columns, onOpenBoard, onCreateBoard }: ProjectsOverviewProps) {
  const headingId = useId()
  const [query, setQuery] = useState('')
  const projects = useMemo(() => boards.map(board => {
    const boardTasks = tasks.filter(task => task.board_id === board.id && !task.archived_at)
    const doneColumns = new Set(columns.filter(column => column.board_id === board.id && /done|complete/i.test(column.name)).map(column => column.id))
    const completed = boardTasks.filter(task => doneColumns.has(task.column_id)).length
    return { board, total: boardTasks.length, completed, progress: boardTasks.length ? Math.round(completed / boardTasks.length * 100) : 0 }
  }), [boards, columns, tasks])
  const needle = query.trim().toLowerCase()
  const visible = projects.filter(({ board }) => !needle || `${board.name} ${board.description ?? ''}`.toLowerCase().includes(needle))

  return <section aria-labelledby={headingId} className="min-h-0 min-w-0 flex-1 bg-[var(--app-bg)] text-[var(--foreground)]">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 id={headingId} className="text-2xl font-semibold tracking-tight">Projects</h1><p className="mt-1 text-sm text-[var(--muted-foreground)]">Choose a project to open its board and tasks.</p></div>
        <button type="button" onClick={onCreateBoard} className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><Plus size={16} />New project</button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full min-w-0 sm:max-w-sm"><span className="sr-only">Search projects</span><Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects by name or description" className="h-11 w-full rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] pl-10 pr-10 text-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]" />{query && <button type="button" onClick={() => setQuery('')} aria-label="Clear project search" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]"><X size={14} /></button>}</label>
        <p role="status" aria-live="polite" className="text-xs text-[var(--muted-foreground)]">{needle ? `${visible.length} of ${boards.length} projects` : `${boards.length} ${boards.length === 1 ? 'project' : 'projects'}`}</p>
      </div>

      {!boards.length ? <div className="rounded-2xl border border-dashed border-[var(--ui-border)] bg-[var(--surface)] px-5 py-16 text-center"><FolderKanban size={32} className="mx-auto text-[var(--primary)]" /><h2 className="mt-4 text-lg font-semibold">No projects yet</h2><p className="mx-auto mt-2 max-w-sm text-sm text-[var(--muted-foreground)]">Create a project to organize tasks and collaborate with your team.</p><button type="button" onClick={onCreateBoard} className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"><Plus size={16} />Create your first project</button></div>
        : !visible.length ? <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] px-5 py-16 text-center"><SearchX size={30} className="mx-auto text-[var(--muted-foreground)]" /><h2 className="mt-4 text-lg font-semibold">No matching projects</h2><p className="mt-2 text-sm text-[var(--muted-foreground)]">Try another project name or description.</p><button type="button" onClick={() => setQuery('')} className="mt-5 rounded-lg border border-[var(--ui-border)] px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-muted)]">Clear search</button></div>
          : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(({ board, total, completed, progress }) => {
            const titleId = `${headingId}-${board.id}`
            return <article key={board.id} aria-labelledby={titleId} className="flex min-w-0 flex-col rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] p-5 shadow-sm transition hover:border-[var(--primary)]">
              <div className="mb-4 flex items-center justify-between gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><FolderKanban size={20} /></span><span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 text-xs font-medium text-[var(--muted-foreground)]">{total} {total === 1 ? 'task' : 'tasks'}</span></div>
              <h2 id={titleId} className="line-clamp-2 break-words text-base font-semibold">{board.name}</h2>
              <p className="mt-2 line-clamp-2 min-h-10 break-words text-sm text-[var(--muted-foreground)]">{board.description?.trim() || 'No description yet.'}</p>
              <div className="mt-5"><div className="mb-2 flex items-center justify-between gap-2 text-xs"><span className="text-[var(--muted-foreground)]">{total ? `${completed} completed` : 'No tasks yet'}</span><span className="font-semibold">{progress}%</span></div><div role="progressbar" aria-label={`${board.name} completion`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${completed} of ${total} tasks completed`} className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full bg-[var(--primary)] transition-[width]" style={{ width: `${progress}%` }} /></div></div>
              <button type="button" onClick={() => onOpenBoard(board.id)} aria-label={`Open ${board.name}`} className="mt-5 flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-[var(--ui-border)] px-3 py-2 text-sm font-semibold text-[var(--primary)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">Open project<ArrowRight size={16} /></button>
            </article>
          })}</div>}
    </div>
  </section>
}
