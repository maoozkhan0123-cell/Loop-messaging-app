import { createElement, type PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSignedAttachmentUrl } from './useSignedAttachmentUrl'
import { useChannelFiles } from './useChannelFiles'

const mocks = vi.hoisted(() => ({ from: vi.fn(), createSignedUrl: vi.fn(), createSignedUrls: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ from: mocks.from, storage: { from: () => mocks } }) }))

function setupClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0, refetchOnMount: false, refetchOnWindowFocus: false } } })
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children)
  return { client, wrapper }
}

describe('secure attachment links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://files.example/new' }, error: null })
    mocks.createSignedUrls.mockResolvedValue({ data: [], error: null })
    mocks.from.mockImplementation(() => {
      const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => Promise.resolve({ data: [{ id: 'file-1', object_key: 'photo.png' }], error: null }) }
      return chain
    })
  })
  afterEach(() => { focusManager.setFocused(undefined); vi.restoreAllMocks() })

  it('replaces an expired cached URL when an attachment remounts', async () => {
    const { client, wrapper } = setupClient()
    client.setQueryData(['attachment-url', 'photo.png'], 'https://files.example/expired', { updatedAt: Date.now() - 61 * 60 * 1000 })
    const { result } = renderHook(() => useSignedAttachmentUrl('photo.png'), { wrapper })
    await waitFor(() => expect(result.current.data).toBe('https://files.example/new'))
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('photo.png', 3600)
  })

  it('refreshes a continuously mounted attachment before its one-hour URL expires', async () => {
    focusManager.setFocused(true)
    const interval = vi.spyOn(globalThis, 'setInterval')
    const { wrapper } = setupClient()
    const { result, unmount } = renderHook(() => useSignedAttachmentUrl('photo.png'), { wrapper })
    await waitFor(() => expect(result.current.data).toBe('https://files.example/new'))
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 50 * 60 * 1000)
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://files.example/renewed' }, error: null })
    // Trigger the scheduled renewal without making the test wait fifty minutes.
    const renew = interval.mock.calls.filter(([, delay]) => delay === 50 * 60 * 1000).at(-1)?.[0]
    if (typeof renew !== 'function') throw new Error('The attachment renewal was not scheduled')
    expect(focusManager.isFocused()).toBe(true)
    await act(async () => { renew() })
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(result.current.data).toBe('https://files.example/renewed'))
    unmount()
  })

  it('surfaces batch signing failures rather than returning apparently usable channel files', async () => {
    mocks.createSignedUrls.mockResolvedValue({ data: null, error: { message: 'Storage unavailable' } })
    const { wrapper } = setupClient()
    const { result } = renderHook(() => useChannelFiles('general'), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('Storage unavailable')
    expect(result.current.data).toBeUndefined()
  })

  it('does not fetch channel attachments before a channel is selected', () => {
    const { wrapper } = setupClient()
    renderHook(() => useChannelFiles(''), { wrapper })
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
