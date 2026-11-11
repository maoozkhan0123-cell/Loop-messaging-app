import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DailyBrief } from './DailyBrief'
import type { DailyBrief as DailyBriefData } from '@/types/dailyBrief'
import type { DailyBriefRequestError } from '@/hooks/useDailyBrief'

const mocks = vi.hoisted(() => ({ useDailyBrief: vi.fn(), generate: vi.fn() }))
vi.mock('@/hooks/useDailyBrief', () => ({ useDailyBrief: mocks.useDailyBrief }))

const brief: DailyBriefData = {
  day: '2026-11-11', timeZone: 'UTC', generatedAt: '2026-11-11T12:00:00.000Z', overview: 'Start with the launch review, then join planning.', summarySource: 'ai',
  priorities: [{ id: 'task-1', title: 'Launch review', detail: 'Due today', href: '/projects?board=board-1&task=task-1', kind: 'task' }, { id: 'event-1', title: 'Planning meeting', detail: 'At 2 PM', href: '/calendar', kind: 'event' }],
  discussions: [{ id: 'general', title: '#general', detail: 'Unread messages', href: '/channel/general', kind: 'channel' }],
  counts: { overdue: 2, dueToday: 1, upcoming: 4, unreadChannels: 1 },
}

function state(overrides: { data?: DailyBriefData; error?: DailyBriefRequestError | null; isGenerating?: boolean } = {}) {
  return { data: undefined, error: null, isGenerating: false, generate: mocks.generate, day: '2026-11-11', timeZone: 'UTC', ...overrides }
}

describe('DailyBrief card', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.useDailyBrief.mockReturnValue(state()) })

  it('starts with an explicit Generate action and does not generate while mounting', () => {
    render(<DailyBrief userId="user-1" />)
    expect(screen.getByRole('heading', { name: 'Today’s brief' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Brief language' })).toHaveValue('english')
    expect(mocks.generate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Generate daily brief' }))
    expect(mocks.generate).toHaveBeenCalledOnce()
    expect(mocks.useDailyBrief).toHaveBeenLastCalledWith('user-1', 'english')
  })

  it('announces preparation and prevents duplicate clicks or language changes while pending', () => {
    mocks.useDailyBrief.mockReturnValue(state({ isGenerating: true }))
    render(<DailyBrief userId="user-1" />)
    expect(screen.getByRole('status')).toHaveTextContent('Preparing your brief…')
    expect(screen.getByRole('button', { name: 'Generate daily brief' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Brief language' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Generate daily brief' }))
    expect(mocks.generate).not.toHaveBeenCalled()
  })

  it('shows grounded counts, the summary source, timestamp, and original task/discussion links', () => {
    mocks.useDailyBrief.mockReturnValue(state({ data: brief }))
    const { container } = render(<DailyBrief userId="user-1" />)
    expect(screen.getByText('AI summary')).toBeInTheDocument()
    expect(screen.getByText(brief.overview)).toBeInTheDocument()
    expect(container.querySelector('time')).toHaveAttribute('datetime', brief.generatedAt)
    expect(screen.getByText('Overdue').closest('div')).toHaveTextContent('2')
    expect(screen.getByText('Next 7 days').closest('div')).toHaveTextContent('4')
    expect(screen.getByRole('link', { name: /Launch review/ })).toHaveAttribute('href', '/projects?board=board-1&task=task-1')
    expect(screen.getByRole('link', { name: /Planning meeting/ })).toHaveAttribute('href', '/calendar')
    expect(screen.getByRole('link', { name: /#general/ })).toHaveAttribute('href', '/channel/general')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh daily brief' }))
    expect(mocks.generate).toHaveBeenCalledOnce()
  })

  it('labels factual fallback summaries and unavailable discussion counts honestly', () => {
    mocks.useDailyBrief.mockReturnValue(state({ data: { ...brief, summarySource: 'workspace', discussions: [], counts: { ...brief.counts, unreadChannels: null }, limitedSources: ['Unread discussions could not be checked.'] } }))
    render(<DailyBrief userId="user-1" />)
    expect(screen.getByText('Workspace summary')).toBeInTheDocument()
    expect(screen.queryByText('AI summary')).not.toBeInTheDocument()
    const count = screen.getByText('Unread channels').closest('div')!
    expect(within(count).getByLabelText('Unavailable')).toHaveTextContent('—')
    expect(screen.getByText('Discussion information is unavailable.')).toBeInTheDocument()
    expect(screen.queryByText('No unread discussions in this brief.')).not.toBeInTheDocument()
    expect(screen.getByText('Unread discussions could not be checked.')).toBeInTheDocument()
  })

  it('keeps the existing brief visible when refresh fails and offers an explicit retry', () => {
    const error = Object.assign(new Error('Please wait before refreshing.'), { status: 429, retryAfterSeconds: 45 }) as DailyBriefRequestError
    mocks.useDailyBrief.mockReturnValue(state({ data: brief, error }))
    render(<DailyBrief userId="user-1" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Please wait before refreshing.')
    expect(screen.getByRole('alert')).toHaveTextContent('45 seconds')
    expect(screen.getByText(brief.overview)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry brief' }))
    expect(mocks.generate).toHaveBeenCalledOnce()
  })

  it('changes the requested language without generating until the user asks', () => {
    render(<DailyBrief userId="user-1" />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Brief language' }), { target: { value: 'roman_urdu' } })
    expect(mocks.useDailyBrief).toHaveBeenLastCalledWith('user-1', 'roman_urdu')
    expect(mocks.generate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Generate daily brief' }))
    expect(mocks.generate).toHaveBeenCalledOnce()
  })
})
