import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import IdeasPage from './page'
import type { Idea } from '@/types/database'

const mocks = vi.hoisted(() => ({ ideas: [] as Idea[], isError: false, refetch: vi.fn(), createIdea: vi.fn(), updateStatus: vi.fn(), deleteIdea: vi.fn(), addComment: vi.fn() }))
vi.mock('@/hooks/useIdeas', () => ({ useIdeas: () => ({ ...mocks, isLoading: false, error: new Error('Connection unavailable') }), useIdeaComments: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }) }))
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { id: 'me' } }), useIsWorkspaceAdmin: () => false }))

const idea: Idea = { id: 'idea-1', author_id: 'me', title: 'Friday demos', description: 'Share our weekly progress', status: 'under_review', created_at: '2026-11-09T12:00:00Z' }

describe('Ideas feedback and recovery', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.ideas = [idea]; mocks.isError = false })

  it('shows a retry on query failure instead of an empty ideas message', () => {
    mocks.isError = true
    render(<IdeasPage />)
    expect(screen.getByText('Ideas could not be loaded')).toBeInTheDocument()
    expect(screen.queryByText('No Ideas Submitted Yet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry ideas' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('distinguishes no search results and allows clearing the search', () => {
    render(<IdeasPage />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search team ideas' }), { target: { value: 'nonexistent' } })
    expect(screen.getByText('No matching ideas')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
    expect(screen.getByText('Friday demos')).toBeInTheDocument()
  })

  it('preserves an idea draft and displays the server error when saving fails', async () => {
    mocks.createIdea.mockRejectedValueOnce({ message: 'Idea could not be saved while offline' })
    render(<IdeasPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Submit Idea' }))
    const dialog = screen.getByRole('dialog', { name: 'Submit Team Idea' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Idea title' }), { target: { value: 'Pair programming' } })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Idea description' }), { target: { value: 'Try shared sessions' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit Idea' }))
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Idea could not be saved while offline'))
    expect(within(dialog).getByRole('textbox', { name: 'Idea title' })).toHaveValue('Pair programming')
    expect(within(dialog).getByRole('button', { name: 'Submit Idea' })).toBeEnabled()
  })

  it('preserves a failed comment and lets the user retry', async () => {
    mocks.addComment.mockRejectedValueOnce(new Error('Comment failed to save'))
    render(<IdeasPage />)
    fireEvent.click(screen.getByRole('button', { name: '0 Comments' }))
    const dialog = screen.getByRole('dialog', { name: 'Friday demos' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Comment on idea' }), { target: { value: 'Great suggestion' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Comment' }))
    await waitFor(() => expect(within(dialog).getByRole('alert')).toHaveTextContent('Comment failed to save'))
    expect(within(dialog).getByRole('textbox', { name: 'Comment on idea' })).toHaveValue('Great suggestion')
  })
})
