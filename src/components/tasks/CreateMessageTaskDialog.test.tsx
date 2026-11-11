import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateMessageTaskDialog } from './CreateMessageTaskDialog'
import type { Message } from '@/types/database'

const mocks = vi.hoisted(() => ({ createTask: vi.fn(), refetch: vi.fn(), result: {} as Record<string, unknown> }))
vi.mock('@/hooks/useDashboard', () => ({ useDashboard: () => mocks.result }))
const message = { id: 'source-message', channel_id: 'channel', body: '**Review checkout**\nFix the mobile payment error.', profiles: { display_name: 'Hanan' } } as Message
const data = {
  boards: [{ id: 'board', name: 'Website' }], columns: [{ id: 'todo', board_id: 'board', name: 'To do', position: 0 }], profiles: [], tasks: [],
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.createTask.mockResolvedValue({ id: 'task' })
  mocks.result = { data, isLoading: false, error: null, createTask: mocks.createTask, isCreatingTask: false, refetch: mocks.refetch }
})
afterEach(cleanup)

describe('CreateMessageTaskDialog', () => {
  it('reviews copied context and privacy, then saves only on explicit Create with a durable source backlink', async () => {
    const onClose = vi.fn()
    render(<CreateMessageTaskDialog message={message} conversation="#Release" isDM={false} currentUserId="me" onClose={onClose} />)
    expect(screen.getByLabelText('Task title')).toHaveValue('Review checkout')
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toContain('Fix the mobile payment error.')
    expect(screen.getByText(/Copied message context will be readable/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open source message' })).toHaveAttribute('href', expect.stringContaining('/channel/channel?message=source-message'))
    expect(mocks.createTask).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Edited requirements' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await waitFor(() => expect(mocks.createTask).toHaveBeenCalledOnce())
    expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Review checkout', boardId: 'board', columnId: 'todo',
      description: expect.stringContaining('Edited requirements\n\nSource message from Hanan in #Release:'),
    }))
    expect(mocks.createTask.mock.calls[0][0].description).toContain('/channel/channel?message=source-message')
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('allows cancellation without creating a task', () => {
    const onClose = vi.fn()
    render(<CreateMessageTaskDialog message={message} conversation="Hanan" isDM currentUserId="me" onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(mocks.createTask).not.toHaveBeenCalled()
  })

  it('shows loading and retry states without presenting an empty project list', () => {
    mocks.result = { ...mocks.result, data: undefined, isLoading: true }
    const { rerender } = render(<CreateMessageTaskDialog message={message} conversation="#Release" isDM={false} currentUserId="me" onClose={vi.fn()} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects')
    expect(screen.queryByLabelText('Project')).not.toBeInTheDocument()
    mocks.result = { ...mocks.result, isLoading: false, error: new Error('Project lookup failed') }
    rerender(<CreateMessageTaskDialog message={message} conversation="#Release" isDM={false} currentUserId="me" onClose={vi.fn()} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Project lookup failed')
    fireEvent.click(screen.getByRole('button', { name: 'Retry projects' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
    expect(mocks.createTask).not.toHaveBeenCalled()
  })
})
