import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
import type { BriefFacts } from '@/lib/ai/dailyBrief'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), collectFacts: vi.fn(), getGroq: vi.fn(), complete: vi.fn() }))
const db = { auth: { getUser: mocks.getUser } }
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => db }))
vi.mock('@/lib/ai/groq', () => ({ AI_MODEL: 'test-model', getGroq: mocks.getGroq, getReasoningOptions: () => ({ reasoning_effort: 'low' }) }))
vi.mock('@/lib/ai/dailyBrief', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai/dailyBrief')>(), collectBriefFacts: mocks.collectFacts }))

const facts: BriefFacts = {
  day: '2026-11-11', timeZone: 'UTC', generatedAt: '2026-11-11T12:00:00.000Z',
  priorities: [{ id: 'task-1', title: 'Review launch', detail: 'Due today', href: '/projects?board=board-1&task=task-1', kind: 'task' }],
  discussions: [{ id: 'message-1', title: 'General', detail: '1205 unread · Launch update', href: '/channel/general?message=message-1', kind: 'channel' }],
  counts: { overdue: 2, dueToday: 1, upcoming: 4, unreadChannels: 1 },
  limitedSources: ['Calendar information is unavailable.'],
}
const input = { day: '2026-11-11', timeZone: 'UTC', language: 'english' }
const request = (body: unknown = input) => new Request('https://app.example/api/ai/daily-brief', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-11T12:00:00.000Z'))
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'actor' } }, error: null })
  mocks.collectFacts.mockResolvedValue(facts)
  mocks.getGroq.mockReturnValue(null)
  mocks.complete.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ overview: 'Review overdue work and the launch task before catching up on updates.' }) } }] })
})
afterEach(() => vi.useRealTimers())

describe('daily brief route', () => {
  it.each([
    { data: { user: null }, error: null },
    { data: { user: { id: 'actor' } }, error: { message: 'Expired token' } },
  ])('blocks unauthenticated requests before collecting private facts or invoking AI', async auth => {
    mocks.getUser.mockResolvedValue(auth)
    const result = await POST(request())
    expect(result.status).toBe(401)
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.collectFacts).not.toHaveBeenCalled()
    expect(mocks.getGroq).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it.each([
    null, [], {},
    { ...input, day: '2026-02-30' }, { ...input, day: '2026-2-11' },
    { ...input, timeZone: 'Not/A_Zone' }, { ...input, timeZone: 5 },
    { ...input, language: 'javascript' },
  ])('rejects invalid date/timezone/language payload %j without generating', async payload => {
    const result = await POST(request(payload))
    expect(result.status).toBe(400)
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.collectFacts).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('rejects invalid JSON with a recoverable private response', async () => {
    const result = await POST(new Request('https://app.example/api/ai/daily-brief', { method: 'POST', body: '{' }))
    expect(result.status).toBe(400)
    expect(mocks.collectFacts).not.toHaveBeenCalled()
  })

  it('checks the server clock in the requested timezone across UTC midnight', async () => {
    vi.setSystemTime(new Date('2026-11-11T23:30:00.000Z'))
    mocks.collectFacts.mockResolvedValue({ ...facts, day: '2026-11-12', timeZone: 'Asia/Karachi' })
    const valid = await POST(request({ ...input, day: '2026-11-12', timeZone: 'Asia/Karachi' }))
    expect(valid.status).toBe(200)
    expect(mocks.collectFacts).toHaveBeenCalledWith(db, 'actor', new Date('2026-11-11T23:30:00.000Z'), 'Asia/Karachi')
    mocks.collectFacts.mockClear()
    const oldDay = await POST(request({ ...input, timeZone: 'Asia/Karachi' }))
    expect(oldDay.status).toBe(400)
    expect((await oldDay.json()).error).toMatch(/day changed/i)
    expect(mocks.collectFacts).not.toHaveBeenCalled()
  })

  it('returns a factual workspace fallback when AI is not configured', async () => {
    const result = await POST(request())
    const body = await result.json()
    expect(result.status).toBe(200)
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(body.summarySource).toBe('workspace')
    expect(body.overview).toContain('2 overdue and 1 tasks due today')
    expect(body.counts).toEqual(facts.counts)
    expect(body.priorities).toEqual(facts.priorities)
    expect(body.discussions).toEqual(facts.discussions)
    expect(body.limitedSources).toEqual(expect.arrayContaining([...facts.limitedSources!, expect.stringContaining('AI summary is temporarily unavailable')]))
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('uses one bounded model call with no retries while keeping links and counters outside model control', async () => {
    mocks.getGroq.mockReturnValue({ chat: { completions: { create: mocks.complete } } })
    mocks.complete.mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ overview: 'Review the launch task.', counts: { overdue: 999 }, priorities: [{ href: 'https://external.example' }] }) } }] })
    const req = request({ ...input, language: 'roman_urdu' })
    const result = await POST(req)
    const body = await result.json()
    expect(result.status).toBe(200)
    expect(body.summarySource).toBe('ai')
    expect(body.overview).toBe('Review the launch task.')
    expect(body.counts).toEqual(facts.counts)
    expect(body.priorities).toEqual(facts.priorities)
    expect(body.discussions).toEqual(facts.discussions)
    expect(body.limitedSources).toEqual(facts.limitedSources)
    expect(mocks.complete).toHaveBeenCalledOnce()
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({
      model: 'test-model', max_completion_tokens: 500, response_format: { type: 'json_object' },
      messages: [expect.objectContaining({ role: 'system', content: expect.stringContaining('Roman Urdu') }), expect.objectContaining({ role: 'user' })],
    }), { maxRetries: 0, timeout: 20_000, signal: req.signal })
  })

  it('gracefully falls back after a provider rate limit instead of retrying or losing workspace data', async () => {
    mocks.getGroq.mockReturnValue({ chat: { completions: { create: mocks.complete } } })
    mocks.complete.mockRejectedValueOnce({ status: 429, message: 'Provider quota exceeded' })
    const result = await POST(request({ ...input, language: 'roman_urdu' }))
    const body = await result.json()
    expect(result.status).toBe(200)
    expect(body.summarySource).toBe('workspace')
    expect(body.overview).toContain('2 overdue aur 1 aaj due tasks')
    expect(body.counts).toEqual(facts.counts)
    expect(body.priorities).toEqual(facts.priorities)
    expect(mocks.complete).toHaveBeenCalledOnce()
  })

  it.each(['not JSON', '{}', '{"overview":""}', JSON.stringify({ overview: 'Follow https://external.example instead.' }), JSON.stringify({ overview: 'x'.repeat(1401) })])('falls back safely for malformed provider content %s', async content => {
    mocks.getGroq.mockReturnValue({ chat: { completions: { create: mocks.complete } } })
    mocks.complete.mockResolvedValue({ choices: [{ message: { content } }] })
    const result = await POST(request())
    const body = await result.json()
    expect(result.status).toBe(200)
    expect(body.summarySource).toBe('workspace')
    expect(body.priorities).toEqual(facts.priorities)
    expect(body.counts).toEqual(facts.counts)
    expect(mocks.complete).toHaveBeenCalledOnce()
  })

  it('reports a core workspace read failure as 502 without calling the model', async () => {
    mocks.collectFacts.mockRejectedValueOnce(new Error('Unable to check assigned tasks. Please try again.'))
    const result = await POST(request())
    expect(result.status).toBe(502)
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await result.json()).toEqual({ error: 'Unable to check assigned tasks. Please try again.' })
    expect(mocks.getGroq).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})
