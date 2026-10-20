'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export default function LoginPage() {
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'email' | 'password'>('email')
  const [loading, setLoading] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)

  const handleEmailContinue = (e: React.FormEvent) => {
    e.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return
    setEmail(normalizedEmail)
    setError(null)
    setStep('password')
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setLoading(false)
    if (error) setError(error.message)
    else window.location.href = '/'
  }

  const handleMagicLink = async () => {
    if (!email) { setError('Enter your email address first'); return }
    setError(null)
    setMagicLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
    })
    setMagicLoading(false)
    if (error) setError(error.message)
    else setMagicSent(true)
  }

  if (magicSent) {
    return (
      <PageShell>
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#EBF5FF' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3589FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          </div>
          <h2 className="text-[22px] font-bold text-[#1D1C1D] mb-2">Check your email</h2>
          <p className="text-[15px] text-[#616061] mb-6">
            We sent a magic link to <strong className="text-[#1D1C1D]">{email}</strong>
          </p>
          <button
            type="button"
            onClick={() => { setMagicSent(false); setStep('email') }}
            className="text-[14px] font-semibold hover:underline"
            style={{ color: '#1264A3' }}
          >
            Back to sign in
          </button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      {step === 'email' ? (
        <>
          <h1 className="text-[28px] font-black text-[#1D1C1D] text-center leading-tight mb-2">
            Enter your email address<br />to sign in
          </h1>
          <p className="text-[15px] text-[#616061] text-center mb-7">
            Or choose another way to sign in.
          </p>

          {error && (
            <div className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailContinue} className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@work-email.com"
              required
              autoFocus
              className="w-full h-[44px] px-4 text-[15px] border border-[#DDDDDD] rounded-md focus:outline-none focus:ring-2 focus:ring-[#1264A3] focus:border-transparent placeholder-[#AAAAAA] text-[#1D1C1D]"
            />
            <button
              type="submit"
              className="w-full h-[44px] text-white text-[15px] font-bold rounded-md transition-opacity hover:opacity-90"
              style={{ background: '#3589FA' }}
            >
              Sign in with email
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#DDDDDD]" />
            <span className="text-[11px] font-semibold text-[#616061] tracking-widest">OR SIGN IN WITH</span>
            <div className="flex-1 h-px bg-[#DDDDDD]" />
          </div>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={magicLoading || !email.trim()}
            className="w-full flex items-center justify-center gap-2 h-[44px] border border-[#DDDDDD] rounded-md text-[14px] font-medium text-[#1D1C1D] hover:bg-[#F8F8F8] transition-colors disabled:opacity-60"
          >
            {magicLoading && <Loader2 size={16} className="animate-spin" />}
            Email me a magic link
          </button>

          <p className="text-center text-[13px] text-[#616061] mt-7">
            Having trouble?{' '}
            <Link href="/signup" className="font-medium hover:underline" style={{ color: '#1264A3' }}>
              Create an account
            </Link>
          </p>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => { setStep('email'); setError(null) }}
            className="flex items-center gap-1.5 text-[13px] mb-5 hover:underline"
            style={{ color: '#1264A3' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back
          </button>

          <h1 className="text-[26px] font-black text-[#000000] mb-1">Sign in to Loop</h1>
          <p className="text-[14px] text-[#616061] mb-6">
            Signing in as <strong className="text-[#000000]">{email}</strong>
          </p>

          {error && (
            <div className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="block text-[13px] font-semibold text-[#000000] mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoFocus
                className="w-full h-[44px] px-4 text-[15px] border border-[#DDDDDD] rounded-md focus:outline-none focus:ring-2 focus:ring-[#000000] focus:border-transparent text-[#000000]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[44px] text-white text-[15px] font-bold rounded-md transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: '#000000' }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Sign in
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-[#DDDDDD]" />
            <span className="text-[11px] font-semibold text-[#616061] tracking-widest">OR</span>
            <div className="flex-1 h-px bg-[#DDDDDD]" />
          </div>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={magicLoading}
            className="w-full h-[44px] border border-[#DDDDDD] rounded-md text-[14px] font-medium text-[#000000] hover:bg-[#F8F8F8] transition-colors disabled:opacity-60 flex items-center justify-center gap-2 mb-4"
          >
            {magicLoading && <Loader2 size={14} className="animate-spin" />}
            Send a magic link instead
          </button>

          <p className="text-center text-xs text-[#616061] mt-4">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-bold text-[#000000] hover:underline">
              Create account
            </Link>
          </p>
        </>
      )}
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-white">
      <div className="w-full max-w-[400px]">
        {/* Loop logo */}
        <div className="flex justify-center mb-8">
          <Image src="/loop.svg" alt="Loop" width={220} height={66} priority />
        </div>

        {children}
      </div>
    </div>
  )
}
