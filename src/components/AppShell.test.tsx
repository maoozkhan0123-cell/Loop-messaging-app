import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell, useMobileNav } from './AppShell'

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }))
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: undefined }) }))
vi.mock('@/hooks/useChannels', () => ({ useChannels: () => ({ data: [] }) }))
vi.mock('@/hooks/useGlobalNotifications', () => ({ useGlobalNotifications: () => undefined }))
vi.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ hydrated: true, preferences: { availability: 'online', onlineStatus: true } }) }))
vi.mock('@/components/sidebar/IconRail', () => ({ IconRail: () => <button>Home</button> }))
vi.mock('@/components/sidebar/Sidebar', () => ({ Sidebar: () => <button>General channel</button> }))
vi.mock('@/components/ai/AssistantPanel', () => ({ AssistantPanel: () => null }))
vi.mock('@/components/Toolbar', () => ({ Toolbar: () => {
  const { toggleMobileMenu } = useMobileNav()
  return <button onClick={toggleMobileMenu}>Open navigation menu</button>
} }))
afterEach(cleanup)

describe('mobile workspace navigation', () => {
  it('provides a named modal navigation drawer that closes with Escape and restores focus', async () => {
    render(<AppShell><main>Workspace</main></AppShell>)
    const opener = screen.getByRole('button', { name: 'Open navigation menu' })
    opener.focus()
    fireEvent.click(opener)
    expect(screen.getByRole('dialog', { name: 'Workspace navigation' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Workspace navigation' })).not.toBeInTheDocument()
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('closes through its accessible close button', () => {
    render(<AppShell><main>Workspace</main></AppShell>)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation menu' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
