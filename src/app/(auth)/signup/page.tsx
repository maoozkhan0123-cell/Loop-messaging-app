'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Loader2, Mail, Lock, User, KeyRound, ArrowLeft } from 'lucide-react'

export default function SignupPage() {
  const router = useRouter()

  const [step, setStep] = useState<'details' | 'otp'>('details')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)

  // Step 1: Send OTP via Hostinger SMTP (info@Bytechsol.com)
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName, password }),
      })

      const text = await res.text()
      let data: Record<string, unknown> = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        throw new Error('Server returned an unexpected response. Please try again.')
      }

      if (!res.ok) {
        throw new Error((data.error as string) || 'Failed to send verification code')
      }

      setInfoMsg(`Verification code sent to ${email} from info@Bytechsol.com`)
      setStep('otp')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  // Step 2: Verify OTP & Create Account
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/signup-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otpCode }),
      })

      const text = await res.text()
      let data: Record<string, unknown> = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        throw new Error('Server returned an unexpected response. Please try again.')
      }

      if (!res.ok) {
        throw new Error((data.error as string) || 'Failed to verify code')
      }

      // Success -> Redirect to workspace
      router.push('/')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed')
    } finally {
      setLoading(false)
    }
  }

  const focusStyle = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#000000')
  const blurStyle  = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#E5E7EB')

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#FAFAFA]">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="/bysync.svg" alt="BySync" width={220} height={71} priority />
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-xs">
          {step === 'details' ? (
            <>
              <h1 className="text-lg font-bold text-[#000000] mb-1">Create your account</h1>
              <p className="text-sm text-[#6B7280] mb-6">Join your team on BySync</p>

              <form onSubmit={handleSendOTP} className="space-y-4">
                {error && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1.5">Full name</label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Jane Doe" required
                      className="w-full pl-9 pr-3 h-9 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none transition-colors text-black bg-white"
                      onFocus={focusStyle} onBlur={blurStyle} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1.5">Work email</label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@Bytechsol.com" required
                      className="w-full pl-9 pr-3 h-9 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none transition-colors text-black bg-white"
                      onFocus={focusStyle} onBlur={blurStyle} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1.5">Password</label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters" required minLength={8}
                      className="w-full pl-9 pr-3 h-9 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none transition-colors text-black bg-white"
                      onFocus={focusStyle} onBlur={blurStyle} />
                  </div>
                </div>

                <button
                  type="submit" disabled={loading}
                  className="w-full h-9 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: '#000000' }}
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Send Verification Code
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setStep('details'); setError(null) }}
                className="flex items-center gap-1 text-xs text-[#6B7280] hover:text-black mb-4 transition-colors cursor-pointer"
              >
                <ArrowLeft size={13} /> Back
              </button>

              <h1 className="text-lg font-bold text-[#000000] mb-1">Enter Verification Code</h1>
              <p className="text-xs text-[#6B7280] mb-6">
                We sent a 6-digit verification code from <strong>info@Bytechsol.com</strong> to <strong>{email}</strong>.
              </p>

              {infoMsg && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mb-4">
                  {infoMsg}
                </div>
              )}

              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-2.5 mb-4">
                  {error}
                </div>
              )}

              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#374151] mb-1.5">6-Digit Code</label>
                  <div className="relative">
                    <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                    <input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="123456" maxLength={6} required autoFocus
                      className="w-full pl-9 pr-3 h-10 text-base font-mono tracking-widest border border-[#E5E7EB] rounded-lg focus:outline-none transition-colors text-center text-black bg-white"
                      onFocus={focusStyle} onBlur={blurStyle} />
                  </div>
                </div>

                <button
                  type="submit" disabled={loading}
                  className="w-full h-9 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: '#000000' }}
                >
                  {loading && <Loader2 size={14} className="animate-spin" />}
                  Verify & Create Account
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-[#6B7280] mt-4">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold hover:underline text-[#000000]">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
