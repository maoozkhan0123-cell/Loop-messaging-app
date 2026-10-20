import { NextResponse } from 'next/server'
import { verifyOTP, deleteOTP } from '@/lib/otpStore'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json()

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and OTP code are required' }, { status: 400 })
    }

    const verification = verifyOTP(String(email), String(code))
    if (!verification.ok || !verification.record) {
      return NextResponse.json(
        { error: verification.reason === 'locked' ? 'Too many incorrect attempts. Request a new code.' : 'Verification code is expired or incorrect.' },
        { status: 400 }
      )
    }
    const record = verification.record

    // 1. Create account via Supabase Admin API with email_confirm = true (bypasses Supabase default emails!)
    const admin = createAdminClient()
    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email,
      password: record.password,
      email_confirm: true,
      user_metadata: {
        display_name: record.displayName,
      },
    })

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    // Delete used OTP
    deleteOTP(email)

    // 2. Log in the newly registered user to set cookies
    const supabase = await createClient()
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password: record.password,
    })

    if (loginError) {
      return NextResponse.json({ success: true, message: 'Account created! Please sign in.' })
    }

    return NextResponse.json({ success: true, user: newUser.user })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to verify code and create account'
    console.error('Verify OTP Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
