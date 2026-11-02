import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IconRail } from './IconRail'

const mocks = vi.hoisted(() => ({
  closeMobileMenu: vi.fn(),
  push: vi.fn(),
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
  useProfile: () => ({ data: undefined }),
  useUpdateProfile: () => ({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}))

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
  })

  it('opens the messaging workspace instead of the team directory', () => {
    const onOpenSidebar = vi.fn()

    render(<IconRail onOpenSidebar={onOpenSidebar} onCloseSidebar={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Messages' }))

    expect(onOpenSidebar).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith('/messages')
    expect(mocks.push).not.toHaveBeenCalledWith('/people')
  })
})
