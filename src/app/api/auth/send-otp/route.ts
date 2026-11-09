import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendOTPEmail } from '@/lib/email'
import { COMPANY_EMAIL_ERROR, isCompanyEmail } from '@/lib/auth/companyEmail'
import { beginSignupVerification, finishSignupDelivery, SignupVerificationError, type SignupChallenge } from '@/lib/signupVerification'

export async function POST(request: Request) {
  let challenge: SignupChallenge | undefined
  let admin: ReturnType<typeof createAdminClient> | undefined
  try {
    const body = await request.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const displayName = String(body.displayName ?? '').trim()
    if (!email || displayName.length < 2 || displayName.length > 160) return NextResponse.json({ error: 'Enter your name and work email.' }, { status: 400 })
    if (!isCompanyEmail(email)) return NextResponse.json({ error: COMPANY_EMAIL_ERROR }, { status: 403 })
    admin = createAdminClient()
    challenge = await beginSignupVerification(admin, email, displayName)
    await sendOTPEmail({ to: email, code: challenge.code, name: displayName })
    await finishSignupDelivery(admin, challenge, true)
    return NextResponse.json({ success: true, message: 'Verification code sent to your email' })
  } catch (error: unknown) {
    if (challenge && admin) {
      try { await finishSignupDelivery(admin, challenge, false) } catch { /* A stale delivery must not expose or overwrite a newer code. */ }
    }
    if (error instanceof SignupVerificationError) return NextResponse.json({ error: error.message }, { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined })
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Enter valid signup details.' }, { status: 400 })
    console.error('Signup verification email could not be sent.')
    return NextResponse.json({ error: 'Verification email could not be sent. Please try again later.' }, { status: 500 })
  }
}
