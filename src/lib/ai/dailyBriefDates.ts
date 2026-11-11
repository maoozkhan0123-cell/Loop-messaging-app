const DAY_MS = 86_400_000

type BriefEvent = {
  starts_at: string
  ends_at: string
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly'
}

type WallTime = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

// setUTCFullYear avoids Date.UTC's special interpretation of years 00–99.
function wallEpoch(wall: WallTime): number {
  const date = new Date(0)
  date.setUTCFullYear(wall.year, wall.month - 1, wall.day)
  date.setUTCHours(wall.hour, wall.minute, wall.second, wall.millisecond)
  return date.getTime()
}

function dateWall(year: number, month: number, day: number): WallTime {
  return { year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 }
}

export function strictDay(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false
  const date = new Date(wallEpoch(dateWall(year, month, day)))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value || value.length > 100) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(new Date(0))
    return true
  } catch {
    return false
  }
}

function formatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
}

function inZone(date: Date, format: Intl.DateTimeFormat): WallTime {
  const parts = format.formatToParts(date)
  const part = (name: Intl.DateTimeFormatPartTypes) => Number(parts.find((entry) => entry.type === name)?.value)
  return {
    year: part('year'), month: part('month'), day: part('day'),
    hour: part('hour'), minute: part('minute'), second: part('second'),
    millisecond: date.getUTCMilliseconds(),
  }
}

function dayString(wall: Pick<WallTime, 'year' | 'month' | 'day'>): string {
  return `${String(wall.year).padStart(4, '0')}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`
}

export function dayInTimeZone(now: Date, timeZone: string): string {
  return dayString(inZone(now, formatter(timeZone)))
}

export function addCalendarDays(day: string, n: number): string {
  if (!strictDay(day) || !Number.isSafeInteger(n)) throw new RangeError('Invalid calendar day or offset.')
  const [year, month, date] = day.split('-').map(Number)
  const shifted = new Date(wallEpoch(dateWall(year, month, date)) + n * DAY_MS)
  if (!Number.isFinite(shifted.getTime()) || shifted.getUTCFullYear() < 1 || shifted.getUTCFullYear() > 9999) {
    throw new RangeError('Calendar day is out of range.')
  }
  return dayString({ year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() })
}

function timestamp(value: string): Date | null {
  // Explicit offsets keep event parsing independent of the server's local zone.
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/i.test(value)
    || !strictDay(value.slice(0, 10))) return null
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

/** Resolve a wall time like Date/date-fns: earlier instant for folds, forward through gaps. */
function wallToInstant(wall: WallTime, format: Intl.DateTimeFormat): Date | null {
  const wanted = wallEpoch(wall)
  const offsets = new Set<number>()
  // Nearby offsets cover both sides of DST, including half-hour and full-day changes.
  for (const days of [-2, -1, 0, 1, 2]) {
    const sample = new Date(wanted + days * DAY_MS)
    offsets.add(wallEpoch(inZone(sample, format)) - sample.getTime())
  }
  let exact: number | undefined
  let after: { epoch: number; distance: number } | undefined
  for (const offset of offsets) {
    const epoch = wanted - offset
    const distance = wallEpoch(inZone(new Date(epoch), format)) - wanted
    if (distance === 0 && (exact === undefined || epoch < exact)) exact = epoch
    if (distance > 0 && (!after || distance < after.distance || (distance === after.distance && epoch < after.epoch))) {
      after = { epoch, distance }
    }
  }
  return exact !== undefined ? new Date(exact) : after ? new Date(after.epoch) : null
}

function monthLength(year: number, month: number): number {
  return new Date(wallEpoch(dateWall(year, month + 1, 0))).getUTCDate()
}

function occurrenceWall(first: WallTime, recurrence: BriefEvent['recurrence'], index: number): WallTime | null {
  if (recurrence === 'monthly') {
    const totalMonths = first.year * 12 + first.month - 1 + index
    const year = Math.floor(totalMonths / 12)
    const month = totalMonths % 12 + 1
    if (year < 1 || year > 9999) return null
    // Clamp from the original date each time: Jan 31 -> Feb 28 -> Mar 31.
    return { ...first, year, month, day: Math.min(first.day, monthLength(year, month)) }
  }
  const date = new Date(wallEpoch(dateWall(first.year, first.month, first.day)) + index * (recurrence === 'weekly' ? 7 : 1) * DAY_MS)
  const year = date.getUTCFullYear()
  if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999) return null
  return { ...first, year, month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

/** Find the earliest ongoing or future occurrence without walking through event history. */
export function nextBriefOccurrence(event: BriefEvent, now: Date, timeZone: string): Date | null {
  const first = timestamp(event.starts_at)
  const end = timestamp(event.ends_at)
  if (!first || !end || end <= first || !Number.isFinite(now.getTime()) || !validTimeZone(timeZone)
    || !['none', 'daily', 'weekly', 'monthly'].includes(event.recurrence)) return null
  if (event.recurrence === 'none') return end >= now ? first : null

  const format = formatter(timeZone)
  const firstWall = inZone(first, format)
  // An occurrence remains relevant until its original elapsed duration has passed.
  const threshold = new Date(now.getTime() - (end.getTime() - first.getTime()))
  const thresholdWall = inZone(threshold, format)
  const elapsedDays = Math.floor((wallEpoch(dateWall(thresholdWall.year, thresholdWall.month, thresholdWall.day))
    - wallEpoch(dateWall(firstWall.year, firstWall.month, firstWall.day))) / DAY_MS)
  const estimate = event.recurrence === 'monthly'
    ? (thresholdWall.year - firstWall.year) * 12 + thresholdWall.month - firstWall.month
    : Math.floor(elapsedDays / (event.recurrence === 'weekly' ? 7 : 1))

  // Calendar arithmetic gives the approximate index directly. A fixed neighbourhood
  // handles time-of-day boundaries and timezone transitions, regardless of event age.
  for (let index = Math.max(0, estimate - 2); index <= Math.max(0, estimate) + 3; index++) {
    const wall = occurrenceWall(firstWall, event.recurrence, index)
    const candidate = index === 0 ? first : wall ? wallToInstant(wall, format) : null
    if (candidate && candidate >= threshold) return candidate
  }
  return null
}
