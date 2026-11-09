import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from './CommandPalette'

const push = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/hooks/useChannels', () => ({ useChannels: () => ({ data: [] }) }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function open() {
  render(<CommandPalette />)
  act(() => { window.dispatchEvent(new Event('open-search')) })
  return screen.getByRole('combobox')
}

describe('workspace commands', () => {
  it('keeps Preferences searchable even when no navigation page matches', () => {
    const input = open()
    fireEvent.change(input, { target: { value: 'preferences' } })
    expect(screen.getByRole('option', { name: /Open Preferences/ })).toBeInTheDocument()
  })

  it('keeps message search available independently of page matches', () => {
    const input = open()
    fireEvent.change(input, { target: { value: 'search' } })
    expect(screen.getByRole('option', { name: /Search messages/ })).toBeInTheDocument()
  })

  it('provides a direct Messages navigation command', () => {
    open()
    fireEvent.click(screen.getByRole('option', { name: 'Messages' }))
    expect(push).toHaveBeenCalledWith('/messages')
  })
})
