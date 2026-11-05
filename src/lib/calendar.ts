import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfDay, startOfMonth, startOfWeek } from 'date-fns'

export function calendarDayKey(date: Date) {
  return format(date, 'yyyy-MM-dd')
}

export function parseCalendarDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** A due date is a calendar day: overdue only once that whole day has passed, in the user's time zone. */
export function isOverdue(dueDate: string | null | undefined, now = new Date()) {
  const due = parseCalendarDate(dueDate)
  return !!due && due < startOfDay(now)
}

export function getMondayFirstCalendarGrid(month: Date) {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
  })
}

type Recurring = { starts_at: string; ends_at: string; recurrence: 'none' | 'daily' | 'weekly' | 'monthly' }

function step(date: Date, recurrence: Recurring['recurrence'], count: number) {
  if (recurrence === 'daily') return addDays(date, count)
  if (recurrence === 'weekly') return addDays(date, count * 7)
  return addMonths(date, count)
}

/** Start times of an event that fall between from and to (inclusive), following its repeat rule. */
export function eventOccurrences(event: Recurring, from: Date, to: Date, limit = 400): Date[] {
  const first = new Date(event.starts_at)
  if (event.recurrence === 'none') return first >= from && first <= to ? [first] : []
  const result: Date[] = []
  for (let index = 0; index < limit; index++) {
    const at = step(first, event.recurrence, index)
    if (at > to) break
    if (at >= from) result.push(at)
  }
  return result
}

/** The next time an event happens (an occurrence still in progress counts), or null when it is over. */
export function nextOccurrence(event: Recurring, now = new Date()): Date | null {
  const length = new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()
  const first = new Date(event.starts_at)
  if (event.recurrence === 'none') return first.getTime() + length >= now.getTime() ? first : null
  for (let index = 0; index < 5000; index++) {
    const at = step(first, event.recurrence, index)
    if (at.getTime() + length >= now.getTime()) return at
  }
  return null
}
