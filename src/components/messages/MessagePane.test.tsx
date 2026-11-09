import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagePane } from './MessagePane'
import type { ChannelWithMember, Message } from '@/types/database'

const mocks = vi.hoisted(() => ({ files: {} as Record<string, unknown>, refetch: vi.fn() }))
vi.mock('@/hooks/useChannelFiles', () => ({ useChannelFiles: () => mocks.files }))
vi.mock('@/hooks/useTypingIndicator', () => ({ useTypingIndicator: () => ({ typingUsers: [] }) }))
vi.mock('@/hooks/useChannels', () => ({ useMarkRead: () => ({ mutate: vi.fn() }) }))
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ enabled: false, toggle: vi.fn() }) }))
vi.mock('@/components/ai/AssistantPanel', () => ({ openAssistant: vi.fn() }))
vi.mock('./AddChannelMembersDialog', () => ({ AddChannelMembersDialog: () => null }))
vi.mock('./MessageList', () => ({ MessageList: ({ onThreadOpen, channelId }: { onThreadOpen?: (message: Message) => void; channelId: string }) => <button type="button" onClick={() => onThreadOpen?.({ id: 'root', channel_id: channelId } as Message)}>Open a thread</button> }))
vi.mock('./MessageInput', () => ({ MessageInput: () => <div>Message composer</div> }))
vi.mock('@/components/thread/ThreadPanel', () => ({ ThreadPanel: () => <aside aria-label="Current thread">Thread content</aside> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const channel = (id: string): ChannelWithMember => ({ id, type: 'public', name: id, topic: null, created_by: 'me', created_at: '', archived_at: null })
beforeEach(() => { vi.clearAllMocks(); mocks.files = { data: [], isLoading: false, isError: false, error: null, refetch: mocks.refetch } })
afterEach(cleanup)

describe('MessagePane conversations', () => {
  it('closes the old thread and restores Messages when switching conversations', () => {
    const { rerender } = render(<MessagePane channel={channel('first')} currentUserId="me" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open a thread' }))
    expect(screen.getByRole('complementary', { name: 'Current thread' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
    expect(screen.getByText('No files yet')).toBeInTheDocument()
    rerender(<MessagePane channel={channel('second')} currentUserId="me" />)
    expect(screen.queryByRole('complementary', { name: 'Current thread' })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Messages' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Message composer')).toBeInTheDocument()
    expect(screen.queryByText('No files yet')).not.toBeInTheDocument()
  })

  it('shows a retryable files error instead of an empty conversation', () => {
    mocks.files = { isLoading: false, isError: true, error: new Error('Storage is unavailable'), refetch: mocks.refetch }
    render(<MessagePane channel={channel('first')} currentUserId="me" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Storage is unavailable')
    expect(screen.queryByText('No files yet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry files' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })
})
