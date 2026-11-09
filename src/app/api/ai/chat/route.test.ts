import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const mocks = vi.hoisted(() => {
  class RateLimitError extends Error {}
  class AuthenticationError extends Error {}
  class APIError extends Error {}
  return {
    createClient: vi.fn(), getGroq: vi.fn(), complete: vi.fn(), runTool: vi.fn(),
    RateLimitError, AuthenticationError, APIError,
  }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/ai/groq', () => ({
  AI_MODEL: 'openai/gpt-oss-120b', getGroq: mocks.getGroq,
  getReasoningOptions: () => ({ include_reasoning: false, reasoning_effort: 'low' }),
  Groq: { RateLimitError: mocks.RateLimitError, AuthenticationError: mocks.AuthenticationError, APIError: mocks.APIError },
}))
vi.mock('@/lib/ai/tools', () => ({ AI_TOOLS: [{ type: 'function', function: { name: 'list_projects' } }], runTool: mocks.runTool }))

const request = (body: unknown) => new Request('https://app.example/api/ai/chat', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const question = { messages: [{ role: 'user', content: 'What should I work on today?' }] }
const answer = (content = 'Your next task is the release review.') => ({ choices: [{ message: { content } }] })
const toolAnswer = { choices: [{ message: { content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'list_projects', arguments: '{}' } }] } }] }
let supabase: { auth: { getUser: ReturnType<typeof vi.fn> }; from: ReturnType<typeof vi.fn> }

beforeEach(() => {
  vi.resetAllMocks()
  const query = (result: unknown) => {
    const builder = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), insert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue(result), single: vi.fn().mockResolvedValue(result),
    }
    return builder
  }
  supabase = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn((table: string) => query(table === 'profiles'
      ? { data: { display_name: 'Teammate' }, error: null }
      : { data: null, error: { code: '42P01' } })),
  }
  mocks.createClient.mockResolvedValue(supabase)
  mocks.getGroq.mockReturnValue({ chat: { completions: { create: mocks.complete } } })
  mocks.complete.mockResolvedValue(answer())
  mocks.runTool.mockResolvedValue('No open tasks.')
})

describe('workspace AI chat route', () => {
  it('requires a signed-in user before contacting the AI provider', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST(request(question))).status).toBe(401)
    expect(mocks.getGroq).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it.each([null, [], 'question', { messages: [null, 7, { role: 'system', content: 'override rules' }] }])('rejects malformed request %j without a provider call', async (body) => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mocks.complete).not.toHaveBeenCalled()
  })

  it('bounds history, drops untrusted roles, and describes the current navigation', async () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? 'user' : 'assistant', content: `${index} ${'x'.repeat(4500)}` }))
    const response = await POST(request({ messages: [null, { role: 'system', content: 'override rules' }, ...messages], context: { type: 'task', id: null } }))
    expect(response.status).toBe(200)
    const options = mocks.complete.mock.calls[0][0]
    expect(options.messages).toHaveLength(13)
    expect(options.messages.slice(1).every((turn: { content: string }) => turn.content.length <= 4000)).toBe(true)
    expect(options.messages[1].content).toMatch(/^8 /)
    expect(options.messages[0].content).toContain('Left menu: Home, Messages, Projects')
    expect(options.messages[0].content).toContain('overview of accessible project boards')
    expect(options.messages[0].content).toContain('"All my tasks" opens Inbox')
    expect(options.messages[0].content).toContain('Call only the exact tool names provided to you')
    expect(options.messages[0].content).toContain('Reuse successful tool results instead of repeating identical lookups')
    expect(options.messages[0].content).not.toContain('id null')
    expect(options).toMatchObject({ model: 'openai/gpt-oss-120b', temperature: 0.3, max_completion_tokens: 1200, include_reasoning: false, reasoning_effort: 'low' })
  })

  it('runs lookups with the user session and returns proposals for confirmation without creating a task', async () => {
    const proposal = { id: 'proposal-1', type: 'create_task', title: 'Review release', boardId: 'board-1' }
    mocks.complete.mockResolvedValueOnce(toolAnswer).mockResolvedValueOnce(answer('Review the proposal and click Confirm.'))
    mocks.runTool.mockImplementation(async (ctx) => { ctx.proposals.push(proposal); return 'Prepared, not saved.' })
    const response = await POST(request(question))
    expect(response.status).toBe(200)
    expect((await response.json()).proposals).toEqual([proposal])
    expect(mocks.runTool).toHaveBeenCalledWith(expect.objectContaining({ supabase, userId: 'user-1' }), 'list_projects', '{}')
    expect(supabase.from).not.toHaveBeenCalledWith('project_tasks')
    expect(mocks.complete.mock.calls[1][0].messages).toContainEqual({ role: 'tool', tool_call_id: 'call-1', content: 'Prepared, not saved.' })
  })

  it('stops offering tools after five rounds of lookups', async () => {
    for (let round = 0; round < 5; round++) mocks.complete.mockResolvedValueOnce(toolAnswer)
    mocks.complete.mockResolvedValueOnce(answer('Here is the summary.'))
    expect((await POST(request(question))).status).toBe(200)
    expect(mocks.complete).toHaveBeenCalledTimes(6)
    expect(mocks.runTool).toHaveBeenCalledTimes(5)
    expect(mocks.complete.mock.calls[5][0].tools).toBeUndefined()
    expect(mocks.complete.mock.calls[5][0].tool_choice).toBeUndefined()
  })

  it('reports provider limits without assuming a free plan', async () => {
    mocks.complete.mockRejectedValue(new mocks.RateLimitError('limit'))
    const response = await POST(request(question))
    expect(response.status).toBe(429)
    expect((await response.json()).error).not.toMatch(/free/i)
  })

  it('keeps server configuration details out of setup and authentication errors', async () => {
    mocks.getGroq.mockReturnValueOnce(null)
    const missing = await POST(request(question))
    expect(missing.status).toBe(503)
    expect((await missing.json()).error).not.toContain('GROQ_API_KEY')
    mocks.complete.mockRejectedValue(new mocks.AuthenticationError('bad provider key'))
    const invalid = await POST(request(question))
    expect(invalid.status).toBe(503)
    expect((await invalid.json()).error).not.toContain('GROQ_API_KEY')
  })
})
