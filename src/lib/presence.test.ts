import { describe, expect, it } from 'vitest'
import { resolvePresenceStatus } from './presence'

describe('presence preferences', () => {
  it('keeps an offline or hidden presence offline even in a visible tab', () => {
    expect(resolvePresenceStatus('offline', true, false)).toBe('offline')
    expect(resolvePresenceStatus('online', false, false)).toBe('offline')
    expect(resolvePresenceStatus('away', false, true)).toBe('offline')
  })
  it('preserves manual Away and follows visibility only for automatic Active status', () => {
    expect(resolvePresenceStatus('away', true, false)).toBe('away')
    expect(resolvePresenceStatus('online', true, true)).toBe('away')
    expect(resolvePresenceStatus('online', true, false)).toBe('online')
  })
})
