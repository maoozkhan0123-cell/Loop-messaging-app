'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Bot, CalendarDays, CheckSquare, Loader2, MessageSquare, RefreshCw } from 'lucide-react'
import { useDailyBrief } from '@/hooks/useDailyBrief'
import { cn } from '@/lib/utils'
import type { DailyBriefLanguage, DailyBriefLink } from '@/types/dailyBrief'

export function DailyBrief({ userId, className }: { userId: string; className?: string }) {
  const headingId = useId()
  const [language, setLanguage] = useState<DailyBriefLanguage>('english')
  const { data: brief, error, isGenerating, generate, timeZone } = useDailyBrief(userId, language)

  return <section aria-labelledby={headingId} aria-busy={isGenerating} className={cn('min-w-0 rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] p-4 text-[var(--foreground)] shadow-sm', className)}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 basis-48 items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Bot size={17} aria-hidden="true" /></span>
        <div className="min-w-0"><h2 id={headingId} className="text-base font-semibold">Today’s brief</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Your priorities, deadlines and unread discussions.</p></div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`${headingId}-language`}>Brief language</label>
        <select id={`${headingId}-language`} value={language} disabled={isGenerating} onChange={event => setLanguage(event.target.value as DailyBriefLanguage)} className="h-9 max-w-full rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60">
          <option value="english">English</option><option value="roman_urdu">Roman Urdu</option>
        </select>
        <button type="button" disabled={!userId || isGenerating} onClick={() => void generate()} aria-label={brief ? 'Refresh daily brief' : 'Generate daily brief'} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white transition hover:bg-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-60">
          {isGenerating ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : brief ? <RefreshCw size={14} aria-hidden="true" /> : <Bot size={14} aria-hidden="true" />}
          {isGenerating ? 'Preparing…' : brief ? 'Refresh' : 'Generate'}
        </button>
      </div>
    </header>

    {isGenerating && <p role="status" className="mt-3 text-xs text-[var(--muted-foreground)]">{brief ? 'Refreshing your brief…' : 'Preparing your brief…'}</p>}
    {error && <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
      <p>{error.message}</p>
      {error.retryAfterSeconds && <p className="mt-1">Try again in about {error.retryAfterSeconds} seconds.</p>}
      <button type="button" disabled={isGenerating} onClick={() => void generate()} className="mt-2 rounded font-semibold underline underline-offset-2 disabled:opacity-60">Retry brief</button>
    </div>}
    {!brief && !isGenerating && !error && <p className="mt-4 text-sm text-[var(--muted-foreground)]">Generate a quick overview to plan your day.</p>}

    {brief && <div className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)]">
        <span className="rounded-full bg-[var(--surface-muted)] px-2 py-1 font-medium">{brief.summarySource === 'ai' ? 'AI summary' : 'Workspace summary'}</span>
        <span>Updated <time dateTime={brief.generatedAt} title={new Date(brief.generatedAt).toLocaleString(undefined, { timeZone })}>{new Date(brief.generatedAt).toLocaleTimeString(undefined, { timeZone, hour: 'numeric', minute: '2-digit' })}</time></span>
      </div>
      <p className="whitespace-pre-line break-words text-sm leading-relaxed">{brief.overview}</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <BriefCount label="Overdue" count={brief.counts.overdue} attention={brief.counts.overdue > 0} />
        <BriefCount label="Due today" count={brief.counts.dueToday} />
        <BriefCount label="Next 7 days" count={brief.counts.upcoming} />
        <BriefCount label="Unread channels" count={brief.counts.unreadChannels} />
      </dl>
      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        <BriefLinks title="Priorities" items={brief.priorities} empty="No open priorities in this brief." />
        <BriefLinks title="Unread discussions" items={brief.discussions} empty={brief.counts.unreadChannels === null ? 'Discussion information is unavailable.' : 'No unread discussions in this brief.'} />
      </div>
      {!!brief.limitedSources?.length && <div className="rounded-lg bg-[var(--surface-muted)] p-3 text-xs text-[var(--muted-foreground)]"><p className="font-medium">Brief coverage</p><ul className="mt-1 list-disc space-y-1 pl-4">{brief.limitedSources.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ul></div>}
    </div>}
  </section>
}

function BriefCount({ label, count, attention }: { label: string; count: number | null; attention?: boolean }) {
  return <div className="min-w-0 rounded-xl bg-[var(--surface-muted)] px-3 py-2"><dt className="text-[11px] text-[var(--muted-foreground)]">{label}</dt><dd className={cn('mt-0.5 text-lg font-semibold', attention && 'text-red-600')}>{count === null ? <span aria-label="Unavailable">—</span> : count}</dd></div>
}

function BriefLinks({ title, items, empty }: { title: string; items: DailyBriefLink[]; empty: string }) {
  return <div className="min-w-0"><h3 className="mb-2 text-xs font-semibold">{title}</h3>{items.length ? <ul className="space-y-2">{items.map(item => <li key={`${item.kind}-${item.id}`}>
    <Link href={item.href} className="group flex min-w-0 items-start gap-2 rounded-lg border border-[var(--ui-border)] px-3 py-2.5 transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">
      <span className="mt-0.5 shrink-0 text-[var(--primary)]">{item.kind === 'channel' ? <MessageSquare size={14} aria-hidden="true" /> : item.kind === 'event' ? <CalendarDays size={14} aria-hidden="true" /> : <CheckSquare size={14} aria-hidden="true" />}</span>
      <span className="min-w-0 flex-1"><span className="block break-words text-xs font-semibold">{item.title}</span><span className="mt-0.5 block break-words text-[11px] text-[var(--muted-foreground)]">{item.detail}</span></span>
      <ArrowUpRight size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--muted-foreground)] group-hover:text-[var(--primary)]" />
    </Link>
  </li>)}</ul> : <p className="text-xs text-[var(--muted-foreground)]">{empty}</p>}</div>
}
