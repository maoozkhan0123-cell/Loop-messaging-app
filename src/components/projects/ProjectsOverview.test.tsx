import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectBoard, ProjectColumn, ProjectTask } from '@/types/database'
import { ProjectsOverview } from './ProjectsOverview'

const now = '2026-11-09T12:00:00.000Z'
const boards: ProjectBoard[] = [
  { id: 'design', name: 'Design system', description: 'Reusable interface components', created_by: 'user-1', created_at: now, archived_at: null },
  { id: 'launch', name: 'Product launch', description: 'Finance release coordination', created_by: 'user-1', created_at: now, archived_at: null },
]
const columns: ProjectColumn[] = [
  { id: 'design-todo', board_id: 'design', name: 'In progress', position: 0, created_at: now },
  { id: 'design-done', board_id: 'design', name: 'Done', position: 1, created_at: now },
  { id: 'launch-done', board_id: 'launch', name: 'Completed', position: 0, created_at: now },
]
const task = (id: string, boardId: string, columnId: string, archivedAt: string | null = null): ProjectTask => ({
  id, board_id: boardId, column_id: columnId, title: id, description: null, priority: 'medium', due_date: null, assignee_id: null, created_by: 'user-1', position: 0, created_at: now, archived_at: archivedAt,
})
const tasks = [task('active', 'design', 'design-todo'), task('complete', 'design', 'design-done'), task('archived', 'design', 'design-done', now), task('shipped', 'launch', 'launch-done'), task('unrelated', 'elsewhere', 'launch-done')]

describe('ProjectsOverview', () => {
  it('shows all boards with separate active task counts and completion progress', () => {
    render(<ProjectsOverview boards={boards} tasks={tasks} columns={columns} onOpenBoard={vi.fn()} onCreateBoard={vi.fn()} />)
    const design = screen.getByRole('article', { name: 'Design system' })
    const launch = screen.getByRole('article', { name: 'Product launch' })
    expect(within(design).getByText('2 tasks')).toBeInTheDocument()
    expect(within(design).getByText('1 completed')).toBeInTheDocument()
    expect(within(design).getByRole('progressbar', { name: 'Design system completion' })).toHaveAttribute('aria-valuenow', '50')
    expect(within(launch).getByText('1 task')).toBeInTheDocument()
    expect(within(launch).getByRole('progressbar', { name: 'Product launch completion' })).toHaveAttribute('aria-valuenow', '100')
  })

  it('opens the selected board and offers project creation', () => {
    const onOpenBoard = vi.fn()
    const onCreateBoard = vi.fn()
    render(<ProjectsOverview boards={boards} tasks={tasks} columns={columns} onOpenBoard={onOpenBoard} onCreateBoard={onCreateBoard} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open Product launch' }))
    expect(onOpenBoard).toHaveBeenCalledWith('launch')
    fireEvent.click(screen.getByRole('button', { name: 'New project' }))
    expect(onCreateBoard).toHaveBeenCalledOnce()
  })

  it('searches project names and descriptions and restores boards after no matches', () => {
    render(<ProjectsOverview boards={boards} tasks={tasks} columns={columns} onOpenBoard={vi.fn()} onCreateBoard={vi.fn()} />)
    const search = screen.getByRole('searchbox', { name: 'Search projects' })
    fireEvent.change(search, { target: { value: 'FINANCE' } })
    expect(screen.getByRole('article', { name: 'Product launch' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Design system' })).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'unmatched project' } })
    expect(screen.getByRole('heading', { name: 'No matching projects' })).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(search).toHaveValue('')
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })

  it('explains an empty workspace and creates the first project', () => {
    const onCreateBoard = vi.fn()
    render(<ProjectsOverview boards={[]} tasks={[]} columns={[]} onOpenBoard={vi.fn()} onCreateBoard={onCreateBoard} />)
    expect(screen.getByRole('heading', { name: 'No projects yet' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create your first project' }))
    expect(onCreateBoard).toHaveBeenCalledOnce()
  })
})
