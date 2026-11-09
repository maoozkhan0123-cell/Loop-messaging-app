import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarPage from './page'
import type { WorkspaceEvent } from '@/types/database'
import type { InboxItem } from '@/hooks/useProductivity'

const mocks = vi.hoisted(() => ({ events: [] as WorkspaceEvent[], inbox: [] as InboxItem[], isError: false, refetch: vi.fn(), rsvp: vi.fn(), createEvent: vi.fn(), deleteEvent: vi.fn() }))
vi.mock('@/hooks/useProductivity', () => ({
  useWorkspaceEvents: () => ({ data: mocks.events, isLoading: false, isError: mocks.isError, refetch: mocks.refetch, rsvp: mocks.rsvp, createEvent: mocks.createEvent, deleteEvent: mocks.deleteEvent }),
  useUnifiedInbox: () => ({ data: mocks.inbox, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { id: 'me' } }), useIsWorkspaceAdmin: () => false }))
vi.mock('@/hooks/useProfiles', () => ({ useAllProfiles: () => ({ data: [] }) }))

describe('Calendar recovery and links', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.events = []; mocks.inbox = []; mocks.isError = false })

  it('shows a retry rather than an empty calendar when events cannot load', () => {
    mocks.isError = true
    render(<CalendarPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Events could not be loaded.')
    expect(screen.queryByText('No upcoming events')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry calendar' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('shows a failed company-event RSVP so the user can retry', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    mocks.events = [{ id: 'event-1', title: 'Town hall', starts_at: tomorrow.toISOString(), ends_at: new Date(tomorrow.getTime() + 3600_000).toISOString(), recurrence: 'none', visibility: 'company', created_by: 'organiser' } as WorkspaceEvent]
    mocks.rsvp.mockRejectedValueOnce(new Error('Offline'))
    render(<CalendarPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Going' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Your response could not be saved.'))
    expect(mocks.rsvp).toHaveBeenCalledWith({ eventId: 'event-1', response: 'accepted' })
  })

  it('opens the assigned task directly from deadline links', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    mocks.inbox = [{ id: 'task-1', done: false, task: { title: 'Review launch', due_date: tomorrow.toISOString() }, href: '/projects?board=board-1&task=task-1' } as InboxItem]
    render(<CalendarPage />)
    const links = screen.getAllByRole('link', { name: /Review launch/ })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveAttribute('href', '/projects?board=board-1&task=task-1')
  })
})
