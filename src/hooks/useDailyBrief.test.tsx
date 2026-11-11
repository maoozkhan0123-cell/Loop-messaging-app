import { createElement, type PropsWithChildren } from 'react'
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDailyBrief } from './useDailyBrief'
import { defaultPreferences, PreferencesContext } from '@/contexts/PreferencesProvider'
import type { DailyBrief, DailyBriefLanguage } from '@/types/dailyBrief'

const fetchMock = vi.fn()
let timeZone = 'UTC'
let selectedTimeZone = 'auto'

function brief(overrides: Partial<DailyBrief> = {}): DailyBrief {
  return {
    day: '2026-11-11', timeZone: 'UTC', generatedAt: '2026-11-11T12:00:00.000Z',
    overview: 'Review the launch task, then catch up on project updates.', summarySource: 'ai',
    priorities: [{ id: 'task-1', title: 'Review launch', detail: 'Due today', href: '/projects?board=board-1&task=task-1', kind: 'task' }],
    discussions: [], counts: { overdue: 0, dueToday: 1, upcoming: 2, unreadChannels: 0 },
    ...overrides,
  }
}

function response(payload: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

function setupClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 3, refetchOnMount: 'always', refetchOnWindowFocus: 'always' } } })
  const wrapper = ({ children }: PropsWithChildren) => createElement(PreferencesContext.Provider, {
    value: { preferences: { ...defaultPreferences, timezone: selectedTimeZone }, hydrated: true, setPreference: vi.fn(), resetPreferences: vi.fn() },
  }, createElement(QueryClientProvider, { client }, children))
  return { client, wrapper }
}

describe('explicit daily brief generation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T12:00:00.000Z'))
    timeZone = 'UTC'
    selectedTimeZone = 'auto'
    const resolved = Intl.DateTimeFormat().resolvedOptions()
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => ({ ...resolved, timeZone }))
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => response(brief()))
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

  it('does not generate on mount, focus, reconnect, or cache invalidation', async () => {
    const { client, wrapper } = setupClient()
    renderHook(() => useDailyBrief('user-1'), { wrapper })
    await act(async () => {
      fireEvent(window, new Event('focus'))
      fireEvent(window, new Event('online'))
      await client.invalidateQueries({ queryKey: ['daily-brief'] })
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts the local day and language only on request and reuses the brief after navigation', async () => {
    const { wrapper } = setupClient()
    const first = renderHook(() => useDailyBrief('user-1'), { wrapper })
    await act(async () => { await first.result.current.generate() })
    await waitFor(() => expect(first.result.current.data?.overview).toContain('Review the launch'))
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/daily-brief', expect.objectContaining({
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      body: JSON.stringify({ day: '2026-11-11', timeZone: 'UTC', language: 'english' }),
    }))
    first.unmount()
    const next = renderHook(() => useDailyBrief('user-1'), { wrapper })
    expect(next.result.current.data?.overview).toContain('Review the launch')
    await act(async () => { fireEvent(window, new Event('focus')) })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('joins simultaneous refreshes of the same cached brief', async () => {
    const { wrapper } = setupClient()
    const first = renderHook(() => useDailyBrief('user-1'), { wrapper })
    const second = renderHook(() => useDailyBrief('user-1'), { wrapper })
    await act(async () => { await first.result.current.generate() })
    await waitFor(() => expect(second.result.current.data?.overview).toContain('Review the launch'))
    let finish!: (value: Response) => void
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve }))
    act(() => { void first.result.current.generate(); void second.result.current.generate() })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { finish(response(brief({ overview: 'A refreshed plan.' }))) })
    await waitFor(() => expect(second.result.current.data?.overview).toBe('A refreshed plan.'))
  })

  it('isolates cached content by user and selected language without generating on a switch', async () => {
    const { wrapper } = setupClient()
    const { result, rerender } = renderHook(({ userId, language }) => useDailyBrief(userId, language), { wrapper, initialProps: { userId: 'user-1', language: 'english' as DailyBriefLanguage } })
    await act(async () => { await result.current.generate() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    rerender({ userId: 'user-2', language: 'english' })
    expect(result.current.data).toBeUndefined()
    rerender({ userId: 'user-1', language: 'roman_urdu' })
    expect(result.current.data).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledOnce()
    fetchMock.mockImplementationOnce(async () => response(brief({ overview: 'Aaj launch ka task review karein.' })))
    await act(async () => { await result.current.generate() })
    await waitFor(() => expect(result.current.data?.overview).toContain('Aaj launch'))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ language: 'roman_urdu' })
    rerender({ userId: 'user-1', language: 'english' })
    expect(result.current.data?.overview).toContain('Review the launch')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('changes the cache at local midnight and timezone changes without an automatic request', async () => {
    timeZone = 'Asia/Karachi'
    vi.setSystemTime(new Date('2026-11-11T18:59:00.000Z'))
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const input = JSON.parse(String(init.body))
      return response(brief({ day: input.day, timeZone: input.timeZone }))
    })
    const { wrapper } = setupClient()
    const { result } = renderHook(() => useDailyBrief('user-1'), { wrapper })
    await act(async () => { await result.current.generate() })
    await waitFor(() => expect(result.current.data?.day).toBe('2026-11-11'))
    vi.setSystemTime(new Date('2026-11-11T19:01:00.000Z'))
    act(() => { fireEvent(window, new Event('focus')) })
    expect(result.current.day).toBe('2026-11-12')
    expect(result.current.data).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledOnce()
    await act(async () => { await result.current.generate() })
    await waitFor(() => expect(result.current.data?.day).toBe('2026-11-12'))
    timeZone = 'America/Los_Angeles'
    act(() => { fireEvent(window, new Event('focus')) })
    expect(result.current.timeZone).toBe('America/Los_Angeles')
    expect(result.current.day).toBe('2026-11-11')
    expect(result.current.data).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses the selected timezone preference and immediately switches day/cache when that preference changes', async () => {
    selectedTimeZone = 'Asia/Karachi'
    vi.setSystemTime(new Date('2026-11-11T23:30:00.000Z'))
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
      const input = JSON.parse(String(init.body))
      return response(brief({ day: input.day, timeZone: input.timeZone }))
    })
    const { wrapper } = setupClient()
    const { result, rerender } = renderHook(() => useDailyBrief('user-1'), { wrapper })
    expect(result.current.timeZone).toBe('Asia/Karachi')
    expect(result.current.day).toBe('2026-11-12')
    await act(async () => { await result.current.generate() })
    await waitFor(() => expect(result.current.data?.timeZone).toBe('Asia/Karachi'))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ day: '2026-11-12', timeZone: 'Asia/Karachi' })
    selectedTimeZone = 'America/Los_Angeles'
    rerender()
    expect(result.current.timeZone).toBe('America/Los_Angeles')
    expect(result.current.day).toBe('2026-11-11')
    expect(result.current.data).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledOnce()
    selectedTimeZone = 'Asia/Karachi'
    rerender()
    expect(result.current.data?.timeZone).toBe('Asia/Karachi')
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('falls back to the browser zone when a saved timezone is unsupported', () => {
    selectedTimeZone = 'Unsupported/Timezone'
    const { wrapper } = setupClient()
    const { result } = renderHook(() => useDailyBrief('user-1'), { wrapper })
    expect(result.current.timeZone).toBe('UTC')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('preserves an existing brief after a rate limit and retries only when requested', async () => {
    const { wrapper } = setupClient()
    const { result } = renderHook(() => useDailyBrief('user-1'), { wrapper })
    await act(async () => { await result.current.generate() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    fetchMock.mockImplementationOnce(async () => response({ error: 'Please wait before refreshing.' }, 429, { 'Retry-After': '45' }))
    await act(async () => { await result.current.generate() })
    await waitFor(() => expect(result.current.error?.status).toBe(429))
    expect(result.current.error?.retryAfterSeconds).toBe(45)
    expect(result.current.data?.overview).toContain('Review the launch')
    await act(async () => { fireEvent(window, new Event('focus')) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await act(async () => { await result.current.generate() })
    await waitFor(() => expect(result.current.error).toBeNull())
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('cancels an in-flight generation when the authentication cache is cleared', async () => {
    let activeSignal: AbortSignal | undefined
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      activeSignal = init.signal as AbortSignal
      activeSignal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
    }))
    const { client, wrapper } = setupClient()
    const { result } = renderHook(() => useDailyBrief('user-1'), { wrapper })
    act(() => { void result.current.generate() })
    expect(activeSignal?.aborted).toBe(false)
    await act(async () => { client.clear() })
    expect(activeSignal?.aborted).toBe(true)
    expect(client.getQueryData(['daily-brief', 'user-1', '2026-11-11', 'UTC', 'english'])).toBeUndefined()
  })

  it('rejects malformed or external source links instead of displaying ungrounded navigation', async () => {
    fetchMock.mockImplementationOnce(async () => response(brief({ priorities: [{ id: 'bad', title: 'Unexpected link', detail: '', kind: 'task', href: '//external.example/task' }] })))
    const { wrapper } = setupClient()
    const { result } = renderHook(() => useDailyBrief('user-1'), { wrapper })
    await act(async () => { await result.current.generate() })
    await waitFor(() => expect(result.current.error?.message).toContain('could not be read'))
    expect(result.current.data).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
