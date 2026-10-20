'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Camera, Loader2, Check, ArrowLeft, LogOut, User, Briefcase } from 'lucide-react'
import { useProfile, useUpdateProfile } from '@/hooks/useProfile'
import { Avatar } from '@/components/ui/Avatar'
import { createClient } from '@/lib/supabase/client'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const { data: profile, isLoading } = useProfile()
  const updateProfile = useUpdateProfile()

  const [displayName, setDisplayName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [status, setStatus] = useState<'online' | 'away' | 'offline'>('online')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Populate form from loaded profile
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? '')
      setJobTitle(profile.job_title ?? '')
      setStatus((profile.status as 'online' | 'away' | 'offline') ?? 'online')
    }
  }, [profile])

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Avatar must be under 5 MB'); return }
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim()) { setError('Display name is required'); return }
    setError(null)
    setUploading(true)

    try {
      let avatar_url = profile?.avatar_url ?? null

      // Upload new avatar if selected
      if (avatarFile) {
        const ext = avatarFile.name.split('.').pop()
        const path = `${profile?.id}/avatar-${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type })

        if (uploadErr) throw new Error(uploadErr.message)

        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
        avatar_url = urlData.publicUrl
      }

      await updateProfile.mutateAsync({
        display_name: displayName.trim(),
        job_title: jobTitle.trim() || undefined,
        status,
        ...(avatar_url !== profile?.avatar_url ? { avatar_url } : {}),
      })

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      setAvatarFile(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile')
    } finally {
      setUploading(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-[#3589FA]" />
      </div>
    )
  }

  const currentAvatar = avatarPreview ?? profile?.avatar_url ?? null
  const currentName = displayName || profile?.display_name || 'User'

  return (
    <div className="flex flex-1 flex-col bg-[#F8FAFB] min-h-0 overflow-y-auto">

      {/* ── Header ── */}
      <div className="bg-white border-b border-[#E8EAED] flex items-center gap-3 px-6 h-[49px] flex-shrink-0">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-[#5F6368] hover:text-[#1A1A2E] transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
        <div className="h-4 w-px bg-[#E8EAED]" />
        <h1 className="text-[15px] font-semibold text-[#1A1A2E]">Profile & Settings</h1>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg">

          {/* Avatar section */}
          <div className="bg-white rounded-2xl border border-[#E8EAED] shadow-sm p-6 mb-4">
            <div className="flex items-center gap-5">
              {/* Avatar with upload overlay */}
              <div className="relative flex-shrink-0 group">
                <Avatar src={currentAvatar} name={currentName} size={80} square />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Change avatar"
                >
                  <Camera size={20} className="text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  hidden
                  onChange={handleAvatarChange}
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#1A1A2E] text-[15px] truncate">{currentName}</p>
                <p className="text-sm text-[#5F6368] truncate">{profile?.email}</p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-xs font-medium text-[#3589FA] hover:text-[#2575E8] hover:underline transition-colors"
                >
                  Change photo
                </button>
              </div>
            </div>
          </div>

          {/* Edit form */}
          <form onSubmit={handleSave} className="bg-white rounded-2xl border border-[#E8EAED] shadow-sm p-6 space-y-5">
            <h2 className="text-sm font-semibold text-[#1A1A2E] uppercase tracking-wide">Personal Info</h2>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {/* Display name */}
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1.5 flex items-center gap-1.5">
                <User size={12} />
                Display name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
                className="w-full h-9 px-3 text-sm border border-[#E8EAED] rounded-lg focus:outline-none focus:border-[#3589FA] transition-colors text-[#1A1A2E]"
              />
            </div>

            {/* Job title */}
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1.5 flex items-center gap-1.5">
                <Briefcase size={12} />
                Job title <span className="text-[#9AA0A6] font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Software Engineer"
                className="w-full h-9 px-3 text-sm border border-[#E8EAED] rounded-lg focus:outline-none focus:border-[#3589FA] transition-colors text-[#1A1A2E]"
              />
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium text-[#374151] mb-1.5">Status</label>
              <div className="flex gap-2">
                {(['online', 'away', 'offline'] as const).map((s) => {
                  const color = s === 'online' ? '#36D7AE' : s === 'away' ? '#F59E0B' : '#9AA0A6'
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={cn(
                        'flex items-center gap-1.5 h-8 px-3 rounded-lg border text-sm font-medium transition-all capitalize',
                        status === s
                          ? 'border-[#3589FA] bg-[#EBF5FF] text-[#3589FA]'
                          : 'border-[#E8EAED] text-[#5F6368] hover:border-[#D1D5DB]'
                      )}
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                      {s}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Save button */}
            <div className="flex items-center justify-between pt-2 border-t border-[#F3F4F6]">
              <button
                type="submit"
                disabled={uploading || updateProfile.isPending}
                className="flex items-center gap-2 h-9 px-5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
                style={{ background: '#3589FA' }}
              >
                {(uploading || updateProfile.isPending) && <Loader2 size={14} className="animate-spin" />}
                {saved ? <><Check size={14} /> Saved!</> : 'Save changes'}
              </button>

              {saved && (
                <span className="text-sm text-[#36D7AE] font-medium flex items-center gap-1">
                  <Check size={14} /> Changes saved
                </span>
              )}
            </div>
          </form>

          {/* Sign out */}
          <div className="mt-4 bg-white rounded-2xl border border-[#E8EAED] shadow-sm p-4">
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-2 text-sm text-red-500 hover:text-red-600 font-medium transition-colors"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}

// local cn helper
function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
