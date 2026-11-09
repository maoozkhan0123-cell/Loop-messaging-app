import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Profile } from '@/types/database'
import { IconRail } from './IconRail'

const mocks = vi.hoisted(() => ({
  closeMobileMenu: vi.fn(),
  push: vi.fn(),
  setPreference: vi.fn(),
  updateProfile: vi.fn(),
  profile: undefined as Profile | undefined,
  preferences: { availability: 'online' as 'online' | 'away' | 'offline', onlineStatus: true },
}))

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span aria-label={alt} />,
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/people',
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/components/AppShell', () => ({
  useMobileNav: () => ({ closeMobileMenu: mocks.closeMobileMenu }),
}))

vi.mock('@/components/PreferencesModal', () => ({
  PreferencesModal: () => null,
}))

vi.mock('@/hooks/useProfile', () => ({
  useProfile: () => ({ data: mocks.profile }),
  useUpdateProfile: () => ({ mutate: mocks.updateProfile, mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ preferences: mocks.preferences, setPreference: mocks.setPreference }) }))

vi.mock('@/hooks/useNotifications', () => ({
  useNotifications: () => ({
    enabled: false,
    permission: 'default',
    toggle: vi.fn(),
  }),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}))

describe('IconRail navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.profile = undefined
    mocks.preferences = { availability: 'online', onlineStatus: true }
  })
  afterEach(cleanup)

  it('opens the messaging workspace instead of the team directory', () => {
    const onOpenSidebar = vi.fn()

    render(<IconRail onOpenSidebar={onOpenSidebar} onCloseSidebar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Messages' }))

    expect(onOpenSidebar).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/messages')
    expect(mocks.push).not.toHaveBeenCalledWith('/people')
  })

  it('persists manual Away so the presence heartbeat does not reset it', () => {
    mocks.profile = { id: 'me', display_name: 'Hanan', email: 'me@bytechsol.com', status: 'online' } as Profile
    render(<IconRail onOpenSidebar={vi.fn()} onCloseSidebar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Hanan/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Set yourself as away' }))
    expect(mocks.setPreference).toHaveBeenCalledWith('availability', 'away')
    expect(mocks.updateProfile).toHaveBeenCalledWith({ status: 'away' })
  })

  it('keeps online visibility private when changing manual availability', () => {
    mocks.preferences = { availability: 'away', onlineStatus: false }
    mocks.profile = { id: 'me', display_name: 'Hanan', email: 'me@bytechsol.com', status: 'offline' } as Profile
    render(<IconRail onOpenSidebar={vi.fn()} onCloseSidebar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Hanan/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Set yourself as active' }))
    expect(mocks.setPreference).toHaveBeenCalledWith('availability', 'online')
    expect(mocks.updateProfile).toHaveBeenCalledWith({ status: 'offline' })
  })
})
