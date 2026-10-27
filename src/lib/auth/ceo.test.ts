import { describe, expect, it } from 'vitest'
import { isCEORole } from './ceo'

describe('CEO authorization role', () => {
  it('accepts only the trusted CEO role value', () => {
    expect(isCEORole('ceo')).toBe(true)
    expect(isCEORole('CEO')).toBe(true)
    expect(isCEORole('admin')).toBe(false)
    expect(isCEORole('member')).toBe(false)
    expect(isCEORole(undefined)).toBe(false)
  })

  it('does not treat truthy client-like values as authorization', () => {
    expect(isCEORole(true)).toBe(false)
    expect(isCEORole({ role: 'ceo' })).toBe(false)
  })
})
