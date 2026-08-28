'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Mail, Lock, User } from 'lucide-react'

export default function SignupPage() {
  const router = useRouter()
  const supabase = createClient()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { display_name: displayName }, emailRedirectTo: `${window.location.origin}/` },
    })
    if (error) { setError(error.message); setLoading(false); return }
    if (data.user && !data.session) setSuccess(true)
    else if (data.session) { router.push('/'); router.refresh() }
    setLoading(false)
  }

  const focusStyle = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#3589FA')
  const blurStyle  = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor = '#E5E7EB')

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#F0F4F8' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image src="/huddle.svg" alt="Huddle" width={200} height={60} priority />
        </div>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-[#000000] mb-1">Create your account</h1>
          <p className="text-sm text-[#6B7280] mb-6">Join your team on Huddle</p>

          {success ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: '#F4F4F5' }}>
                <Mail size={20} style={{ color: '#000000' }} />
              </div>
              <h3 className="font-medium text-[#000000] mb-1">Confirm your email</h3>
              <p className="text-sm text-[#6B7280]">
                We sent a confirmation link to <strong>{email}</strong>.<br />Check your inbox to get started.
              </p>
              <Link href="/login" className="mt-4 inline-block text-sm font-semibold hover:underline text-[#000000]">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4">
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
                    className="w-full pl-9 pr-3 h-9 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none transition-colors"
                    onFocus={focusStyle} onBlur={blurStyle} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">Work email</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com" required
                    className="w-full pl-9 pr-3 h-9 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none transition-colors"
                    onFocus={focusStyle} onBlur={blurStyle} />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#374151] mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters" required minLength={8}
                    className="w-full pl-9 pr-3 h-9 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none transition-colors"
                    onFocus={focusStyle} onBlur={blurStyle} />
                </div>
              </div>

              <button
                type="submit" disabled={loading}
                className="w-full h-9 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: '#000000' }}
              >
                {loading && <Loader2 size={14} className="animate-spin" />}
                Create account
              </button>
            </form>
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
