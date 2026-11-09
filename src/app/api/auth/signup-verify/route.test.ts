import { beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'

const mocks = vi.hoisted(() => {
  class SignupVerificationError extends Error {
    constructor(message: string, public status: number, public retryAfterSeconds?: number) { super(message) }
  }
  const createUser = vi.fn(), updateUserById = vi.fn(), deleteUser = vi.fn(), signIn = vi.fn()
  return { createUser, updateUserById, deleteUser, signIn, admin: { auth: { admin: { createUser, updateUserById, deleteUser } } }, claim: vi.fn(), complete: vi.fn(), SignupVerificationError }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => mocks.admin }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signInWithPassword: mocks.signIn } }) }))
vi.mock('@/lib/signupVerification', () => ({ claimSignupVerification: mocks.claim, completeSignupVerification: mocks.complete, SignupVerificationError: mocks.SignupVerificationError }))

const claim = { email: 'new@bytechsol.com', challengeId: 'challenge', leaseId: 'lease', displayName: 'New Teammate' }
const password = 'Example-test-password1!'
const request = (body: unknown) => new Request('https://app.example/api/auth/signup-verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.claim.mockResolvedValue(claim)
  mocks.complete.mockResolvedValue(undefined)
  mocks.createUser.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null })
  mocks.signIn.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null })
})

describe('signup verification account route', () => {
  it('requires a password before claiming a verified challenge', async () => {
    const response = await POST(request({ email: 'new@bytechsol.com', code: '123456' }))
    expect(response.status).toBe(400)
    expect(mocks.claim).not.toHaveBeenCalled()
    expect(mocks.createUser).not.toHaveBeenCalled()
  })

  it('normalizes email and creates the verified account using only the submitted password', async () => {
    const response = await POST(request({ email: ' New@BYTECHSOL.com ', code: ' 123456 ', password }))
    expect(response.status).toBe(200)
    expect(mocks.claim).toHaveBeenCalledWith(mocks.admin, 'new@bytechsol.com', '123456')
    expect(mocks.createUser).toHaveBeenCalledWith({ email: 'new@bytechsol.com', password, email_confirm: true, user_metadata: { display_name: 'New Teammate' } })
    expect(mocks.complete).toHaveBeenCalledWith(mocks.admin, claim, true)
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'new@bytechsol.com', password })
    expect(mocks.complete.mock.invocationCallOrder[0]).toBeLessThan(mocks.signIn.mock.invocationCallOrder[0])
    const result = await response.json()
    expect(result).toMatchObject({ success: true, redirectTo: '/' })
    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('code')
  })

  it('releases a verification lease when account creation fails transiently', async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { message: 'Database unavailable', code: 'unexpected_failure' } })
    const response = await POST(request({ email: 'new@bytechsol.com', code: '123456', password }))
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(mocks.complete).toHaveBeenCalledWith(mocks.admin, claim, false)
    expect(mocks.signIn).not.toHaveBeenCalled()
    expect(mocks.updateUserById).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('does not overwrite an existing account when its password does not match', async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists', message: 'A user with this email already exists.' } })
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } })
    const response = await POST(request({ email: 'new@bytechsol.com', code: '123456', password }))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toMatch(/already exists/i)
    expect(mocks.complete).toHaveBeenCalledWith(mocks.admin, claim, true)
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'new@bytechsol.com', password })
    expect(mocks.updateUserById).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('redirects a newly created account to login when the session could not be established', async () => {
    mocks.signIn.mockResolvedValue({ data: { user: null }, error: { message: 'Authentication temporarily unavailable' } })
    const response = await POST(request({ email: 'new@bytechsol.com', code: '123456', password }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, redirectTo: '/login' })
    expect(mocks.complete).toHaveBeenCalledWith(mocks.admin, claim, true)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('allows an existing account to sign in with its own password after a lost creation response', async () => {
    mocks.createUser.mockResolvedValue({ data: { user: null }, error: { code: 'email_exists', message: 'A user with this email already exists.' } })
    const response = await POST(request({ email: 'new@bytechsol.com', code: '123456', password }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, redirectTo: '/' })
    expect(mocks.updateUserById).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('does not create any account when verification is rejected', async () => {
    mocks.claim.mockRejectedValue(new mocks.SignupVerificationError('Verification code is expired or incorrect.', 400))
    const response = await POST(request({ email: 'new@bytechsol.com', code: '000000', password }))
    expect(response.status).toBe(400)
    expect(mocks.createUser).not.toHaveBeenCalled()
    expect(mocks.complete).not.toHaveBeenCalled()
  })
})
