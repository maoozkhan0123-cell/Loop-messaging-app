import { NextResponse } from 'next/server'
import { setOTP } from '@/lib/otpStore'
import { sendOTPEmail } from '@/lib/email'
import { randomInt } from 'node:crypto'

const requests = new Map<string, { count: number; resetAt: number }>()

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const displayName = String(body.displayName ?? '').trim()
    const password = String(body.password ?? '')

    if (!email || !password || !displayName) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 })
    }

    const now = Date.now()
    const limit = requests.get(email)
    if (limit && limit.resetAt > now && limit.count >= 3) {
      return NextResponse.json({ error: 'Too many verification requests. Try again in 15 minutes.' }, { status: 429 })
    }
    requests.set(email, !limit || limit.resetAt <= now
      ? { count: 1, resetAt: now + 15 * 60 * 1000 }
      : { ...limit, count: limit.count + 1 })

    // Generate random 6-digit code
    const code = randomInt(100000, 1000000).toString()

    // Store OTP in memory
    setOTP(email, { code, displayName, password })

    // Send email via Hostinger SMTP (info@Bytechsol.com)
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
