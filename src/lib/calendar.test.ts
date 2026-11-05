import { describe, expect, it } from 'vitest'
import { calendarDayKey, eventOccurrences, getMondayFirstCalendarGrid, isOverdue, nextOccurrence, parseCalendarDate } from './calendar'

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

describe('calendar helpers', () => {
  it('parses date-only and timestamp values as local calendar days', () => {
    expect(calendarDayKey(parseCalendarDate('2026-11-05')!)).toBe('2026-11-05')
    expect(calendarDayKey(parseCalendarDate('2026-11-05T00:00:00+00:00')!)).toBe('2026-11-05')
    expect(parseCalendarDate('bad')).toBeNull()
  })

  it('treats a task due today as not overdue', () => {
    const now = new Date(2026, 10, 5, 23, 30)
    expect(isOverdue('2026-11-05T00:00:00+00:00', now)).toBe(false)
    expect(isOverdue('2026-11-04', now)).toBe(true)
    expect(isOverdue(null, now)).toBe(false)
  })

  it('builds a Monday-first month grid', () => {
    const days = getMondayFirstCalendarGrid(new Date(2026, 10, 1))
    expect(days[0].getDay()).toBe(1)
    expect(days.length % 7).toBe(0)
  })

  it('expands repeating events inside a range', () => {
    const weekly = { starts_at: new Date(2026, 10, 2, 10).toISOString(), ends_at: new Date(2026, 10, 2, 11).toISOString(), recurrence: 'weekly' as const }
    const occurrences = eventOccurrences(weekly, new Date(2026, 10, 1), new Date(2026, 10, 30, 23))
    expect(occurrences.map((date) => date.getDate())).toEqual([2, 9, 16, 23, 30])
    expect(eventOccurrences({ ...weekly, recurrence: 'none' }, new Date(2026, 10, 3), new Date(2026, 10, 30))).toEqual([])
  })

  it('finds the next occurrence of a repeating event', () => {
    const daily = { starts_at: new Date(2026, 10, 1, 9).toISOString(), ends_at: new Date(2026, 10, 1, 10).toISOString(), recurrence: 'daily' as const }
    expect(nextOccurrence(daily, new Date(2026, 10, 5, 12))!.getDate()).toBe(6)
    expect(nextOccurrence({ ...daily, recurrence: 'none' }, new Date(2026, 10, 5))).toBeNull()
  })
})
