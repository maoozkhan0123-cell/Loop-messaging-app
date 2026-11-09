import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { beginSignupVerification, claimSignupVerification, completeSignupVerification, finishSignupDelivery } from './signupVerification'

const email = 'teammate@bytechsol.com'
const claim = { email, challengeId: 'challenge-1', leaseId: 'lease-1', displayName: 'Teammate' }
function client() {
  const rpc = vi.fn()
  return { rpc, admin: { rpc } as unknown as Parameters<typeof beginSignupVerification>[0] }
}
beforeEach(() => vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'unit-test-only-signup-pepper'))
afterEach(() => vi.unstubAllEnvs())

describe('durable signup verification helpers', () => {
  it('stores only an email-bound HMAC proof, never the plaintext code or a password', async () => {
    const { admin, rpc } = client()
    rpc.mockResolvedValueOnce({ data: { status: 'issued' }, error: null })
    const challenge = await beginSignupVerification(admin, email, 'Teammate')
    const expectedHash = createHmac('sha256', 'unit-test-only-signup-pepper').update(`signup-v1\0${email}\0${challenge.code}`).digest('hex')
    expect(rpc).toHaveBeenCalledWith('begin_signup_verification', {
      p_email: email, p_display_name: 'Teammate', p_challenge_id: challenge.challengeId, p_code_hash: expectedHash,
    })
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('password')
    expect(rpc.mock.calls[0][1]).not.toHaveProperty('code')
  })

  it('can verify through another client instance without process-local state', async () => {
    const first = client()
    first.rpc.mockResolvedValueOnce({ data: { status: 'issued' }, error: null })
    const challenge = await beginSignupVerification(first.admin, email, 'Teammate')
    const second = client()
    second.rpc.mockResolvedValueOnce({ data: { status: 'claimed', email, challengeId: challenge.challengeId, displayName: 'Teammate' }, error: null })
    const verified = await claimSignupVerification(second.admin, email, challenge.code)
    expect(verified.challengeId).toBe(challenge.challengeId)
    expect(second.rpc.mock.calls[0][1].p_code_hash).toBe(first.rpc.mock.calls[0][1].p_code_hash)
  })

  it('exposes persistent request and guess limits as retryable throttling', async () => {
    const { admin, rpc } = client()
    rpc.mockResolvedValueOnce({ data: { status: 'locked', retryAfterSeconds: 120 }, error: null })
    await expect(claimSignupVerification(admin, email, '123456')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 120 })
  })

  it('retries a lost delivery acknowledgement using the same challenge', async () => {
    const { admin, rpc } = client()
    rpc.mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({ data: true, error: null })
    await finishSignupDelivery(admin, { email, challengeId: 'challenge-1', code: '123456' }, true)
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
  })

  it('retries finalization safely and can release an unconsumed lease after a transient Auth failure', async () => {
    const { admin, rpc } = client()
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Lost response' } }).mockResolvedValueOnce({ data: true, error: null })
    await completeSignupVerification(admin, claim, true)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    rpc.mockResolvedValueOnce({ data: true, error: null })
    await completeSignupVerification(admin, claim, false)
    expect(rpc).toHaveBeenLastCalledWith('complete_signup_verification', expect.objectContaining({ p_lease_id: 'lease-1', p_success: false }))
  })
})
