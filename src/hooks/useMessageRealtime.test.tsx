import { act, cleanup, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { useGlobalNotifications } from './useGlobalNotifications'
import { appendMessage, bumpThreadReplyCount, profileCache, useMessages } from './useMessages'
import type { Message, Profile } from '@/types/database'

const mocks = vi.hoisted(() => ({
  insert: undefined as ((payload: Record<string, unknown>) => Promise<void>) | undefined,
  status: undefined as ((status: string) => void) | undefined,
  from: vi.fn(), removeChannel: vi.fn(),
}))
vi.mock('next/navigation', () => ({ usePathname: () => '/channel/channel-a' }))
vi.mock('@/lib/notifications', () => ({ getNotificationPref: () => false }))
vi.mock('@/lib/supabase/client', () => {
  const supabase = {
    from: mocks.from, removeChannel: mocks.removeChannel,
    channel: () => {
      const channel = {
        on: (_kind: string, filter: { event: string; table: string }, callback: (payload: Record<string, unknown>) => Promise<void>) => {
          if (filter.table === 'messages' && filter.event === 'INSERT') mocks.insert = callback
          return channel
        },
        subscribe: (callback?: (status: string) => void) => { mocks.status = callback; return channel },
      }
      return channel
    },
  }
  return { createClient: () => supabase }
})

const root = { id: 'root', channel_id: 'channel-a', parent_id: null, user_id: 'me', body: 'Root', reply_count: 0 } as Message
const reply = { id: 'reply', channel_id: 'channel-a', parent_id: 'root', user_id: 'me', body: 'Reply', created_at: '2026-11-09T12:00:00Z' } as Message
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnMount: false } } })
  client.setQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', null], { pages: [[root]], pageParams: [null] })
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.insert = undefined; mocks.status = undefined
  profileCache.clear()
  profileCache.set('me', { id: 'me', display_name: 'Me' } as Profile)
  mocks.from.mockImplementation(() => { throw new Error('Unexpected backend read in isolated realtime test') })
})
afterEach(cleanup)

describe('message realtime delivery', () => {
  it('shows messages sent by the current account from another device', async () => {
    const { client, wrapper } = setup()
    renderHook(() => useGlobalNotifications('me', ['channel-a']), { wrapper })
    await act(async () => { await mocks.insert!({ new: { ...root, id: 'other-device', body: 'From my other device' } }) })
    expect(client.getQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', null])?.pages[0].map(message => message.id)).toEqual(['root', 'other-device'])
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('does not duplicate the sender reply or root count when realtime follows the composer', async () => {
    const { client, wrapper } = setup()
    client.setQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', 'root'], { pages: [[]], pageParams: [null] })
    appendMessage(client, 'channel-a', 'root', reply)
    bumpThreadReplyCount(client, 'channel-a', 'root', reply.id)
    renderHook(() => useGlobalNotifications('me', ['channel-a']), { wrapper })
    await act(async () => { await mocks.insert!({ new: reply }) })
    expect(client.getQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', 'root'])?.pages[0]).toHaveLength(1)
    expect(client.getQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', null])?.pages[0][0].reply_count).toBe(1)
  })

  it('resynchronizes the exact conversation after every successful reconnect', () => {
    const { client, wrapper } = setup()
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
    const { unmount } = renderHook(() => useMessages('channel-a', undefined, 'me'), { wrapper })
    act(() => { mocks.status!('SUBSCRIBED'); mocks.status!('SUBSCRIBED') })
    expect(invalidate).toHaveBeenCalledTimes(2)
    expect(invalidate).toHaveBeenLastCalledWith({ queryKey: ['messages', 'channel-a', null], exact: true })
    unmount()
    expect(mocks.removeChannel).toHaveBeenCalledOnce()
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
