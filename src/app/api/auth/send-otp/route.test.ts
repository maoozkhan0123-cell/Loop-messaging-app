import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const mocks = vi.hoisted(() => {
  class SignupVerificationError extends Error {
    constructor(message: string, public status: number, public retryAfterSeconds?: number) { super(message) }
  }
  return { admin: {}, begin: vi.fn(), finish: vi.fn(), send: vi.fn(), SignupVerificationError }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.admin }))
vi.mock('@/lib/signupVerification', () => ({
  beginSignupVerification: mocks.begin, finishSignupDelivery: mocks.finish, SignupVerificationError: mocks.SignupVerificationError,
}))
vi.mock('@/lib/email', () => ({ sendOTPEmail: mocks.send }))

const challenge = { email: 'new@bytechsol.com', challengeId: 'challenge', code: '123456' }
const request = (body: unknown) => new Request('https://app.example/api/auth/send-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.begin.mockResolvedValue(challenge)
  mocks.finish.mockResolvedValue(undefined)
  mocks.send.mockResolvedValue(undefined)
})

describe('signup verification delivery route', () => {
  it('sends a challenge with normalized identity and no password required or exposed', async () => {
    const response = await POST(request({ email: ' New@BYTECHSOL.com ', displayName: ' New Teammate ' }))
    expect(response.status).toBe(200)
    expect(mocks.begin).toHaveBeenCalledWith(mocks.admin, 'new@bytechsol.com', 'New Teammate')
    expect(mocks.send).toHaveBeenCalledWith({ to: 'new@bytechsol.com', name: 'New Teammate', code: '123456' })
    expect(mocks.finish).toHaveBeenCalledWith(mocks.admin, challenge, true)
    const result = await response.json()
    expect(result.success).toBe(true)
    expect(result).not.toHaveProperty('code')
    expect(result).not.toHaveProperty('password')
    expect(JSON.stringify(result)).not.toContain('123456')
  })

  it('invalidates the reserved challenge when email delivery fails', async () => {
    mocks.send.mockRejectedValue(new Error('SMTP unavailable'))
    const response = await POST(request({ email: 'new@bytechsol.com', displayName: 'New Teammate' }))
    expect(response.status).toBe(500)
    expect(mocks.finish).toHaveBeenCalledWith(mocks.admin, challenge, false)
    expect((await response.json()).success).not.toBe(true)
  })

  it('reports shared rate limits without sending another email', async () => {
    mocks.begin.mockRejectedValue(new mocks.SignupVerificationError('Try again later.', 429, 90))
    const response = await POST(request({ email: 'new@bytechsol.com', displayName: 'New Teammate' }))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('90')
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
