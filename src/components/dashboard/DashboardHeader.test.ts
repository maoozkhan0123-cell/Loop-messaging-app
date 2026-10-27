import { describe, expect, it } from 'vitest'
import { firstNameOf, greetingForHour } from './DashboardHeader'

describe('DashboardHeader greeting', () => {
  it('selects the correct greeting for local time', () => {
    expect(greetingForHour(8)).toBe('Good morning')
    expect(greetingForHour(14)).toBe('Good afternoon')
    expect(greetingForHour(21)).toBe('Good evening')
  })

  it('uses only the first name with a graceful fallback', () => {
    expect(firstNameOf('  Abdul Rehman  ')).toBe('Abdul')
    expect(firstNameOf('')).toBe('there')
    expect(firstNameOf(null)).toBe('there')
  })
})
