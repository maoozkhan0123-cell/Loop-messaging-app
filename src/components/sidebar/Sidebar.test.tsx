import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ChannelWithMember, Profile } from '@/types/database'
import { Sidebar } from './Sidebar'

const mocks = vi.hoisted(() => ({ channels: [] as ChannelWithMember[], createDM: vi.fn(), createChannel: vi.fn(), push: vi.fn(), closeMobileMenu: vi.fn() }))
const teammate = { id: 'teammate', display_name: 'Sara Ali', email: 'sara@bytechsol.com', avatar_url: null, status: 'online' } as Profile
const profiles = [teammate]
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => '/dm/existing-dm' }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: { children: ReactNode; href: string }) => <a {...props}>{children}</a> }))
vi.mock('@/components/AppShell', () => ({ useMobileNav: () => ({ closeMobileMenu: mocks.closeMobileMenu }) }))
vi.mock('@/hooks/useProfiles', () => ({ useAllProfiles: () => ({ data: profiles }) }))
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: { id: 'me' } }) }))
vi.mock('@/hooks/useChannels', () => ({
  useChannels: () => ({ data: mocks.channels, isLoading: false, error: null }),
  useCreateDM: () => ({ mutateAsync: mocks.createDM }),
  useCreateChannel: () => ({ mutateAsync: mocks.createChannel, isPending: false }),
}))
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); mocks.channels = [] })
afterEach(cleanup)

describe('Sidebar actions', () => {
  it('closes the mobile menu even when opening the current direct message', () => {
    mocks.channels = [{ id: 'existing-dm', type: 'dm', other_member: teammate } as ChannelWithMember]
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /Sara Ali/ }))
    expect(mocks.closeMobileMenu).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/dm/existing-dm')
    expect(mocks.createDM).not.toHaveBeenCalled()
  })

  it('surfaces a failed direct message request without navigating or leaving the button disabled', async () => {
    mocks.createDM.mockRejectedValue(new Error('Could not create the conversation.'))
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: /Sara Ali/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not create the conversation.')
    expect(screen.getByRole('button', { name: /Sara Ali/ })).not.toBeDisabled()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.closeMobileMenu).not.toHaveBeenCalled()
  })

  it('keeps the new channel name when creation fails and offers an explicit submit button', async () => {
    mocks.createChannel.mockRejectedValue(new Error('Channel creation failed.'))
    render(<Sidebar />)
    fireEvent.click(screen.getByRole('button', { name: 'New channel' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Channel name' }), { target: { value: 'Release plans' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create channel' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Channel creation failed.')
    expect(screen.getByRole('textbox', { name: 'Channel name' })).toHaveValue('Release plans')
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
