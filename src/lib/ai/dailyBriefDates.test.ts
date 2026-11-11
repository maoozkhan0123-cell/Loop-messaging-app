import { describe, expect, it } from 'vitest'
import { addCalendarDays, dayInTimeZone, nextBriefOccurrence, strictDay, validTimeZone } from './dailyBriefDates'

const event = (starts_at: string, ends_at: string, recurrence: 'none' | 'daily' | 'weekly' | 'monthly' = 'daily') => ({ starts_at, ends_at, recurrence })

describe('daily brief calendar days', () => {
  it('validates actual dates and leap years without normalising impossible dates', () => {
    expect(strictDay('2024-02-29')).toBe(true)
    expect(strictDay('2000-02-29')).toBe(true)
    for (const day of ['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '2026-1-01', '2026-01-01T00:00:00Z', null, 20260101]) {
      expect(strictDay(day)).toBe(false)
    }
  })

  it('validates timezone input and computes the viewer day across midnight', () => {
    expect(validTimeZone('America/Los_Angeles')).toBe(true)
    expect(validTimeZone('UTC')).toBe(true)
    for (const zone of ['not/a-zone', '', null, 123]) expect(validTimeZone(zone)).toBe(false)
    const now = new Date('2026-11-11T01:30:00Z')
    expect(dayInTimeZone(now, 'America/Los_Angeles')).toBe('2026-11-10')
    expect(dayInTimeZone(now, 'Asia/Karachi')).toBe('2026-11-11')
    expect(dayInTimeZone(new Date('2026-01-01T00:00:00Z'), 'UTC')).toBe('2026-01-01')
  })

  it('adds calendar days over leap/month/year boundaries and rejects invalid offsets', () => {
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addCalendarDays('2024-02-28', 2)).toBe('2024-03-01')
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addCalendarDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addCalendarDays('0099-12-31', 1)).toBe('0100-01-01')
    expect(() => addCalendarDays('2026-02-30', 1)).toThrow(RangeError)
    expect(() => addCalendarDays('2026-01-01', 0.5)).toThrow(RangeError)
    expect(() => addCalendarDays('9999-12-31', 1)).toThrow(RangeError)
  })
})

describe('next daily brief event occurrence', () => {
  it('includes an ongoing nonrecurring event and excludes it only after it ends', () => {
    const meeting = event('2026-11-11T09:00:00Z', '2026-11-11T10:00:00Z', 'none')
    expect(nextBriefOccurrence(meeting, new Date('2026-11-11T09:30:00Z'), 'UTC')?.toISOString()).toBe('2026-11-11T09:00:00.000Z')
    expect(nextBriefOccurrence(meeting, new Date('2026-11-11T10:00:00Z'), 'UTC')?.toISOString()).toBe('2026-11-11T09:00:00.000Z')
    expect(nextBriefOccurrence(meeting, new Date('2026-11-11T10:00:00.001Z'), 'UTC')).toBeNull()
  })

  it('keeps the first event in the future and includes an ongoing repeating event', () => {
    const meeting = event('2026-11-10T09:00:00Z', '2026-11-10T10:00:00Z')
    expect(nextBriefOccurrence(meeting, new Date('2026-11-01T00:00:00Z'), 'UTC')?.toISOString()).toBe('2026-11-10T09:00:00.000Z')
    expect(nextBriefOccurrence(meeting, new Date('2026-11-11T09:30:00Z'), 'UTC')?.toISOString()).toBe('2026-11-11T09:00:00.000Z')
    expect(nextBriefOccurrence(meeting, new Date('2026-11-11T10:01:00Z'), 'UTC')?.toISOString()).toBe('2026-11-12T09:00:00.000Z')
  })

  it('finds decades-old daily, weekly, and monthly events without a history cutoff', () => {
    const now = new Date('2026-11-11T08:00:00Z')
    expect(nextBriefOccurrence(event('1990-01-01T09:00:00Z', '1990-01-01T10:00:00Z'), now, 'UTC')?.toISOString()).toBe('2026-11-11T09:00:00.000Z')
    expect(nextBriefOccurrence(event('1990-01-01T09:00:00Z', '1990-01-01T10:00:00Z', 'weekly'), now, 'UTC')?.toISOString()).toBe('2026-11-16T09:00:00.000Z')
    expect(nextBriefOccurrence(event('1990-01-31T09:00:00Z', '1990-01-31T10:00:00Z', 'monthly'), now, 'UTC')?.toISOString()).toBe('2026-11-30T09:00:00.000Z')
  })

  it('clamps monthly dates from the original day instead of drifting after February', () => {
    const monthly = event('2026-01-31T09:00:00Z', '2026-01-31T10:00:00Z', 'monthly')
    expect(nextBriefOccurrence(monthly, new Date('2026-02-01T00:00:00Z'), 'UTC')?.toISOString()).toBe('2026-02-28T09:00:00.000Z')
    expect(nextBriefOccurrence(monthly, new Date('2026-03-01T00:00:00Z'), 'UTC')?.toISOString()).toBe('2026-03-31T09:00:00.000Z')
  })

  it('preserves viewer-local wall time across spring-forward and fall-back', () => {
    const spring = event('2026-03-07T14:00:00Z', '2026-03-07T15:00:00Z') // 09:00 New York
    expect(nextBriefOccurrence(spring, new Date('2026-03-08T12:00:00Z'), 'America/New_York')?.toISOString()).toBe('2026-03-08T13:00:00.000Z')
    const fall = event('2026-10-31T13:00:00Z', '2026-10-31T14:00:00Z')
    expect(nextBriefOccurrence(fall, new Date('2026-11-01T12:00:00Z'), 'America/New_York')?.toISOString()).toBe('2026-11-01T14:00:00.000Z')
  })

  it('moves nonexistent local times forward through DST gaps and chooses the earlier fold instant', () => {
    const gap = event('2026-03-07T07:30:00Z', '2026-03-07T08:00:00Z') // 02:30 local
    expect(nextBriefOccurrence(gap, new Date('2026-03-08T06:00:00Z'), 'America/New_York')?.toISOString()).toBe('2026-03-08T07:30:00.000Z')
    // The next day recovers the original 02:30 wall time.
    expect(nextBriefOccurrence(gap, new Date('2026-03-09T05:00:00Z'), 'America/New_York')?.toISOString()).toBe('2026-03-09T06:30:00.000Z')
    const fold = event('2026-10-31T05:30:00Z', '2026-10-31T06:00:00Z') // 01:30 local
    expect(nextBriefOccurrence(fold, new Date('2026-11-01T04:00:00Z'), 'America/New_York')?.toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })

  it('uses the viewer date for recurrences spanning UTC midnight and preserves milliseconds', () => {
    const daily = event('2026-11-10T07:30:00.125Z', '2026-11-10T08:30:00.125Z') // 23:30 Los Angeles
    expect(nextBriefOccurrence(daily, new Date('2026-11-11T06:00:00Z'), 'America/Los_Angeles')?.toISOString()).toBe('2026-11-11T07:30:00.125Z')
  })

  it('includes the earliest still-ongoing occurrence for events longer than their repeat interval', () => {
    const long = event('2000-01-01T09:00:00Z', '2000-01-04T09:00:00Z')
    expect(nextBriefOccurrence(long, new Date('2026-11-11T10:00:00Z'), 'UTC')?.toISOString()).toBe('2026-11-09T09:00:00.000Z')
  })

  it('safely rejects malformed timestamps, impossible dates, invalid ranges and zones', () => {
    const valid = event('2026-11-11T09:00:00Z', '2026-11-11T10:00:00Z')
    for (const invalid of [
      { ...valid, starts_at: 'bad' }, { ...valid, starts_at: '2026-02-30T09:00:00Z' },
      { ...valid, starts_at: '2026-11-11T09:00:00' }, { ...valid, ends_at: valid.starts_at },
      { ...valid, ends_at: '2026-11-10T09:00:00Z' },
    ]) expect(nextBriefOccurrence(invalid, new Date('2026-11-11T08:00:00Z'), 'UTC')).toBeNull()
    expect(nextBriefOccurrence(valid, new Date('bad'), 'UTC')).toBeNull()
    expect(nextBriefOccurrence(valid, new Date(), 'unknown')).toBeNull()
  })
})
