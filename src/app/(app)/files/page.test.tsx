import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FilesPage from './page'
import type { MyFile } from '@/hooks/useMyFiles'

const mocks = vi.hoisted(() => ({ files: [] as MyFile[], refetch: vi.fn() }))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/hooks/useMyFiles', () => ({ useMyFiles: () => ({ data: mocks.files, isLoading: false, isError: false, error: null, refetch: mocks.refetch, isFetching: false }) }))
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { id: 'me' } }) }))
vi.mock('@/hooks/useChannels', () => ({ useChannels: () => ({ data: [
  { id: 'announcements', name: 'announcements', type: 'public', archived_at: null },
  { id: 'general', name: 'general', type: 'public', archived_at: null },
] }) }))

describe('Files upload destination', () => {
  beforeEach(() => { mocks.files = []; vi.clearAllMocks() })
  it('requires an explicit destination instead of silently using the first channel', () => {
    render(<FilesPage />)
    expect(screen.getByRole('combobox', { name: 'Upload destination' })).toHaveValue('')
    expect(screen.getByRole('button', { name: /upload/i })).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Select destination…' })).toBeInTheDocument()
  })

  it('offers a retry for unavailable image links without empty image or download URLs', () => {
    mocks.files = [{ id: 'file-1', file_name: 'screenshot.png', mime_type: 'image/png', size_bytes: 12, sender_id: 'me', signed_url: null, message_created_at: '2026-11-09T12:00:00Z' } as MyFile]
    const { container } = render(<FilesPage />)
    expect(screen.getByText('File link unavailable')).toBeInTheDocument()
    expect(container.querySelector('a[href=""]')).toBeNull()
    expect(container.querySelector('img[src=""]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Retry link for screenshot.png' }))
    expect(mocks.refetch).toHaveBeenCalledOnce()
  })

  it('trims the search while keeping a valid download link usable', () => {
    mocks.files = [{ id: 'file-1', file_name: 'Roadmap.pdf', mime_type: 'application/pdf', size_bytes: 12, sender_id: 'me', signed_url: 'https://files.example/roadmap', message_created_at: '2026-11-09T12:00:00Z' } as MyFile]
    render(<FilesPage />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Search files' }), { target: { value: '  ROADMAP  ' } })
    expect(screen.getByText('Roadmap.pdf')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', 'https://files.example/roadmap')
  })
})
