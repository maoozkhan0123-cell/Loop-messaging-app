'use client'

import { useContext, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PreferencesContext } from '@/contexts/PreferencesProvider'
import type { DailyBrief, DailyBriefLanguage, DailyBriefLink } from '@/types/dailyBrief'

type BriefContext = { day: string; timeZone: string }

export class DailyBriefRequestError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterSeconds?: number) {
    super(message)
    this.name = 'DailyBriefRequestError'
  }
}

function readBriefContext(now: Date, preference?: string): BriefContext {
  let browserZone = 'UTC'
  try { browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' } catch {}
  let timeZone = preference && preference !== 'auto' ? preference : browserZone
  let formatter: Intl.DateTimeFormat
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }) }
  catch {
    timeZone = browserZone
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  }
  const parts = formatter.formatToParts(now)
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === name)?.value
  return { day: `${part('year')}-${part('month')}-${part('day')}`, timeZone }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isBriefLink(value: unknown): value is DailyBriefLink {
  return isRecord(value) && typeof value.id === 'string' && typeof value.title === 'string'
    && typeof value.detail === 'string' && typeof value.href === 'string'
    && value.href.startsWith('/') && !value.href.startsWith('//') && !/[\\\u0000-\u001f]/.test(value.href)
    && ['task', 'event', 'channel'].includes(String(value.kind))
}

function isBrief(value: unknown, context: BriefContext): value is DailyBrief {
  if (!isRecord(value) || !isRecord(value.counts)) return false
  const count = (number: unknown) => typeof number === 'number' && Number.isInteger(number) && number >= 0
  return value.day === context.day && value.timeZone === context.timeZone
    && typeof value.generatedAt === 'string' && Number.isFinite(Date.parse(value.generatedAt))
    && typeof value.overview === 'string' && ['ai', 'workspace'].includes(String(value.summarySource))
    && Array.isArray(value.priorities) && value.priorities.every(isBriefLink)
    && Array.isArray(value.discussions) && value.discussions.every(isBriefLink)
    && count(value.counts.overdue) && count(value.counts.dueToday) && count(value.counts.upcoming)
    && (value.counts.unreadChannels === null || count(value.counts.unreadChannels))
    && (value.limitedSources === undefined || (Array.isArray(value.limitedSources) && value.limitedSources.every(item => typeof item === 'string')))
}

function retryAfter(response: Response): number | undefined {
  const header = response.headers.get('Retry-After')
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds)
  const timestamp = Date.parse(header)
  return Number.isFinite(timestamp) && timestamp > Date.now() ? Math.ceil((timestamp - Date.now()) / 1000) : undefined
}

async function fetchDailyBrief(context: BriefContext, language: DailyBriefLanguage, signal: AbortSignal): Promise<DailyBrief> {
  let response: Response
  try {
    response = await fetch('/api/ai/daily-brief', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', cache: 'no-store', signal,
      body: JSON.stringify({ ...context, language }),
    })
  } catch (reason) {
    if (signal.aborted) throw reason
    throw new DailyBriefRequestError('Your brief could not be loaded. Check your connection and try again.', 0)
  }
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const fallback = response.status === 401 ? 'Please sign in again to generate your brief.'
      : response.status === 429 ? 'Please wait before generating another brief.' : 'Daily brief is temporarily unavailable. Try again shortly.'
    throw new DailyBriefRequestError(isRecord(payload) && typeof payload.error === 'string' ? payload.error : fallback, response.status, retryAfter(response))
  }
  if (!isBrief(payload, context)) throw new DailyBriefRequestError('The brief could not be read. Please try again.', response.status)
  return payload
}

/** Generation is explicit; cached private content stays only in the current query client. */
export function useDailyBrief(userId: string, language: DailyBriefLanguage = 'english') {
  const preference = useContext(PreferencesContext)?.preferences.timezone
  const [clock, setClock] = useState(() => new Date())
  // A preference change computes a new key immediately, without generating a brief.
  const context = readBriefContext(clock, preference)

  useEffect(() => {
    const update = () => setClock(new Date())
    const visible = () => { if (document.visibilityState === 'visible') update() }
    const interval = window.setInterval(update, 60_000)
    window.addEventListener('focus', update)
    document.addEventListener('visibilitychange', visible)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', update)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])

  const query = useQuery<DailyBrief, DailyBriefRequestError>({
    queryKey: ['daily-brief', userId, context.day, context.timeZone, language],
    queryFn: ({ signal }) => {
      if (!userId) throw new DailyBriefRequestError('Please sign in again to generate your brief.', 401)
      return fetchDailyBrief(context, language, signal)
    },
    enabled: false,
    staleTime: Infinity,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
    retryOnMount: false,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  return {
    data: query.data,
    error: query.error,
    isGenerating: query.isFetching,
    // Join an existing generation instead of cancelling and issuing another paid request.
    generate: () => query.refetch({ cancelRefetch: false }),
    ...context,
  }
}
