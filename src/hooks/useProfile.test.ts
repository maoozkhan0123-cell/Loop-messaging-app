import { describe, expect, it } from 'vitest'
import { roleDisplayName } from './useProfile'

describe('roleDisplayName', () => {
  it('shows the requested CEO identity instead of an unrelated profile name', () => {
    expect(roleDisplayName('ceo', 'Abdul Hanan')).toBe('Maooz KK')
  })
  it('uses Admin for administrator accounts', () => {
    expect(roleDisplayName('admin', 'Abdul Hanan')).toBe('Admin')
    expect(roleDisplayName('member', 'Abdul Hanan', 'loop@bytechsol.com')).toBe('Admin')
  })
  it('preserves ordinary employee names', () => {
    expect(roleDisplayName('member', 'Sara Khan')).toBe('Sara Khan')
  })
})
