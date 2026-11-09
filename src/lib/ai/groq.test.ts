import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ constructor: vi.fn() }))
vi.mock('groq-sdk', () => ({
  default: class {
    constructor(options: unknown) { mocks.constructor(options) }
  },
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('GROQ_API_KEY', '')
  vi.stubEnv('GROQ_MODEL', '')
})
afterEach(() => vi.unstubAllEnvs())

describe('Groq provider configuration', () => {
  it('does not construct a client without a server key', async () => {
    const { getGroq } = await import('./groq')
    expect(getGroq()).toBeNull()
    expect(mocks.constructor).not.toHaveBeenCalled()
  })

  it('reuses a bounded server client and defaults to low-effort GPT-OSS', async () => {
    vi.stubEnv('GROQ_API_KEY', 'test-only-groq-key')
    const { getGroq, AI_MODEL, getReasoningOptions } = await import('./groq')
    expect(getGroq()).toBe(getGroq())
    expect(mocks.constructor).toHaveBeenCalledTimes(1)
    expect(mocks.constructor).toHaveBeenCalledWith({ apiKey: 'test-only-groq-key', maxRetries: 1, timeout: 60_000 })
    expect(AI_MODEL).toBe('openai/gpt-oss-120b')
    expect(getReasoningOptions()).toEqual({ include_reasoning: false, reasoning_effort: 'low' })
    expect(getReasoningOptions('openai/gpt-oss-20b')).toEqual({ include_reasoning: false, reasoning_effort: 'low' })
  })

  it('does not send GPT-OSS-only reasoning options to another model', async () => {
    vi.stubEnv('GROQ_MODEL', 'llama-3.3-70b-versatile')
    const { AI_MODEL, getReasoningOptions } = await import('./groq')
    expect(AI_MODEL).toBe('llama-3.3-70b-versatile')
    expect(getReasoningOptions()).toEqual({})
  })
})
