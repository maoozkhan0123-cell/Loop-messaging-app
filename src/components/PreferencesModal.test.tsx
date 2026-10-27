import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PreferencesProvider } from '@/contexts/PreferencesProvider'
import { PreferencesModal } from './PreferencesModal'

describe('PreferencesModal', () => {
  it('opens, navigates categories, and closes accessibly', () => {
    const onOpenChange = vi.fn()
    render(<PreferencesProvider><PreferencesModal open onOpenChange={onOpenChange} /></PreferencesProvider>)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Appearance' }))
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close preferences' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('shows honest backend limitations for security settings', () => {
    render(<PreferencesProvider><PreferencesModal open onOpenChange={() => undefined} /></PreferencesProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Privacy & visibility' }))
    expect(screen.getByText(/no MFA enrollment flow/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Unavailable' })).toHaveLength(3)
  })
})
