'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, MessageSquare, Users, UserPlus, X, Check, Mail, Settings2, UserX, RotateCcw, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useChannels, useCreateDM } from '@/hooks/useChannels'
import { Avatar } from '@/components/ui/Avatar'
import type { Profile } from '@/types/database'
import { cn } from '@/lib/utils'

export default function PeoplePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [startingDM, setStartingDM] = useState<string | null>(null)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [managedProfile, setManagedProfile] = useState<Profile | null>(null)
  const createDM = useCreateDM()
  const { data: channels } = useChannels()

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    },
  })

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('display_name', { ascending: true })
      if (error) throw new Error(error.message)
      return data as Profile[]
    },
  })
  const isAdmin = currentUser?.app_metadata?.role === 'admin' || currentUser?.email === 'loop@bytechsol.com'
  const { data: memberAccess } = useQuery({
    queryKey: ['member-access'],
    enabled: Boolean(isAdmin),
    queryFn: async () => {
      const response = await fetch('/api/members')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load member access.')
      return data.members as MemberAccess[]
    },
  })

  const filtered = profiles?.filter((p) => {
    if (p.id === currentUser?.id) return false
    if (!search) return true
    return (
      p.display_name.toLowerCase().includes(search.toLowerCase()) ||
      p.email?.toLowerCase().includes(search.toLowerCase()) ||
      p.job_title?.toLowerCase().includes(search.toLowerCase())
    )
  }) ?? []

  const online = filtered.filter((p) => p.status === 'online')
  const offline = filtered.filter((p) => p.status !== 'online')

  const handleStartDM = async (userId: string) => {
    setStartingDM(userId)
    try {
      const channelId = await createDM.mutateAsync(userId)
      router.push(`/dm/${channelId}`)
    } finally {
      setStartingDM(null)
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: '#F8FAFC' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-white border-b border-[#E2E8F0]">
        <div className="px-4 sm:px-6 pt-5 sm:pt-7 pb-4 sm:pb-5">
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-[20px] sm:text-[22px] font-bold text-[#0F172A] tracking-tight">Team Directory</h1>
            {profiles && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-[#EFF6FF] text-[#3589FA]">
                <Users size={11} />
                {profiles.length - 1} members
              </span>
              )}
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setAddMemberOpen(true)}
                className="flex items-center gap-2 h-9 px-3.5 rounded-lg bg-[#3589FA] text-white text-[13px] font-semibold hover:bg-[#2778E6] transition-colors flex-shrink-0"
              >
                <UserPlus size={15} />
                <span className="hidden sm:inline">Add member</span>
              </button>
            )}
          </div>
          <p className="text-[12.5px] sm:text-[13px] text-[#64748B]">Find teammates, view profiles, and start conversations</p>
        </div>

        {/* Search */}
        <div className="px-4 sm:px-6 pb-4 sm:pb-5">
          <div className="relative max-w-lg">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, role, or email…"
              className="w-full pl-10 pr-4 h-9 text-[13.5px] border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#3589FA] focus:ring-3 focus:ring-[#3589FA]/15 transition-all bg-[#F8FAFC] placeholder-[#94A3B8] text-[#0F172A]"
            />
          </div>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin text-[#3589FA]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#EFF6FF] flex items-center justify-center mb-4">
              <Users size={24} className="text-[#3589FA]" />
            </div>
            <p className="text-[15px] font-semibold text-[#0F172A] mb-1">No people found</p>
            <p className="text-[13px] text-[#64748B]">
              {search ? `No results for "${search}"` : 'No other users in this workspace yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Online group */}
            {online.length > 0 && (
              <section>
                <SectionLabel label="Active now" count={online.length} dot="bg-[#36D7AE]" />
                <PeopleGrid profiles={online} startingDM={startingDM} onMessage={handleStartDM} isAdmin={Boolean(isAdmin)} onManage={setManagedProfile} access={memberAccess ?? []} />
              </section>
            )}

            {/* Offline group */}
            {offline.length > 0 && (
              <section>
                <SectionLabel label="Others" count={offline.length} dot="bg-[#CBD5E1]" />
                <PeopleGrid profiles={offline} startingDM={startingDM} onMessage={handleStartDM} isAdmin={Boolean(isAdmin)} onManage={setManagedProfile} access={memberAccess ?? []} />
              </section>
            )}
          </div>
        )}
      </div>

      {addMemberOpen && (
        <AddMemberModal
          channels={(channels ?? []).filter((channel) => channel.type === 'public')}
          onClose={() => setAddMemberOpen(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['profiles'] })
            void queryClient.invalidateQueries({ queryKey: ['profiles', 'all'] })
            void queryClient.invalidateQueries({ queryKey: ['channels'] })
          }}
        />
      )}
      {managedProfile && (
        <ManageMemberModal
          profile={managedProfile}
          access={(memberAccess ?? []).find((item) => item.id === managedProfile.id)}
          channels={(channels ?? []).filter((channel) => channel.type === 'public')}
          onClose={() => setManagedProfile(null)}
          onChanged={() => {
            void queryClient.invalidateQueries({ queryKey: ['profiles'] })
            void queryClient.invalidateQueries({ queryKey: ['member-access'] })
          }}
        />
      )}
    </div>
  )
}

type MemberAccess = { id: string; email?: string; role: 'member' | 'admin'; suspended: boolean; lastSignInAt?: string; createdAt: string; channelIds: string[] }

function ManageMemberModal({ profile, access, channels, onClose, onChanged }: { profile: Profile; access?: MemberAccess; channels: Array<{ id: string; name: string | null }>; onClose: () => void; onChanged: () => void }) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [jobTitle, setJobTitle] = useState(profile.job_title || 'Teammate')
  const [role, setRole] = useState<'member' | 'admin'>(access?.role ?? 'member')
  const [channelIds, setChannelIds] = useState<string[]>(access?.channelIds ?? [])
  const [loading, setLoading] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: string, permanent = false) => {
    if (permanent && !window.confirm(`Permanently remove ${profile.display_name}? This cannot be undone.`)) return
    setLoading(action); setError(null); setNotice(null)
    try {
      const response = await fetch(`/api/members/${profile.id}`, {
        method: permanent ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: permanent ? undefined : JSON.stringify({ action, displayName, jobTitle, role, channelIds }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Action failed.')
      setNotice(data.message)
      onChanged()
      if (permanent) onClose()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Action failed.') }
    finally { setLoading(null) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0F172A]/55 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[#E2E8F0] bg-white shadow-2xl overflow-hidden" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-5 py-4"><div><h2 className="font-bold text-[#0F172A]">Manage member</h2><p className="text-xs text-[#64748B]">{profile.email}</p></div><button onClick={onClose} className="p-2 text-[#94A3B8]"><X size={17} /></button></div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
          {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</div>}
          <div className="grid grid-cols-2 gap-3"><Field label="Full name"><input className="member-input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field><Field label="Job title"><input className="member-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} /></Field></div>
          <Field label="Workspace role"><select className="member-input" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')}><option value="member">Member</option><option value="admin">Admin</option></select></Field>
          <Field label="Public channel access"><div className="grid grid-cols-2 gap-2 rounded-lg border border-[#E2E8F0] p-3">{channels.map((channel) => <label key={channel.id} className="flex items-center gap-2 text-sm text-[#475569]"><input type="checkbox" checked={channelIds.includes(channel.id)} onChange={(e) => setChannelIds((old) => e.target.checked ? [...old, channel.id] : old.filter((id) => id !== channel.id))} />#{channel.name}</label>)}</div></Field>
          <button onClick={() => void run('update')} disabled={Boolean(loading)} className="w-full h-10 rounded-lg bg-[#3589FA] text-sm font-semibold text-white disabled:opacity-60">{loading === 'update' ? 'Saving…' : 'Save member access'}</button>
          <div className="border-t border-[#E2E8F0] pt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button onClick={() => void run('reset_password')} disabled={Boolean(loading)} className="h-9 rounded-lg border border-[#CBD5E1] text-xs font-semibold text-[#475569] flex items-center justify-center gap-2"><RotateCcw size={14} />Send password reset</button>
            <button onClick={() => void run(access?.suspended ? 'reactivate' : 'suspend')} disabled={Boolean(loading)} className="h-9 rounded-lg border border-amber-200 bg-amber-50 text-xs font-semibold text-amber-700 flex items-center justify-center gap-2"><UserX size={14} />{access?.suspended ? 'Reactivate member' : 'Suspend member'}</button>
            <button onClick={() => void run('delete', true)} disabled={Boolean(loading)} className="sm:col-span-2 h-9 rounded-lg border border-red-200 bg-red-50 text-xs font-semibold text-red-700 flex items-center justify-center gap-2"><Trash2 size={14} />Permanently remove member</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AddMemberModal({ channels, onClose, onCreated }: { channels: Array<{ id: string; name: string | null }>; onClose: () => void; onCreated: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('Teammate')
  const [accessRole, setAccessRole] = useState<'member' | 'admin'>('member')
  const [channelIds, setChannelIds] = useState<string[]>(() => channels.map((channel) => channel.id))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email, jobTitle, accessRole, channelIds }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create member.')
      setCreated(true)
      onCreated()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to create member.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0F172A]/55 backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#E2E8F0] overflow-hidden" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-[17px] font-bold text-[#0F172A]">{created ? 'Member created' : 'Add workspace member'}</h2>
            <p className="text-[12px] text-[#64748B] mt-0.5">{created ? 'A secure setup link was emailed to the member.' : 'Invite a teammate and choose their workspace access.'}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569]"><X size={17} /></button>
        </div>

        {created ? (
          <div className="p-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 mb-4">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-sm mb-3"><Check size={16} /> Invitation sent</div>
              <dl className="space-y-2 text-sm">
                <div><dt className="text-emerald-700 text-xs">Email</dt><dd className="font-medium text-[#0F172A] break-all">{email.trim().toLowerCase()}</dd></div>
                <div><dt className="text-emerald-700 text-xs">Next step</dt><dd className="font-medium text-[#0F172A]">The member chooses their own password from the secure email link.</dd></div>
              </dl>
            </div>
            <button type="button" onClick={onClose} className="w-full h-10 flex items-center justify-center gap-2 rounded-lg bg-[#0F172A] text-white text-sm font-semibold hover:bg-black"><Mail size={15} /> Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-4">
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name"><input required minLength={2} value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Jane Doe" className="member-input" /></Field>
              <Field label="Work email"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@bytechsol.com" className="member-input" /></Field>
              <Field label="Job title"><input required value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="Software Engineer" className="member-input" /></Field>
              <Field label="Workspace access">
                <select value={accessRole} onChange={(e) => setAccessRole(e.target.value as 'member' | 'admin')} className="member-input">
                  <option value="member">Member</option><option value="admin">Admin</option>
                </select>
              </Field>
            </div>
            <Field label="Public channels">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#E2E8F0] p-3">
                {channels.map((channel) => (
                  <label key={channel.id} className="flex items-center gap-2 text-sm text-[#475569]">
                    <input type="checkbox" checked={channelIds.includes(channel.id)} onChange={(event) => setChannelIds((old) => event.target.checked ? [...old, channel.id] : old.filter((id) => id !== channel.id))} />
                    #{channel.name}
                  </label>
                ))}
              </div>
            </Field>
            <p className="text-[11px] text-[#94A3B8]">A one-time secure invitation is emailed. The member creates their own password; admins never handle it.</p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-[#CBD5E1] text-sm font-medium text-[#475569] hover:bg-[#F8FAFC]">Cancel</button>
              <button type="submit" disabled={loading} className="h-9 px-4 rounded-lg bg-[#3589FA] text-white text-sm font-semibold hover:bg-[#2778E6] disabled:opacity-60 flex items-center gap-2">{loading && <Loader2 size={14} className="animate-spin" />}Create member</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[12px] font-semibold text-[#475569] mb-1.5">{label}</span>{children}</label>
}

function SectionLabel({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={cn('w-2 h-2 rounded-full flex-shrink-0', dot)} />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-[#94A3B8]">{label}</span>
      <span className="text-[11px] text-[#CBD5E1] font-medium">{count}</span>
      <div className="flex-1 h-px bg-[#F1F5F9]" />
    </div>
  )
}

function PeopleGrid({
  profiles,
  startingDM,
  onMessage,
  isAdmin,
  onManage,
  access,
}: {
  profiles: Profile[]
  startingDM: string | null
  onMessage: (id: string) => void
  isAdmin: boolean
  onManage: (profile: Profile) => void
  access: MemberAccess[]
}) {
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {profiles.map((profile) => (
        <PersonCard
          key={profile.id}
          profile={profile}
          loading={startingDM === profile.id}
          onMessage={() => onMessage(profile.id)}
          isAdmin={isAdmin}
          suspended={Boolean(access.find((item) => item.id === profile.id)?.suspended)}
          canManage={access.some((item) => item.id === profile.id)}
          onManage={() => onManage(profile)}
        />
      ))}
    </div>
  )
}

function PersonCard({
  profile,
  loading,
  onMessage,
  isAdmin,
  suspended,
  canManage,
  onManage,
}: {
  profile: Profile
  loading: boolean
  onMessage: () => void
  isAdmin: boolean
  suspended: boolean
  canManage: boolean
  onManage: () => void
}) {
  const isOnline = profile.status === 'online'

  return (
    <div className="group relative bg-white rounded-2xl border border-[#E2E8F0] hover:border-[#C7D7F4] hover:shadow-[0_4px_20px_rgba(53,137,250,0.08)] transition-all duration-200 overflow-hidden">
      {/* Top accent bar — slides in on hover */}
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#3589FA] to-[#36D7AE] opacity-0 group-hover:opacity-100 transition-opacity duration-200" />

      <div className="p-5">
        {/* Avatar + status */}
        <div className="flex items-start justify-between mb-3">
          <div className="relative">
            <Avatar
              src={profile.avatar_url}
              name={profile.display_name}
              size={52}
              square={false}
            />
            {/* Online indicator */}
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white',
                isOnline ? 'bg-[#36D7AE]' : 'bg-[#CBD5E1]'
              )}
            />
          </div>

          {/* Role pill */}
          <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold max-w-[90px] truncate', suspended ? 'bg-red-50 text-red-600' : 'bg-[#F1F5F9] text-[#64748B]')}>
            {suspended ? 'Suspended' : profile.job_title || 'Teammate'}
          </span>
        </div>

        {/* Name */}
        <h3 className="text-[14.5px] font-bold text-[#0F172A] truncate leading-snug mb-0.5">
          {profile.display_name}
        </h3>

        {/* Email */}
        <p className="text-[12px] text-[#94A3B8] truncate">{profile.email}</p>
      </div>

      {/* Footer action */}
      <div className="px-5 pb-4">
        {isAdmin && <button type="button" onClick={onManage} disabled={!canManage} className="mb-2 w-full flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#E2E8F0] text-[12px] font-semibold text-[#64748B] hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-wait"><Settings2 size={13} />Manage</button>}
        <button
          type="button"
          onClick={onMessage}
          disabled={loading}
          className={cn(
            'w-full flex items-center justify-center gap-1.5 h-8 rounded-lg text-[12.5px] font-semibold transition-all duration-150',
            loading
              ? 'bg-[#EFF6FF] text-[#3589FA] cursor-not-allowed'
              : 'bg-[#F1F5F9] text-[#475569] hover:bg-[#3589FA] hover:text-white group-hover:bg-[#3589FA] group-hover:text-white'
          )}
        >
          {loading ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <>
              <MessageSquare size={13} />
              Message
            </>
          )}
        </button>
      </div>
    </div>
  )
}
