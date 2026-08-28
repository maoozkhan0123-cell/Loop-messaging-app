import { NextResponse } from 'next/server'
import { getOTP, deleteOTP } from '@/lib/otpStore'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json()

    if (!email || !code) {
      return NextResponse.json({ error: 'Email and OTP code are required' }, { status: 400 })
    }

    const record = getOTP(email)
    if (!record) {
      return NextResponse.json(
        { error: 'Verification code has expired or is invalid. Please request a new code.' },
        { status: 400 }
      )
    }

    if (record.code !== code.trim()) {
      return NextResponse.json({ error: 'Incorrect verification code. Please check your email.' }, { status: 400 })
    }

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
