import { describe, expect, it } from 'vitest'
import { roleDisplayName } from './useProfile'

describe('roleDisplayName', () => {
  it('preserves the real name of the CEO and administrators', () => {
    expect(roleDisplayName('ceo', 'Abdul Hanan')).toBe('Abdul Hanan')
    expect(roleDisplayName('admin', 'Maooz')).toBe('Maooz')
    expect(roleDisplayName('member', 'Abdul Hanan', 'loop@bytechsol.com')).toBe('Abdul Hanan')
  })
  it('uses role labels only when a profile has no name', () => {
    expect(roleDisplayName('ceo', '')).toBe('CEO')
    expect(roleDisplayName('admin', ' ')).toBe('Admin')
    expect(roleDisplayName('member', null, 'LOOP@BYTECHSOL.COM')).toBe('Admin')
    expect(roleDisplayName('member', null)).toBe('Team member')
  })
  it('preserves ordinary employee names', () => {
    expect(roleDisplayName('member', 'Sara Khan')).toBe('Sara Khan')
  })
})
