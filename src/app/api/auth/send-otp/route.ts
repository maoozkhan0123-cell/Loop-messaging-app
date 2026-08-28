import { NextResponse } from 'next/server'
import { setOTP } from '@/lib/otpStore'
import { sendOTPEmail } from '@/lib/email'

export async function POST(request: Request) {
  try {
    const { email, displayName, password } = await request.json()

    if (!email || !password || !displayName) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 })
    }

    // Generate random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    // Store OTP in memory
    setOTP(email, { code, displayName, password })

    // Send email via Hostinger SMTP (info@stackdsol.com)
    await sendOTPEmail({
      to: email,
      code,
      name: displayName,
    })

    return NextResponse.json({ success: true, message: 'Verification code sent to your email' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to send verification code'
    console.error('Send OTP Error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
