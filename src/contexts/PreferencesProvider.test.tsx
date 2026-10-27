import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PreferencesProvider, defaultPreferences, validatePreferences } from './PreferencesProvider'
import { usePreferences } from '@/hooks/usePreferences'

function Harness() {
  const { preferences, setPreference } = usePreferences()
  return <><output data-testid="theme">{preferences.theme}</output><output data-testid="accent">{preferences.accent}</output><button onClick={() => setPreference('theme', 'dark')}>Dark</button><button onClick={() => setPreference('accent', 'emerald')}>Emerald</button></>
}

describe('PreferencesProvider', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); document.documentElement.removeAttribute('data-accent') })

  it('falls back safely when persisted values are invalid', () => {
    expect(validatePreferences(null)).toEqual(defaultPreferences)
    expect(validatePreferences({ theme: 'unknown', density: 42 }).theme).toBe('system')
    expect(validatePreferences({ theme: 'dark', accent: 'emerald' }).accent).toBe('emerald')
  })

  it('applies and persists theme and accent changes', async () => {
    render(<PreferencesProvider><Harness /></PreferencesProvider>)
    await act(async () => screen.getByText('Dark').click())
    await act(async () => screen.getByText('Emerald').click())
    expect(screen.getByTestId('theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
    expect(document.documentElement).toHaveAttribute('data-accent', 'emerald')
    expect(localStorage.getItem('bysync.preferences.v2')).toContain('"theme":"dark"')
  })

  it('restores validated preferences after remount', async () => {
    localStorage.setItem('bysync.preferences.v2', JSON.stringify({ ...defaultPreferences, theme: 'dark', accent: 'slate' }))
    render(<PreferencesProvider><Harness /></PreferencesProvider>)
    expect(await screen.findByText('dark')).toBeInTheDocument()
    expect(screen.getByTestId('accent')).toHaveTextContent('slate')
  })
})
