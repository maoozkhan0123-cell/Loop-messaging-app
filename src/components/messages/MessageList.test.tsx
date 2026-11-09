import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageList } from './MessageList'
import type { Message } from '@/types/database'

const mocks = vi.hoisted(() => ({ result: {} as Record<string, unknown>, fetchNextPage: vi.fn() }))
vi.mock('@/hooks/useMessages', () => ({ useMessages: () => mocks.result }))
vi.mock('./Message', () => ({ Message: ({ message }: { message: Message }) => <article>{message.body}</article> }))

const message = (id: string, date: string) => ({ id, body: id, user_id: 'me', created_at: date })
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  mocks.fetchNextPage.mockResolvedValue(undefined)
  mocks.result = {
    data: { pages: [[message('Recent one', '2026-11-09T12:00:00Z'), message('Recent two', '2026-11-09T13:00:00Z')], [message('Old one', '2026-11-08T12:00:00Z'), message('Old two', '2026-11-08T13:00:00Z')]] },
    isLoading: false, isError: false, hasNextPage: true, isFetchingNextPage: false, fetchNextPage: mocks.fetchNextPage,
  }
})
afterEach(cleanup)

describe('MessageList history', () => {
  it('shows older pages above recent messages without reversing individual page order', () => {
    render(<MessageList channelId="channel" currentUserId="me" />)
    expect(screen.getAllByRole('article').map(item => item.textContent)).toEqual(['Old one', 'Old two', 'Recent one', 'Recent two'])
  })

  it('preserves the reading offset when older history is prepended', async () => {
    render(<MessageList channelId="channel" currentUserId="me" />)
    const log = screen.getByRole('log', { name: 'Conversation messages' })
    let height = 1000
    Object.defineProperty(log, 'scrollHeight', { configurable: true, get: () => height })
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 300 })
    log.scrollTop = 60
    mocks.fetchNextPage.mockImplementation(async () => { height = 1500 })
    fireEvent.scroll(log)
    await waitFor(() => expect(log.scrollTop).toBe(560))
    expect(mocks.fetchNextPage).toHaveBeenCalledOnce()
  })
})
