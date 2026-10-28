'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [step, setStep] = useState<'email' | 'password'>('email')
  const [loading, setLoading] = useState(false)
  const [magicLoading, setMagicLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [magicSent, setMagicSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
    else router.replace('/')
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

  const handleForgotPassword = async () => {
    setError(null)
    setResetLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/set-password`,
    })
    setResetLoading(false)
    if (resetError) setError(resetError.message)
    else setResetSent(true)
  }

  if (magicSent) {
    return (
      <PageShell>
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: '#EBF5FF' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3589FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
          </div>
          <h2 className="mb-2 text-[22px] font-bold text-[var(--foreground)]">Check your email</h2>
          <p className="mb-6 text-[15px] text-[var(--muted-foreground)]">
            We sent a magic link to <strong className="text-[var(--foreground)]">{email}</strong>
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
          <h1 className="mb-2 text-center text-[28px] font-black leading-tight text-[var(--foreground)]">
            Enter your email address<br />to sign in
          </h1>
          <p className="mb-7 text-center text-[15px] text-[var(--muted-foreground)]">
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
              className="h-11 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] px-4 text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]"
            />
            <button
              type="submit"
              className="w-full h-[44px] text-white text-[15px] font-bold rounded-md transition-opacity hover:opacity-90"
              style={{ background: 'var(--primary)' }}
            >
              Sign in with email
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-[var(--ui-border)]" />
            <span className="text-[11px] font-semibold tracking-widest text-[var(--muted-foreground)]">OR SIGN IN WITH</span>
            <div className="h-px flex-1 bg-[var(--ui-border)]" />
          </div>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={magicLoading || !email.trim()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] text-[14px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-60"
          >
            {magicLoading && <Loader2 size={16} className="animate-spin" />}
            Email me a magic link
          </button>

          <p className="mt-7 text-center text-[13px] text-[var(--muted-foreground)]">
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

          <h1 className="mb-1 text-[26px] font-black text-[var(--foreground)]">Sign in to BySync</h1>
          <p className="mb-6 text-[14px] text-[var(--muted-foreground)]">
            Signing in as <strong className="text-[var(--foreground)]">{email}</strong>
          </p>

          {error && (
            <div className="mb-4 text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between"><label className="block text-[13px] font-semibold text-[var(--foreground)]">Password</label><button type="button" onClick={handleForgotPassword} disabled={resetLoading} className="text-xs font-semibold text-[var(--primary)] hover:underline disabled:opacity-60">{resetLoading ? 'Sending…' : 'Forgot password?'}</button></div>
              <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoFocus
                className="h-11 w-full rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] px-4 pr-11 text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
              <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-[44px] text-white text-[15px] font-bold rounded-md transition-opacity hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: 'var(--primary)' }}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Sign in
            </button>
          </form>

          {resetSent && <div className="mt-3 text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">Password reset link sent. Please check your email.</div>}

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-[var(--ui-border)]" />
            <span className="text-[11px] font-semibold tracking-widest text-[var(--muted-foreground)]">OR</span>
            <div className="h-px flex-1 bg-[var(--ui-border)]" />
          </div>

          <button
            type="button"
            onClick={handleMagicLink}
            disabled={magicLoading}
            className="mb-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--ui-border)] text-[14px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-60"
          >
            {magicLoading && <Loader2 size={14} className="animate-spin" />}
            Send a magic link instead
          </button>

          <p className="mt-4 text-center text-xs text-[var(--muted-foreground)]">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-bold text-[var(--foreground)] hover:underline">
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--app-bg)] px-4 py-8">
      <main className="w-full max-w-[430px] rounded-2xl border border-[var(--ui-border)] bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-md)] sm:p-8">
        {/* BySync logo */}
        <div className="mb-8 flex justify-center">
          <span className="inline-flex rounded-xl bg-white px-3 py-1.5 shadow-sm">
            <Image src="/bysync.svg" alt="BySync" width={200} height={64} priority />
          </span>
        </div>

        {children}
      </main>
    </div>
  )
}
