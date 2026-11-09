import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchOverlay } from './SearchOverlay'

const mocks = vi.hoisted(() => ({ search: vi.fn(), push: vi.fn(), refetch: vi.fn() }))
vi.mock('@/hooks/useSearch', () => ({ useSearch: (query: string) => mocks.search(query) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.search.mockReturnValue({ data: [], isFetching: false, error: null, refetch: mocks.refetch })
})
afterEach(cleanup)
function open() {
  render(<SearchOverlay />)
  act(() => { window.dispatchEvent(new Event('open-global-search')) })
  return screen.getByRole('searchbox', { name: 'Search workspace messages' })
}

describe('message search feedback', () => {
  it('explains the minimum query length and provides a named close action', () => {
    const input = open()
    fireEvent.change(input, { target: { value: 'a' } })
    expect(screen.getByText('Type at least 2 characters to search')).toBeInTheDocument()
    expect(screen.queryByText(/No results for/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('debounces and trims the submitted query instead of searching every keystroke', async () => {
    const input = open()
    fireEvent.change(input, { target: { value: '  release  ' } })
    expect(screen.getByText('Searching...')).toBeInTheDocument()
    expect(mocks.search).not.toHaveBeenCalledWith('release')
    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith('release'))
    expect(screen.getByText(/No results for/)).toBeInTheDocument()
  })

  it('shows a retryable failure instead of a misleading empty result', async () => {
    mocks.search.mockImplementation((query: string) => ({ data: [], isFetching: false, error: query ? new Error('Offline') : null, refetch: mocks.refetch }))
    const input = open()
    fireEvent.change(input, { target: { value: 'release' } })
    await screen.findByRole('alert')
    expect(screen.queryByText(/No results for/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })
})
