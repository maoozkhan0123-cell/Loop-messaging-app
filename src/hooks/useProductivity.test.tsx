import { createElement, type PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceEvents, type NewWorkspaceEvent } from './useProductivity'

const mocks = vi.hoisted(() => ({ from: vi.fn(), upsert: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => mocks }))

let eventError: { code: string; message: string } | null = null
let attendeeError: { message: string } | null = null
let events: Array<{ id: string; created_by: string }> = []

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children)
  return renderHook(() => useWorkspaceEvents('me'), { wrapper })
}

describe('workspace calendar failures', () => {
  beforeEach(() => {
    vi.clearAllMocks(); events = []; eventError = null; attendeeError = null
    mocks.upsert.mockResolvedValue({ error: null })
    mocks.from.mockImplementation((table: string) => {
      const result = () => ({ data: table === 'workspace_events' ? events : [], error: table === 'workspace_events' ? eventError : table === 'event_attendees' ? attendeeError : null })
      const chain = { select: () => chain, order: () => chain, in: () => chain, upsert: mocks.upsert,
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve) }
      return chain
    })
  })

  it('surfaces a missing calendar table instead of reporting an empty calendar', async () => {
    eventError = { code: 'PGRST205', message: 'Calendar unavailable' }
    const { result } = setup()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Calendar unavailable')
    expect(result.current.data).toBeUndefined()
  })

  it('does not present missing attendance as an empty invitation list', async () => {
    events = [{ id: 'event-1', created_by: 'organiser' }]
    attendeeError = { message: 'Invitations unavailable' }
    const { result } = setup()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Invitations unavailable')
  })

  it('keeps RSVP failures available to the page and allows retrying a company RSVP', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    mocks.upsert.mockResolvedValueOnce({ error: { message: 'Network unavailable' } })
    await act(async () => {
      await expect(result.current.rsvp({ eventId: 'company-event', response: 'accepted' })).rejects.toThrow('Network unavailable')
    })
    await act(async () => { await result.current.rsvp({ eventId: 'company-event', response: 'accepted' }) })
    expect(mocks.upsert).toHaveBeenLastCalledWith({ event_id: 'company-event', user_id: 'me', response: 'accepted' }, { onConflict: 'event_id,user_id' })
  })

  it('rejects invalid meeting links before inserting an event', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    mocks.from.mockClear()
    const input: NewWorkspaceEvent = { title: 'Planning', description: null, starts_at: '2026-11-10T10:00:00Z', ends_at: '2026-11-10T11:00:00Z', location: null, meeting_url: 'javascript:alert(1)', recurrence: 'none', visibility: 'invite', inviteeIds: [] }
    await act(async () => { await expect(result.current.createEvent(input)).rejects.toThrow('Meeting links must start') })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
