import { createHmac, randomInt, randomUUID } from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/admin'

type VerificationClient = ReturnType<typeof createAdminClient>
export type SignupChallenge = { email: string; challengeId: string; code: string }
export type SignupVerificationClaim = { email: string; challengeId: string; leaseId: string; displayName: string }

export class SignupVerificationError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterSeconds?: number) { super(message) }
}

function codeHash(email: string, code: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new SignupVerificationError('Account verification is unavailable. Please try again later.', 503)
  return createHmac('sha256', secret).update(`signup-v1\0${email}\0${code}`).digest('hex')
}

function unavailable() { return new SignupVerificationError('Account verification is unavailable. Please try again later.', 503) }

function rejectStatus(result: { status?: string; retryAfterSeconds?: number }) {
  const retry = Math.max(1, Number(result.retryAfterSeconds) || 60)
  if (result.status === 'locked') throw new SignupVerificationError('Too many verification attempts. Please try again later.', 429, retry)
  if (result.status === 'rate_limited') throw new SignupVerificationError('Too many verification requests. Please try again later.', 429, retry)
  if (result.status === 'cooldown') throw new SignupVerificationError('Please wait before requesting another verification code.', 429, retry)
  if (result.status === 'busy') throw new SignupVerificationError('Verification is already in progress. Please try again shortly.', 409, retry)
  throw new SignupVerificationError('Verification code is expired or incorrect. Request a new code if needed.', 400)
}

export async function beginSignupVerification(admin: VerificationClient, email: string, displayName: string): Promise<SignupChallenge> {
  const challengeId = randomUUID()
  const code = randomInt(100000, 1000000).toString()
  const { data, error } = await admin.rpc('begin_signup_verification', { p_email: email, p_display_name: displayName, p_challenge_id: challengeId, p_code_hash: codeHash(email, code) })
  if (error || !data) throw unavailable()
  if (data.status !== 'issued') rejectStatus(data)
  return { email, challengeId, code }
}

export async function finishSignupDelivery(admin: VerificationClient, challenge: SignupChallenge, delivered: boolean) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await admin.rpc('set_signup_verification_delivery', { p_email: challenge.email, p_challenge_id: challenge.challengeId, p_delivered: delivered })
      if (!error && data === true) return
      if (!error) throw new SignupVerificationError('This verification request is no longer active. Please request a new code.', 409)
    } catch (error) { if (error instanceof SignupVerificationError) throw error }
  }
  throw unavailable()
}

export async function claimSignupVerification(admin: VerificationClient, email: string, code: string): Promise<SignupVerificationClaim> {
  const leaseId = randomUUID()
  const { data, error } = await admin.rpc('claim_signup_verification', { p_email: email, p_code_hash: codeHash(email, code), p_lease_id: leaseId })
  if (error || !data) throw unavailable()
  if (data.status !== 'claimed') rejectStatus(data)
  return { email, challengeId: String(data.challengeId), leaseId, displayName: String(data.displayName) }
}

/** Idempotent finalization also handles a lost response after the first database commit. */
export async function completeSignupVerification(admin: VerificationClient, claim: SignupVerificationClaim, success: boolean) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await admin.rpc('complete_signup_verification', { p_email: claim.email, p_challenge_id: claim.challengeId, p_lease_id: claim.leaseId, p_success: success })
      if (!error && data === true) return
      if (!error) throw new SignupVerificationError('Verification changed while the account was being created. Please try signing in.', 409)
    } catch (error) { if (error instanceof SignupVerificationError) throw error }
  }
  throw unavailable()
}
