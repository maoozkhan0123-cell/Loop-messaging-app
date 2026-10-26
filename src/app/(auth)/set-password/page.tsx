'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

export default function SetPasswordPage() {
  const supabase = createClient()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [complete, setComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const prepare = async () => {
      try {
        const code = new URLSearchParams(window.location.search).get('code')
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) throw exchangeError
        }
        const { data } = await supabase.auth.getSession()
        if (!mounted) return
        setReady(Boolean(data.session))
        if (!data.session) setError('This setup link is invalid or has expired. Ask your workspace admin to send a new one.')
      } catch (err: unknown) {
        if (mounted) setError(err instanceof Error ? err.message : 'This setup link is invalid or has expired.')
      } finally {
        if (mounted) setChecking(false)
      }
    }
    void prepare()
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      if (mounted && session) {
        setReady(true)
        setChecking(false)
        setError(null)
      }
    })
    return () => {
      mounted = false
      listener.subscription.unsubscribe()
    }
  }, [supabase])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      setError('Use at least 12 characters with uppercase, lowercase, a number, and a symbol.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }
    await supabase.auth.signOut()
    setComplete(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[#E2E8F0] bg-white p-6 sm:p-8 shadow-xl shadow-slate-200/50">
        <div className="flex justify-center mb-7"><Image src="/bysync.svg" alt="BySync" width={210} height={68} priority /></div>
        {checking ? (
          <div className="flex flex-col items-center py-12 text-[#64748B]"><Loader2 className="animate-spin mb-3 text-[#3589FA]" /><p className="text-sm">Verifying your secure link…</p></div>
        ) : complete ? (
          <div className="text-center py-5">
            <CheckCircle2 size={52} className="mx-auto text-emerald-500 mb-4" />
            <h1 className="text-2xl font-bold text-[#0F172A]">Password created</h1>
            <p className="text-sm text-[#64748B] mt-2 mb-6">Your BySync account is ready. Sign in with your work email and new password.</p>
            <Link href="/login" className="flex h-11 items-center justify-center rounded-lg bg-[#3589FA] text-sm font-semibold text-white hover:bg-[#2778E6]">Continue to sign in</Link>
          </div>
        ) : (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#3589FA] mb-4"><LockKeyhole size={22} /></div>
            <h1 className="text-2xl font-bold text-[#0F172A]">Create your password</h1>
            <p className="text-sm text-[#64748B] mt-1 mb-6">Choose a strong, private password for your company account.</p>
            {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>}
            {ready && (
              <form onSubmit={submit} className="space-y-4">
                <label className="block"><span className="block text-xs font-semibold text-[#475569] mb-1.5">New password</span><div className="relative"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required className="member-input pr-11" /><button type="button" onClick={() => setShowPassword((old) => !old)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8]">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
                <label className="block"><span className="block text-xs font-semibold text-[#475569] mb-1.5">Confirm password</span><input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="member-input" /></label>
                <p className="text-[11px] leading-relaxed text-[#94A3B8]">Minimum 12 characters, including uppercase, lowercase, a number, and a symbol.</p>
                <button disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#3589FA] text-sm font-semibold text-white hover:bg-[#2778E6] disabled:opacity-60">{loading && <Loader2 size={15} className="animate-spin" />}Create password</button>
              </form>
            )}
            {!ready && <Link href="/login" className="mt-4 flex h-10 items-center justify-center rounded-lg border border-[#CBD5E1] text-sm font-semibold text-[#475569]">Back to sign in</Link>}
          </>
        )}
      </div>
    </div>
  )
}
