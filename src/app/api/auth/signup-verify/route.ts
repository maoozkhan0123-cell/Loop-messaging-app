import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { COMPANY_EMAIL_ERROR, isCompanyEmail } from '@/lib/auth/companyEmail'
import { claimSignupVerification, completeSignupVerification, SignupVerificationError, type SignupVerificationClaim } from '@/lib/signupVerification'

export async function POST(request: Request) {
  let claim: SignupVerificationClaim | undefined
  let admin: ReturnType<typeof createAdminClient> | undefined
  let accountExists = false
  try {
    const body = await request.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const code = String(body.code ?? '').trim()
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email || !/^\d{6}$/.test(code)) return NextResponse.json({ error: 'Enter your email and six-digit verification code.' }, { status: 400 })
    if (!isCompanyEmail(email)) return NextResponse.json({ error: COMPANY_EMAIL_ERROR }, { status: 403 })
    if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 })
    admin = createAdminClient()
    claim = await claimSignupVerification(admin, email, code)
    const { data, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: claim.displayName } })
    const duplicate = Boolean(createError && (createError.code === 'email_exists' || createError.code === 'user_already_exists' || /user.*already|email.*already|already (?:been )?registered|already exists/i.test(createError.message)))
    if (createError && !duplicate) {
      const transient = !createError.status || createError.status >= 500 || createError.name === 'AuthRetryableFetchError'
      throw new SignupVerificationError(transient ? 'Your account could not be created right now. Please retry verification shortly.' : createError.message, transient ? 503 : 400)
    }
    if (!createError && !data.user) throw new SignupVerificationError('Your account could not be created right now. Please retry verification shortly.', 503)
    // A retry after a lost Auth response can find an already-created account.
    // Never update or delete it; require its password to sign in.
    accountExists = true
    await completeSignupVerification(admin, claim, true)
    claim = undefined
    let loginFailed = false
    try {
      const supabase = await createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      loginFailed = Boolean(error)
    } catch { loginFailed = true }
    if (duplicate && loginFailed) return NextResponse.json({ error: 'An account with this email already exists. Sign in or reset your password.' }, { status: 409 })
    return NextResponse.json({ success: true, redirectTo: loginFailed ? '/login' : '/', ...(loginFailed ? { message: 'Account created! Please sign in.' } : {}) })
  } catch (error: unknown) {
    if (claim && admin && !accountExists) {
      try { await completeSignupVerification(admin, claim, false) } catch { console.warn('Signup verification lease could not be released; it will expire automatically.') }
    }
    if (error instanceof SignupVerificationError) return NextResponse.json({ error: error.message }, { status: error.status, headers: error.retryAfterSeconds ? { 'Retry-After': String(error.retryAfterSeconds) } : undefined })
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Enter valid signup details.' }, { status: 400 })
    console.error('Signup verification could not be completed.')
    return NextResponse.json({ error: accountExists ? 'Your account may already be created. Please try signing in.' : 'Verification could not be completed. Please try again shortly.' }, { status: 503 })
  }
}
