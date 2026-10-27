import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InteractiveCalendar } from './InteractiveCalendar'
import type { ProjectBoard, ProjectColumn, ProjectTask } from '@/types/database'

const board = { id: 'board-1', name: 'Launch', description: null, created_by: 'me', created_at: '', archived_at: null } as ProjectBoard
const column = { id: 'column-1', board_id: 'board-1', name: 'To do', position: 0, created_at: '' } as ProjectColumn
const task = { id: 'task-1', board_id: 'board-1', column_id: 'column-1', title: 'Leap day launch', description: null, priority: 'high', due_date: '2024-02-29', assignee_id: null, created_by: 'me', position: 0, created_at: '' } as ProjectTask

describe('InteractiveCalendar', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2024, 1, 29, 10)) })
  afterEach(() => vi.useRealTimers())

  it('navigates months and returns to today', () => {
    render(<InteractiveCalendar tasks={[task]} boards={[board]} columns={[column]} profiles={[]} onCreateTask={vi.fn()} onOpenTask={vi.fn()} />)
    expect(screen.getByText('February 2024')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))
    expect(screen.getByText('March 2024')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByText('February 2024')).toBeInTheDocument()
  })

  it('shows selected-day task counts and creates with that due date', async () => {
    const createTask = vi.fn().mockResolvedValue({})
    render(<InteractiveCalendar tasks={[task]} boards={[board]} columns={[column]} profiles={[]} onCreateTask={createTask} onOpenTask={vi.fn()} />)
    expect(screen.getByText('1 task due Feb 29')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /add task for this day/i }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Prepare release' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await vi.waitFor(() => expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ dueDate: '2024-02-29', title: 'Prepare release' })))
  })
})
