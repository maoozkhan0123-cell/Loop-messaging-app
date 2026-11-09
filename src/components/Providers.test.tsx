import { cleanup, render } from '@testing-library/react'
import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from './Providers'

const mocks = vi.hoisted(() => ({ onAuthStateChange: vi.fn(), unsubscribe: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: mocks }) }))
vi.mock('@/contexts/PreferencesProvider', () => ({ PreferencesProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('@tanstack/react-query-devtools', () => ({ ReactQueryDevtools: () => null }))

let client: QueryClient
let notify: (event: string, session: { user: { id: string } } | null) => void
function Probe() {
  const active = useQueryClient()
  useEffect(() => { client = active }, [active])
  return null
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.onAuthStateChange.mockImplementation(callback => {
    notify = callback
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } }
  })
})
afterEach(cleanup)

describe('workspace cache lifecycle', () => {
  it('clears cached private data when the signed-in identity changes', () => {
    render(<Providers><Probe /></Providers>)
    notify('INITIAL_SESSION', { user: { id: 'alice' } })
    client.setQueryData(['my-files'], ['alice-private-file'])
    client.setQueryData(['profile'], { id: 'alice' })
    notify('SIGNED_IN', { user: { id: 'bob' } })
    expect(client.getQueryData(['my-files'])).toBeUndefined()
    expect(client.getQueryData(['profile'])).toBeUndefined()
  })

  it('clears cached data on sign-out, including before the first session event', () => {
    render(<Providers><Probe /></Providers>)
    client.setQueryData(['messages', 'private-channel'], ['private-message'])
    notify('SIGNED_OUT', null)
    expect(client.getQueryCache().getAll()).toHaveLength(0)
  })

  it('retains the same user cache during token refresh and unsubscribes on unmount', () => {
    const { unmount } = render(<Providers><Probe /></Providers>)
    notify('INITIAL_SESSION', { user: { id: 'alice' } })
    client.setQueryData(['channels'], ['general'])
    notify('TOKEN_REFRESHED', { user: { id: 'alice' } })
    expect(client.getQueryData(['channels'])).toEqual(['general'])
    expect(client.getDefaultOptions().queries).toMatchObject({ refetchOnMount: true, refetchOnWindowFocus: true })
    unmount()
    expect(mocks.unsubscribe).toHaveBeenCalledOnce()
  })
})
