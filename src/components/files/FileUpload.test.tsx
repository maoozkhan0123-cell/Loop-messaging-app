import { createElement, type PropsWithChildren } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileUpload } from './FileUpload'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), insert: vi.fn(), upload: vi.fn(), remove: vi.fn() }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc, from: () => ({ insert: mocks.insert }), storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) } }) }))

describe('file upload completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'me' } } })
    mocks.rpc.mockResolvedValue({ data: 'message-1', error: null })
    mocks.insert.mockResolvedValue({ error: null })
    mocks.upload.mockResolvedValue({ error: null })
  })

  it('keeps an active upload open and refreshes both file lists after success', async () => {
    let finishAuthentication!: (value: { data: { user: { id: string } } }) => void
    mocks.getUser.mockReturnValue(new Promise(resolve => { finishAuthentication = resolve }))
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children)
    const onClose = vi.fn(); const onComplete = vi.fn(); const onBusyChange = vi.fn()
    render(<FileUpload channelId="general" destinationLabel="# general" files={[new window.File(['hello'], 'notes.txt', { type: 'text/plain' })]} onClose={onClose} onComplete={onComplete} onBusyChange={onBusyChange} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(screen.getByRole('button', { name: 'Close upload' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Close upload' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(onBusyChange).toHaveBeenCalledWith(true)
    await act(async () => { finishAuthentication({ data: { user: { id: 'me' } } }) })
    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce())
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['my-files'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['channel-files', 'general'] })
    expect(onBusyChange).toHaveBeenLastCalledWith(false)
  })
})
