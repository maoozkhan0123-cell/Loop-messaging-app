import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProjectsPage from './page'
import type { ProjectBoard, ProjectColumn, ProjectTask } from '@/types/database'

const mocks = vi.hoisted(() => ({
  query: '',
  useProjects: vi.fn(),
  overrides: {} as Record<string, unknown>,
  router: { push: vi.fn(), replace: vi.fn() },
  refetchProjects: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
  useSearchParams: () => new URLSearchParams(mocks.query),
}))

vi.mock('@/hooks/useProjects', () => ({
  useProjects: (boardId?: string) => mocks.useProjects(boardId),
  useTaskComments: () => ({ data: [] }),
}))

vi.mock('@/hooks/useProfiles', () => ({ useAllProfiles: () => ({ data: [] }) }))
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { id: 'viewer', display_name: 'Viewer' } }) }))
vi.mock('@/components/tasks/TaskAssignees', () => ({ TaskAssignees: () => null }))
vi.mock('@/components/tasks/TaskCardSummary', () => ({ TaskCardSummary: () => null }))
vi.mock('@/components/tasks/CreateTaskDialog', () => ({
  CreateTaskDialog: ({ open, defaultBoardId, defaultColumnId }: { open: boolean; defaultBoardId?: string; defaultColumnId?: string }) => open
    ? <div role="dialog" aria-label="New task" data-board={defaultBoardId} data-column={defaultColumnId} />
    : null,
}))
vi.mock('@/components/task-details/TaskDetailModal', () => ({
  TaskDetailModal: ({ task }: { task: ProjectTask }) => <div role="dialog" aria-label="Task details">{task.title}</div>,
}))

const boards: ProjectBoard[] = [
  { id: 'board-empty', name: 'loop errors', description: null, created_by: 'viewer', created_at: '2026-11-09T12:00:00Z', archived_at: null },
  { id: 'board-workspace', name: 'Loop Workspace', description: 'Team delivery', created_by: 'viewer', created_at: '2026-11-01T12:00:00Z', archived_at: null },
]
const columns: ProjectColumn[] = [
  { id: 'empty-todo', board_id: 'board-empty', name: 'To do', position: 0, created_at: '' },
  { id: 'workspace-todo', board_id: 'board-workspace', name: 'To do', position: 0, created_at: '' },
  { id: 'workspace-done', board_id: 'board-workspace', name: 'Done', position: 1, created_at: '' },
]
const tasks: ProjectTask[] = Array.from({ length: 9 }, (_, index) => ({
  id: `task-${index + 1}`, board_id: 'board-workspace', column_id: index < 3 ? 'workspace-done' : 'workspace-todo',
  title: `Workspace task ${index + 1}`, description: null, priority: 'medium', due_date: null, assignee_id: null,
  created_by: 'viewer', position: index, created_at: '2026-11-01T12:00:00Z',
}))
const emptyTasks: ProjectTask[] = []
const emptyColumns: ProjectColumn[] = []
const columnsByBoard = Object.fromEntries(boards.map((board) => [board.id, columns.filter((column) => column.board_id === board.id)]))
const tasksByBoard = Object.fromEntries(boards.map((board) => [board.id, tasks.filter((task) => task.board_id === board.id)]))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.query = ''
  mocks.overrides = {}
  mocks.useProjects.mockImplementation((boardId?: string) => {
    const activeBoardId = boardId || boards[0].id
    return {
      boards, activeBoardId, columns: columnsByBoard[activeBoardId] ?? emptyColumns, tasks: tasksByBoard[activeBoardId] ?? emptyTasks,
      workspaceTasks: tasks, workspaceColumns: columns, isLoading: false, isCatalogLoading: false, catalogError: null, boardError: null,
      refetchProjects: mocks.refetchProjects,
      createBoard: vi.fn(), createColumn: vi.fn(), createTask: vi.fn(), moveTask: vi.fn(), moveTaskToBoard: vi.fn(),
      updateTask: vi.fn(), deleteTask: vi.fn(), addTaskComment: vi.fn(),
      ...mocks.overrides,
    }
  })
})

afterEach(cleanup)

describe('Projects navigation', () => {
  it('shows both boards and their own task counts at the bare projects URL', () => {
    render(<ProjectsPage />)
    expect(screen.getByRole('heading', { name: 'Projects', level: 1 })).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'loop errors' })).getByText('0 tasks')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: 'Loop Workspace' })).getByText('9 tasks')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Select project' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Loop Workspace' }))
    expect(mocks.router.push).toHaveBeenCalledWith('/projects?board=board-workspace', { scroll: false })
  })

  it('uses the URL board on the initial render and opens its linked task', async () => {
    mocks.query = 'board=board-workspace&task=task-1'
    render(<ProjectsPage />)
    expect(mocks.useProjects).toHaveBeenNthCalledWith(1, 'board-workspace')
    expect(screen.getByRole('combobox', { name: 'Select project' })).toHaveValue('board-workspace')
    expect(await screen.findByRole('dialog', { name: 'Task details' })).toHaveTextContent('Workspace task 1')
    expect(screen.queryByRole('heading', { name: 'Projects', level: 1 })).not.toBeInTheDocument()
  })

  it('switches boards through the URL and returns to the overview when browser history removes the board', () => {
    mocks.query = 'board=board-empty'
    const { rerender } = render(<ProjectsPage />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Select project' }), { target: { value: 'board-workspace' } })
    expect(mocks.router.push).toHaveBeenCalledWith('/projects?board=board-workspace', { scroll: false })

    mocks.query = 'board=board-workspace'
    rerender(<ProjectsPage />)
    expect(screen.getByRole('combobox', { name: 'Select project' })).toHaveValue('board-workspace')
    expect(screen.getByText('Workspace task 1')).toBeInTheDocument()

    mocks.query = ''
    rerender(<ProjectsPage />)
    expect(screen.getByRole('article', { name: 'loop errors' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Loop Workspace' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Select project' })).not.toBeInTheDocument()
    expect(mocks.useProjects).toHaveBeenLastCalledWith(undefined)
  })

  it('preserves the chosen board and unrelated query parameters when consuming a new-task link', async () => {
    mocks.query = 'board=board-workspace&newTask=1&from=calendar'
    render(<ProjectsPage />)
    const dialog = await screen.findByRole('dialog', { name: 'New task' })
    expect(dialog).toHaveAttribute('data-board', 'board-workspace')
    expect(dialog).toHaveAttribute('data-column', 'workspace-todo')
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/projects?board=board-workspace&from=calendar', { scroll: false }))
  })

  it('explains an unavailable board and provides a route back to all projects', () => {
    mocks.query = 'board=unavailable-board'
    render(<ProjectsPage />)
    expect(screen.getByRole('heading', { name: 'Project unavailable' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View all projects' }))
    expect(mocks.router.push).toHaveBeenCalledWith('/projects', { scroll: false })
  })

  it('waits for catalog data rather than briefly displaying an empty overview', () => {
    mocks.overrides = { boards: [], workspaceTasks: [], workspaceColumns: [], isCatalogLoading: true }
    render(<ProjectsPage />)
    expect(screen.getByText('Loading projects...')).toBeInTheDocument()
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument()
    expect(screen.queryByText('No Project Boards Yet')).not.toBeInTheDocument()
  })

  it('reports catalog failures instead of claiming there are no projects, and can retry', () => {
    mocks.overrides = { boards: [], workspaceTasks: [], workspaceColumns: [], catalogError: new Error('Network unavailable') }
    render(<ProjectsPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load your projects.')
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument()
    expect(screen.queryByText('No Project Boards Yet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.refetchProjects).toHaveBeenCalledOnce()
  })
})
