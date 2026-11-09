import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { appendAttachment, appendMessage, applyReaction, bumpThreadReplyCount, updateMessage } from './useMessages'
import type { Message } from '@/types/database'

describe('message cache routing', () => {
  it('keeps new messages on the latest page after older history has loaded and deduplicates delivery', () => {
    const client = new QueryClient()
    const latest = { id: 'latest' } as Message
    const oldest = { id: 'oldest' } as Message
    const incoming = { id: 'incoming' } as Message
    client.setQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', null], { pages: [[latest], [oldest]], pageParams: [null, 'cursor'] })
    appendMessage(client, 'channel-a', null, incoming)
    appendMessage(client, 'channel-a', null, incoming)
    const cache = client.getQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', null])
    expect(cache?.pages.map(page => page.map(message => message.id))).toEqual([['latest', 'incoming'], ['oldest']])
    expect(cache?.pageParams).toEqual([null, 'cursor'])
  })

  it('routes thread reactions, attachments and edits to the cached reply without altering another channel', () => {
    const client = new QueryClient()
    const reply = { id: 'reply', body: 'Original', reactions: [], attachments: [] } as unknown as Message
    const key = ['messages', 'channel-a', 'root-1']
    client.setQueryData<InfiniteData<Message[]>>(key, { pages: [[reply]], pageParams: [null] })
    client.setQueryData<InfiniteData<Message[]>>(['messages', 'channel-b', 'root-2'], { pages: [[reply]], pageParams: [null] })
    const reaction = { message_id: 'reply', user_id: 'teammate', emoji: '👍' }
    applyReaction(client, 'channel-a', reaction, 'INSERT')
    applyReaction(client, 'channel-a', reaction, 'INSERT')
    appendAttachment(client, 'channel-a', { id: 'attachment', message_id: 'reply', file_name: 'notes.pdf' })
    appendAttachment(client, 'channel-a', { id: 'attachment', message_id: 'reply', file_name: 'notes.pdf' })
    updateMessage(client, 'channel-a', { id: 'reply', body: 'Edited', deleted_at: '2026-11-09T12:00:00Z' })
    const result = client.getQueryData<InfiniteData<Message[]>>(key)?.pages[0][0]
    expect(result?.body).toBe('Edited')
    expect(result?.deleted_at).toBeTruthy()
    expect(result?.reactions).toEqual([reaction])
    expect(result?.attachments).toHaveLength(1)
    applyReaction(client, 'channel-a', reaction, 'DELETE')
    expect(client.getQueryData<InfiniteData<Message[]>>(key)?.pages[0][0].reactions).toEqual([])
    expect(client.getQueryData<InfiniteData<Message[]>>(['messages', 'channel-b', 'root-2'])?.pages[0][0]).toEqual(reply)
  })

  it('counts the same reply only once when both the composer and realtime receive it', () => {
    const client = new QueryClient()
    client.setQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', null], { pages: [[{ id: 'root', reply_count: 0 } as Message]], pageParams: [null] })
    bumpThreadReplyCount(client, 'channel-a', 'root', 'reply-1')
    bumpThreadReplyCount(client, 'channel-a', 'root', 'reply-1')
    bumpThreadReplyCount(client, 'channel-a', 'root', 'reply-2')
    expect(client.getQueryData<InfiniteData<Message[]>>(['messages', 'channel-a', null])?.pages[0][0].reply_count).toBe(2)
  })

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
