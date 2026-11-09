import { createElement, type PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDashboard } from './useDashboard'

const mocks = vi.hoisted(() => ({
  auth: { getSession: vi.fn() }, from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(),
}))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => mocks }))

const listeners = new Map<string, () => void>()
let assignments: Array<{ task_id: string; user_id: string }> = []
let assignmentError: { code: string; message: string } | null = null
let primaryAssignee = 'other-member'

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client: queryClient }, children)
  return renderHook(() => useDashboard(), { wrapper })
}

describe('useDashboard assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listeners.clear()
    assignments = []
    assignmentError = null
    primaryAssignee = 'other-member'
    mocks.auth.getSession.mockResolvedValue({ data: { session: { user: { id: 'me' } } } })
    mocks.from.mockImplementation((table: string) => {
      const result = () => ({
        data: table === 'project_task_assignees' ? assignments
          : table === 'project_boards' ? [{ id: 'board-1' }]
          : table === 'project_tasks' ? [{ id: 'task-1', board_id: 'board-1', assignee_id: primaryAssignee }]
          : [],
        error: table === 'project_task_assignees' ? assignmentError : null,
      })
      const chain = {
        select: () => chain, is: () => chain, order: () => chain,
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
      }
      return chain
    })
    const channel = {
      on: (_event: string, filter: { table: string }, callback: () => void) => { listeners.set(filter.table, callback); return channel },
      subscribe: () => channel,
    }
    mocks.channel.mockReturnValue(channel)
    mocks.removeChannel.mockResolvedValue('ok')
  })

  it('refreshes secondary assignments after another member updates the task', async () => {
    const { result, unmount } = renderDashboard()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    await waitFor(() => expect(listeners.has('project_task_assignees')).toBe(true))
    expect(result.current.data?.myTaskIds.has('task-1')).toBe(false)

    assignments = [{ task_id: 'task-1', user_id: 'me' }, { task_id: 'task-1', user_id: 'other-member' }]
    await act(async () => { listeners.get('project_task_assignees')?.() })
    await waitFor(() => expect(result.current.data?.myTaskIds.has('task-1')).toBe(true))
    expect(result.current.data?.tasks[0].assignee_ids).toEqual(['other-member', 'me'])
    unmount()
    expect(mocks.removeChannel).toHaveBeenCalledOnce()
  })

  it.each(['42P01', 'PGRST205'])('keeps primary assignments readable before the assignment migration (%s)', async (code) => {
    primaryAssignee = 'me'
    assignmentError = { code, message: 'Assignee table is missing' }
    const { result, unmount } = renderDashboard()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.myTaskIds.has('task-1')).toBe(true)
    unmount()
  })

  it('surfaces assignment permission failures instead of showing an incomplete task list', async () => {
    assignmentError = { code: '42501', message: 'Permission denied' }
    const { result, unmount } = renderDashboard()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ code: '42501' })
    unmount()
  })
})
