import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePage from './page'

const mocks = vi.hoisted(() => ({
  profile: { id: 'me', display_name: 'Maooz', job_title: 'Engineer', status: 'online', avatar_url: null, email: 'maooz@bytechsol.com' },
  preferences: { availability: 'online', onlineStatus: true },
  update: vi.fn(), setPreference: vi.fn(), toast: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), back: vi.fn() }) }))
vi.mock('@/hooks/useProfile', () => ({ useProfile: () => ({ data: mocks.profile, isLoading: false }), useUpdateProfile: () => ({ mutateAsync: mocks.update }) }))
vi.mock('@/hooks/usePreferences', () => ({ usePreferences: () => ({ preferences: mocks.preferences, hydrated: true, setPreference: mocks.setPreference }) }))
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({}) }))
vi.mock('@/hooks/useNotifications', () => ({ useNotifications: () => ({ enabled: false, permission: 'default', toggle: vi.fn() }) }))
vi.mock('@/components/ui/Toaster', () => ({ useToast: () => ({ toast: mocks.toast }) }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.profile = { ...mocks.profile, display_name: 'Maooz', status: 'online' }
  mocks.preferences = { availability: 'online', onlineStatus: true }
  mocks.update.mockResolvedValue({})
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('profile availability and draft safety', () => {
  it('persists a manual Away choice so the heartbeat respects it', async () => {
    render(<ProfilePage />)
    fireEvent.click(screen.getByRole('button', { name: /^away$/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'away' })))
    await waitFor(() => expect(mocks.setPreference).toHaveBeenCalledWith('availability', 'away'))
  })

  it('keeps published status offline when activity visibility is disabled', async () => {
    mocks.preferences.onlineStatus = false
    mocks.profile.status = 'offline'
    render(<ProfilePage />)
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'offline' })))
    await waitFor(() => expect(mocks.setPreference).toHaveBeenCalledWith('availability', 'online'))
  })

  it('preserves unsaved text when presence refreshes the same profile', () => {
    const { rerender } = render(<ProfilePage />)
    fireEvent.change(screen.getByDisplayValue('Maooz'), { target: { value: 'Draft name' } })
    mocks.profile = { ...mocks.profile, status: 'away' }
    rerender(<ProfilePage />)
    expect(screen.getByDisplayValue('Draft name')).toBeInTheDocument()
  })
})
