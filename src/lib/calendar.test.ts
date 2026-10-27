import { describe, expect, it } from 'vitest'
import { calendarDayKey, getMondayFirstCalendarGrid, parseCalendarDate } from './calendar'

describe('calendar date utilities', () => {
  it('builds a Monday-first grid across a year boundary', () => {
    const grid = getMondayFirstCalendarGrid(new Date(2025, 0, 1))
    expect(grid[0].getDay()).toBe(1)
    expect(calendarDayKey(grid[0])).toBe('2024-12-30')
    expect(grid.at(-1)?.getDay()).toBe(0)
  })

  it('includes leap day and preserves date-only semantics locally', () => {
    const grid = getMondayFirstCalendarGrid(new Date(2024, 1, 1))
    expect(grid.some((date) => calendarDayKey(date) === '2024-02-29')).toBe(true)
    expect(calendarDayKey(parseCalendarDate('2024-02-29T23:30:00Z')!)).toBe('2024-02-29')
  })

  it('rejects missing and malformed task dates', () => {
    expect(parseCalendarDate(null)).toBeNull()
    expect(parseCalendarDate('not-a-date')).toBeNull()
  })
})
