import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FilesPage from './page'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useMyFiles', () => ({ useMyFiles: () => ({ data: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false }) }))
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { id: 'me' } }) }))
vi.mock('@/hooks/useChannels', () => ({ useChannels: () => ({ data: [
  { id: 'announcements', name: 'announcements', type: 'public', archived_at: null },
  { id: 'general', name: 'general', type: 'public', archived_at: null },
] }) }))

describe('Files upload destination', () => {
  it('requires an explicit destination instead of silently using the first channel', () => {
    render(<FilesPage />)
    expect(screen.getByRole('combobox', { name: 'Upload destination' })).toHaveValue('')
    expect(screen.getByRole('button', { name: /upload/i })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Select destination…' })).toBeInTheDocument()
  })
})
