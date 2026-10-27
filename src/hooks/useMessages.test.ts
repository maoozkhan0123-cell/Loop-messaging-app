import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { bumpThreadReplyCount } from './useMessages'
import type { Message } from '@/types/database'

describe('message cache routing', () => {
  it('increments the root summary without inserting a thread reply into the channel feed', () => {
    const client = new QueryClient()
    const root = { id: 'root-1', channel_id: 'channel-a', reply_count: 0 } as Message
    client.setQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', null], { pages: [[root]], pageParams: [null] })

    bumpThreadReplyCount(client, 'channel-a', 'root-1')

    const cache = client.getQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', null])
    expect(cache?.pages.flat()).toHaveLength(1)
    expect(cache?.pages[0][0].id).toBe('root-1')
    expect(cache?.pages[0][0].reply_count).toBe(1)
  })

  it('does not touch another channel cache', () => {
    const client = new QueryClient()
    const other = { id: 'root-2', channel_id: 'channel-b', reply_count: 2 } as Message
    client.setQueryData<InfiniteData<Message[]>>(['messages', 'channel-b', null], { pages: [[other]], pageParams: [null] })
    bumpThreadReplyCount(client, 'channel-a', 'root-2')
    expect(client.getQueryData<InfiniteData<Message[]>>(['messages', 'channel-b', null])?.pages[0][0].reply_count).toBe(2)
  })
})
