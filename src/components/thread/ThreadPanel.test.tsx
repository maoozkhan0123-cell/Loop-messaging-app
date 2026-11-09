import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThreadPanel } from './ThreadPanel'
import type { Message } from '@/types/database'

vi.mock('@/components/messages/Message', () => ({ Message: ({ message }: { message: Message }) => <article>{message.body}</article> }))
vi.mock('@/components/messages/MessageList', () => ({ MessageList: () => null }))
vi.mock('@/components/messages/MessageInput', () => ({ MessageInput: () => null }))
afterEach(cleanup)

describe('ThreadPanel', () => {
  it('follows root message edits and reply counts from the conversation cache', () => {
    const client = new QueryClient()
    const root = { id: 'root', channel_id: 'channel', body: 'Original', reply_count: 0 } as Message
    client.setQueryData<InfiniteData<Message[]>>(['messages', 'channel', null], { pages: [[root]], pageParams: [null] })
    const onClose = vi.fn()
    render(<QueryClientProvider client={client}><ThreadPanel channelId="channel" currentUserId="me" message={root} onClose={onClose} /></QueryClientProvider>)
    act(() => client.setQueryData<InfiniteData<Message[]>>(['messages', 'channel', null], { pages: [[{ ...root, body: 'Updated', reply_count: 2 }]], pageParams: [null] }))
    expect(screen.getByRole('article')).toHaveTextContent('Updated')
    expect(screen.getByText('2 replies')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close thread' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
