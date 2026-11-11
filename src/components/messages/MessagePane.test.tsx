import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessagePane } from './MessagePane'
import type { ChannelWithMember, Message } from '@/types/database'

const mocks = vi.hoisted(() => ({ files: {} as Record<string, unknown>, refetch: vi.fn(), link: {} as Record<string, unknown>, search: '', replace: vi.fn() }))
vi.mock('@/hooks/useChannelFiles', () => ({ useChannelFiles: () => mocks.files }))
vi.mock('@/hooks/useTypingIndicator', () => ({ useTypingIndicator: () => ({ typingUsers: [] }) }))
vi.mock('@/hooks/useChannels', () => ({ useMarkRead: () => ({ mutate: vi.fn() }) }))
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ enabled: false, toggle: vi.fn() }) }))
vi.mock('@/components/ai/AssistantPanel', () => ({ openAssistant: vi.fn() }))
vi.mock('@/hooks/useMessageLink', () => ({ useMessageLink: () => mocks.link }))
vi.mock('@/components/tasks/CreateMessageTaskDialog', () => ({ CreateMessageTaskDialog: ({ message }: { message: Message }) => <aside aria-label="Task review">{message.id}</aside> }))
vi.mock('./AddChannelMembersDialog', () => ({ AddChannelMembersDialog: () => null }))
vi.mock('./MessageList', () => ({ MessageList: ({ onThreadOpen, onCreateTask, channelId, linkedContext }: { onThreadOpen?: (message: Message) => void; onCreateTask?: (message: Message) => void; channelId: string; linkedContext?: Message[] }) => <div><button type="button" onClick={() => onThreadOpen?.({ id: 'root', channel_id: channelId } as Message)}>Open a thread</button><button type="button" onClick={() => onCreateTask?.({ id: 'source', channel_id: channelId } as Message)}>Create message task</button><span data-testid="linked-context">{linkedContext?.map((message) => message.id).join(',')}</span></div> }))
vi.mock('./MessageInput', () => ({ MessageInput: () => <div>Message composer</div> }))
vi.mock('@/components/thread/ThreadPanel', () => ({ ThreadPanel: ({ highlightMessageId }: { highlightMessageId?: string }) => <aside aria-label="Current thread">Thread content <span>{highlightMessageId}</span></aside> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: mocks.replace }), useSearchParams: () => new URLSearchParams(mocks.search) }))

const channel = (id: string): ChannelWithMember => ({ id, type: 'public', name: id, topic: null, created_by: 'me', created_at: '', archived_at: null })
beforeEach(() => { vi.clearAllMocks(); mocks.files = { data: [], isLoading: false, isError: false, error: null, refetch: mocks.refetch }; mocks.link = {}; mocks.search = '' })
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

  it('opens review for the chosen message without creating work automatically', () => {
    render(<MessagePane channel={channel('first')} currentUserId="me" />)
    expect(screen.queryByRole('complementary', { name: 'Task review' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create message task' }))
    expect(screen.getByRole('complementary', { name: 'Task review' })).toHaveTextContent('source')
  })

  it('opens a linked old reply in its thread and preserves other query parameters when leaving context', async () => {
    mocks.search = 'message=reply&other=value'
    const root = { id: 'old-root', channel_id: 'first', parent_id: null } as Message
    const reply = { id: 'reply', channel_id: 'first', parent_id: 'old-root' } as Message
    mocks.link = { data: { root, target: reply, rootContext: [root], replyContext: [reply] } }
    const { rerender } = render(<MessagePane channel={channel('first')} currentUserId="me" />)
    expect(screen.getByTestId('linked-context')).toHaveTextContent('old-root')
    expect(screen.getByRole('complementary', { name: 'Current thread' })).toHaveTextContent('reply')
    fireEvent.click(screen.getByRole('button', { name: 'Back to latest' }))
    expect(mocks.replace).toHaveBeenCalledWith('/channel/first?other=value', { scroll: false })
    mocks.search = 'other=value'
    mocks.link = {}
    rerender(<MessagePane channel={channel('first')} currentUserId="me" />)
    expect(screen.getByTestId('linked-context')).toBeEmptyDOMElement()
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Current thread' })).not.toBeInTheDocument())
  })
})
