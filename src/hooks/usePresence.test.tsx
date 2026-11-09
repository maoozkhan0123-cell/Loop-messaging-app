import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePresence } from './usePresence'

const mocks = vi.hoisted(() => ({
  preferences: { availability: 'online' as 'online' | 'away' | 'offline', onlineStatus: true }, hydrated: true,
  getUser: vi.fn(), createChannel: vi.fn(), removeChannel: vi.fn(), track: vi.fn(), untrack: vi.fn(),
  subscribed: undefined as ((status: string) => void) | undefined,
}))
vi.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ preferences: mocks.preferences, hydrated: mocks.hydrated }) }))
vi.mock('@/lib/supabase/client', () => {
  const supabase = {
    auth: { getUser: mocks.getUser }, removeChannel: mocks.removeChannel,
    channel: (...args: unknown[]) => {
      mocks.createChannel(...args)
      const channel = {
        on: () => channel,
        subscribe: (callback: (status: string) => void) => { mocks.subscribed = callback; return channel },
        track: mocks.track, untrack: mocks.untrack, presenceState: () => ({}),
      }
      return channel
    },
  }
  return { createClient: () => supabase }
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.preferences = { availability: 'online', onlineStatus: true }; mocks.hydrated = true; mocks.subscribed = undefined
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
  mocks.track.mockResolvedValue('ok'); mocks.untrack.mockResolvedValue('ok')
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
})
afterEach(cleanup)

describe('usePresence preferences and cleanup', () => {
  it('waits for private preferences to hydrate before connecting', async () => {
    mocks.hydrated = false
    const { rerender } = renderHook(() => usePresence('room'))
    expect(mocks.getUser).not.toHaveBeenCalled()
    mocks.hydrated = true; mocks.preferences.onlineStatus = false
    rerender()
    await waitFor(() => expect(mocks.subscribed).toBeDefined())
    act(() => mocks.subscribed!('SUBSCRIBED'))
    expect(mocks.untrack).toHaveBeenCalledOnce()
    expect(mocks.track).not.toHaveBeenCalled()
  })

  it('does not create a presence channel after auth resolves for an unmounted hook', async () => {
    let finishAuth!: (value: { data: { user: { id: string } } }) => void
    mocks.getUser.mockReturnValue(new Promise((resolve) => { finishAuth = resolve }))
    const { unmount } = renderHook(() => usePresence('room'))
    unmount()
    await act(async () => finishAuth({ data: { user: { id: 'me' } } }))
    expect(mocks.createChannel).not.toHaveBeenCalled()
    expect(mocks.track).not.toHaveBeenCalled()
  })

  it('keeps manual Away when visible and stops listening after cleanup', async () => {
    mocks.preferences.availability = 'away'
    const { unmount } = renderHook(() => usePresence('room'))
    await waitFor(() => expect(mocks.subscribed).toBeDefined())
    act(() => mocks.subscribed!('SUBSCRIBED'))
    expect(mocks.track).toHaveBeenCalledWith(expect.objectContaining({ status: 'away' }))
    unmount()
    mocks.track.mockClear()
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(mocks.track).not.toHaveBeenCalled()
    expect(mocks.removeChannel).toHaveBeenCalledOnce()
  })
})
