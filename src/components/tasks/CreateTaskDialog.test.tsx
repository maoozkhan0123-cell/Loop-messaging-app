import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CreateTaskDialog } from './CreateTaskDialog'
import type { Profile, ProjectBoard, ProjectColumn } from '@/types/database'

const boards: ProjectBoard[] = [
  { id: 'board-1', name: 'Website', description: null, created_by: 'person-1', created_at: '', archived_at: null },
  { id: 'board-2', name: 'Mobile app', description: null, created_by: 'person-1', created_at: '', archived_at: null },
]
const columns: ProjectColumn[] = [
  { id: 'todo', board_id: 'board-1', name: 'To do', position: 0, created_at: '' },
  { id: 'doing', board_id: 'board-1', name: 'In progress', position: 1, created_at: '' },
  { id: 'mobile-todo', board_id: 'board-2', name: 'Backlog', position: 0, created_at: '' },
]
const profiles: Profile[] = [
  { id: 'person-1', display_name: 'Amna Khan', email: 'amna@bytechsol.com', avatar_url: null, job_title: 'Designer', status: 'online', created_at: '' },
  { id: 'person-2', display_name: 'Bilal Ahmed', email: 'bilal@bytechsol.com', avatar_url: null, job_title: 'Engineer', status: 'offline', created_at: '' },
]
const baseProps = { boards, columns, profiles, selectedDate: new Date(2026, 10, 16) }

afterEach(cleanup)

describe('CreateTaskDialog', () => {
  it('creates a task with multiple people, dates, labels and checklist progress', async () => {
    const onCreate = vi.fn().mockResolvedValue({})
    const onOpenChange = vi.fn()
    render(<CreateTaskDialog {...baseProps} open onOpenChange={onOpenChange} onCreate={onCreate} availableLabels={['Release']} />)

    for (const name of ['Task title', 'Description', 'Project', 'Status', 'Priority', 'Start date', 'Due date']) {
      const control = screen.getByLabelText(name) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      expect(control.labels?.[0]?.textContent).toBe(name)
      expect(control.labels?.[0]?.htmlFor).toBe(control.id)
    }

    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Launch the homepage' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Review and ship the new design.' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'doing' } })
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-12' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-11-20' } })

    fireEvent.click(screen.getByRole('button', { name: 'Choose assignees' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Assign Amna Khan' }))
    fireEvent.change(screen.getByLabelText('Search assignees'), { target: { value: 'bilal@' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Assign Bilal Ahmed' }))
    expect(screen.getByRole('button', { name: 'Remove Amna Khan from assignees' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove Bilal Ahmed from assignees' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Release' }))
    fireEvent.change(screen.getByLabelText('Add a label'), { target: { value: 'Design' } })
    fireEvent.keyDown(screen.getByLabelText('Add a label'), { key: 'Enter' })
    fireEvent.change(screen.getByLabelText('New checklist item'), { target: { value: 'Review copy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add checklist item' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Complete checklist item 1' }))
    fireEvent.change(screen.getByLabelText('New checklist item'), { target: { value: 'Publish page' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add checklist item' }))
    expect(screen.getByRole('progressbar', { name: 'Checklist progress' })).toHaveAttribute('aria-valuenow', '50')

    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce())
    expect(onCreate).toHaveBeenCalledWith({
      boardId: 'board-1', columnId: 'doing', title: 'Launch the homepage', description: 'Review and ship the new design.',
      priority: 'high', assigneeId: 'person-1', assigneeIds: ['person-1', 'person-2'], startDate: '2026-11-12', dueDate: '2026-11-20',
      labels: ['Release', 'Design'], checklistItems: [{ label: 'Review copy', completed: true }, { label: 'Publish page', completed: false }],
    })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('retains a failed draft and resets it when the dialog opens again', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('Unable to save this task.'))
    const onOpenChange = vi.fn()
    const { rerender } = render(<CreateTaskDialog {...baseProps} open onOpenChange={onOpenChange} onCreate={onCreate} />)
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Keep my work' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to save this task.')
    expect(screen.getByLabelText('Task title')).toHaveValue('Keep my work')
    expect(onOpenChange).not.toHaveBeenCalled()

    rerender(<CreateTaskDialog {...baseProps} open={false} onOpenChange={onOpenChange} onCreate={onCreate} />)
    rerender(<CreateTaskDialog {...baseProps} open onOpenChange={onOpenChange} onCreate={onCreate} />)
    expect(screen.getByLabelText('Task title')).toHaveValue('')
    expect(screen.getByLabelText('Due date')).toHaveValue('2026-11-16')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('allows a task to have a start date without a deadline', async () => {
    const onCreate = vi.fn().mockResolvedValue({})
    render(<CreateTaskDialog {...baseProps} open onOpenChange={vi.fn()} onCreate={onCreate} />)
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Explore a new concept' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Clear due date' }))
    expect(screen.getByLabelText('Due date')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ startDate: '2026-11-12', dueDate: null })))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('rejects an inverted date range without losing the draft', () => {
    const onCreate = vi.fn()
    render(<CreateTaskDialog {...baseProps} open onOpenChange={vi.fn()} onCreate={onCreate} />)
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Plan a launch' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-20' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create task' }).closest('form')!)
    expect(screen.getByRole('alert')).toHaveTextContent('Due date must be on or after the start date.')
    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Task title')).toHaveValue('Plan a launch')
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-11-20')
  })

  it('uses the selected project statuses and prevents duplicate submissions', async () => {
    let finishCreate!: () => void
    const onCreate = vi.fn(() => new Promise<void>((resolve) => { finishCreate = resolve }))
    render(<CreateTaskDialog {...baseProps} open onOpenChange={vi.fn()} onCreate={onCreate} />)
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'board-2' } })
    expect(screen.getByLabelText('Status')).toHaveValue('mobile-todo')
    expect(screen.queryByRole('option', { name: 'In progress' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Mobile task' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled()
    expect(screen.getByLabelText('Task title')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(onCreate).toHaveBeenCalledOnce()
    finishCreate()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create task' })).not.toBeDisabled())
  })
})
