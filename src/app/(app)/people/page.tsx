'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Mail, RotateCcw, Trash2, UserX, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useChannels, useCreateDM } from '@/hooks/useChannels'
import { useToast } from '@/components/ui/Toaster'
import { ProfileDialog, TeamDirectory } from '@/components/team-directory/TeamDirectory'
import type { DirectoryMember } from '@/components/team-directory/directory'
import type { Profile } from '@/types/database'

type WorkspaceRole = 'member' | 'admin' | 'ceo'
type MemberAccess = { id: string; email?: string; role: WorkspaceRole; suspended: boolean; lastSignInAt?: string; createdAt: string; channelIds: string[] }

export default function PeoplePage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const supabase = createClient()
  const { toast } = useToast()
  const [startingDM, setStartingDM] = useState<string | null>(null)
  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [managedProfile, setManagedProfile] = useState<DirectoryMember | null>(null)
  const [viewedProfile, setViewedProfile] = useState<DirectoryMember | null>(null)
  const createDM = useCreateDM()
  const { data: channels } = useChannels()

  const { data: currentUser } = useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error
      return user
    },
  })
  const isAdmin = currentUser?.app_metadata?.role === 'admin' || currentUser?.email === 'loop@bytechsol.com'

  const profilesQuery = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('display_name', { ascending: true })
      if (error) throw new Error(error.message)
      return data as Profile[]
    },
  })

  const { data: memberAccess = [] } = useQuery({
    queryKey: ['member-access'],
    enabled: Boolean(isAdmin),
    queryFn: async () => {
      const response = await fetch('/api/members')
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load member access.')
      return data.members as MemberAccess[]
    },
  })

  const accessMap = new Map(memberAccess.map((item) => [item.id, item]))
  const members: DirectoryMember[] = (profilesQuery.data ?? [])
    .filter((profile) => profile.id !== currentUser?.id)
    .map((profile) => ({
      ...profile,
      workspaceRole: accessMap.get(profile.id)?.role,
      suspended: accessMap.get(profile.id)?.suspended ?? false,
      canManage: Boolean(isAdmin && accessMap.has(profile.id)),
    }))

  const handleStartDM = async (member: DirectoryMember) => {
    if (startingDM) return
    setStartingDM(member.id)
    try {
      const channelId = await createDM.mutateAsync(member.id)
      router.push(`/dm/${channelId}`)
    } catch (error: unknown) {
      toast({ title: 'Could not start conversation', description: error instanceof Error ? error.message : 'Please try again.', type: 'error' })
    } finally {
      setStartingDM(null)
    }
  }

  const copyEmail = async (member: DirectoryMember) => {
    try {
      await navigator.clipboard.writeText(member.email)
      toast({ title: 'Email copied', description: member.email, type: 'success' })
    } catch {
      toast({ title: 'Could not copy email', description: 'Copy it manually from the member profile.', type: 'error' })
    }
  }

  const closeProfile = useCallback(() => setViewedProfile(null), [])
  const refreshMembers = () => {
    void queryClient.invalidateQueries({ queryKey: ['profiles'] })
    void queryClient.invalidateQueries({ queryKey: ['profiles', 'all'] })
    void queryClient.invalidateQueries({ queryKey: ['member-access'] })
  }
  const publicChannels = (channels ?? []).filter((channel) => channel.type === 'public')

  return <>
    <TeamDirectory
      members={members}
      loading={profilesQuery.isLoading}
      error={profilesQuery.error instanceof Error ? profilesQuery.error.message : null}
      canInvite={Boolean(isAdmin)}
      messagingMemberId={startingDM}
      onRetry={() => void profilesQuery.refetch()}
      onInvite={() => setAddMemberOpen(true)}
      onView={setViewedProfile}
      onMessage={(member) => void handleStartDM(member)}
      onManage={setManagedProfile}
      onCopyEmail={(member) => void copyEmail(member)}
    />
    {viewedProfile && <ProfileDialog member={viewedProfile} messaging={startingDM === viewedProfile.id} onClose={closeProfile} onMessage={() => void handleStartDM(viewedProfile)} onCopyEmail={() => void copyEmail(viewedProfile)} />}
    {addMemberOpen && <AddMemberModal channels={publicChannels} onClose={() => setAddMemberOpen(false)} onCreated={refreshMembers} />}
    {managedProfile && <ManageMemberModal profile={managedProfile} access={accessMap.get(managedProfile.id)} channels={publicChannels} onClose={() => setManagedProfile(null)} onChanged={refreshMembers} />}
  </>
}

function ManageMemberModal({ profile, access, channels, onClose, onChanged }: { profile: Profile; access?: MemberAccess; channels: Array<{ id: string; name: string | null }>; onClose: () => void; onChanged: () => void }) {
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [jobTitle, setJobTitle] = useState(profile.job_title || 'Teammate')
  const [role, setRole] = useState<WorkspaceRole>(access?.role ?? 'member')
  const [channelIds, setChannelIds] = useState<string[]>(access?.channelIds ?? [])
  const [loading, setLoading] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: string, permanent = false) => {
    if (permanent && !window.confirm(`Permanently remove ${profile.display_name}? This cannot be undone.`)) return
    setLoading(action); setError(null); setNotice(null)
    try {
      const response = await fetch(`/api/members/${profile.id}`, { method: permanent ? 'DELETE' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: permanent ? undefined : JSON.stringify({ action, displayName, jobTitle, role, channelIds }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Action failed.')
      setNotice(data.message); onChanged(); if (permanent) onClose()
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : 'Action failed.') }
    finally { setLoading(null) }
  }

  return <ModalShell title="Manage member" subtitle={profile.email} onClose={onClose}>
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}{notice && <Alert tone="success">{notice}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><Field label="Full name"><input className="member-input" value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></Field><Field label="Job title"><input className="member-input" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} /></Field></div>
      <Field label="Workspace role"><select className="member-input" value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)}><option value="member">Member</option><option value="admin">Admin</option><option value="ceo">CEO</option></select></Field>
      <ChannelAccess channels={channels} selected={channelIds} onChange={setChannelIds} />
      <button type="button" onClick={() => void run('update')} disabled={Boolean(loading)} className="h-10 w-full rounded-lg bg-[var(--primary)] text-sm font-semibold text-white disabled:opacity-60">{loading === 'update' ? 'Saving…' : 'Save member access'}</button>
      <div className="grid grid-cols-1 gap-2 border-t border-[var(--ui-border)] pt-4 sm:grid-cols-2">
        <ActionButton onClick={() => void run('reset_password')} disabled={Boolean(loading)} icon={<RotateCcw size={14} />}>Send password reset</ActionButton>
        <ActionButton tone="warning" onClick={() => void run(access?.suspended ? 'reactivate' : 'suspend')} disabled={Boolean(loading)} icon={<UserX size={14} />}>{access?.suspended ? 'Reactivate member' : 'Suspend member'}</ActionButton>
        <ActionButton tone="danger" wide onClick={() => void run('delete', true)} disabled={Boolean(loading)} icon={<Trash2 size={14} />}>Permanently remove member</ActionButton>
      </div>
    </div>
  </ModalShell>
}

function AddMemberModal({ channels, onClose, onCreated }: { channels: Array<{ id: string; name: string | null }>; onClose: () => void; onCreated: () => void }) {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [jobTitle, setJobTitle] = useState('Teammate')
  const [accessRole, setAccessRole] = useState<WorkspaceRole>('member')
  const [channelIds, setChannelIds] = useState<string[]>(() => channels.map((channel) => channel.id))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(null)
    try {
      const response = await fetch('/api/members', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayName, email, jobTitle, accessRole, channelIds }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to create member.')
      setCreated(true); onCreated()
    } catch (caught: unknown) { setError(caught instanceof Error ? caught.message : 'Unable to create member.') }
    finally { setLoading(false) }
  }

  return <ModalShell title={created ? 'Member invited' : 'Invite workspace member'} subtitle={created ? 'A secure setup link was emailed to the member.' : 'Choose their role and initial channel access.'} onClose={onClose}>
    {created ? <div><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900"><p className="flex items-center gap-2 text-sm font-semibold"><Check size={16} />Invitation sent</p><p className="mt-2 break-all text-xs">{email.trim().toLowerCase()}</p><p className="mt-1 text-xs">The member chooses their own password from the secure email link.</p></div><button type="button" onClick={onClose} className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--primary)] text-sm font-semibold text-white"><Mail size={15} />Done</button></div> :
      <form onSubmit={submit} className="space-y-4">{error && <Alert tone="error">{error}</Alert>}<div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Full name"><input required minLength={2} value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Jane Doe" className="member-input" /></Field><Field label="Work email"><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="jane@company.com" className="member-input" /></Field><Field label="Job title"><input required value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} className="member-input" /></Field><Field label="Workspace access"><select value={accessRole} onChange={(event) => setAccessRole(event.target.value as WorkspaceRole)} className="member-input"><option value="member">Member</option><option value="admin">Admin</option><option value="ceo">CEO</option></select></Field></div><ChannelAccess channels={channels} selected={channelIds} onChange={setChannelIds} /><p className="text-[11px] text-[var(--muted-foreground)]">A secure invitation is emailed. Admins never handle the member’s password.</p><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="h-9 rounded-lg border border-[var(--ui-border)] px-4 text-xs font-semibold">Cancel</button><button type="submit" disabled={loading} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-xs font-semibold text-white disabled:opacity-60">{loading && <Loader2 size={14} className="animate-spin" />}Send invitation</button></div></form>}
  </ModalShell>
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-labelledby="member-modal-title" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--surface-raised)] shadow-2xl"><header className="flex items-start justify-between border-b border-[var(--ui-border)] px-5 py-4"><div className="min-w-0"><h2 id="member-modal-title" className="text-base font-semibold">{title}</h2><p className="mt-0.5 truncate text-xs text-[var(--muted-foreground)]">{subtitle}</p></div><button type="button" aria-label="Close dialog" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]"><X size={16} /></button></header><div className="max-h-[75vh] overflow-y-auto p-5">{children}</div></section></div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[var(--muted-foreground)]">{label}</span>{children}</label> }
function Alert({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) { return <div className={tone === 'error' ? 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700' : 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700'}>{children}</div> }
function ChannelAccess({ channels, selected, onChange }: { channels: Array<{ id: string; name: string | null }>; selected: string[]; onChange: (ids: string[]) => void }) { return <Field label="Public channel access"><div className="grid grid-cols-1 gap-2 rounded-lg border border-[var(--ui-border)] p-3 sm:grid-cols-2">{channels.length ? channels.map((channel) => <label key={channel.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(channel.id)} onChange={(event) => onChange(event.target.checked ? [...selected, channel.id] : selected.filter((id) => id !== channel.id))} />#{channel.name}</label>) : <p className="col-span-full text-xs text-[var(--muted-foreground)]">No public channels available.</p>}</div></Field> }
function ActionButton({ children, icon, onClick, disabled, tone = 'default', wide }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; disabled: boolean; tone?: 'default' | 'warning' | 'danger'; wide?: boolean }) { const colors = tone === 'danger' ? 'border-red-200 bg-red-50 text-red-700' : tone === 'warning' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[var(--ui-border)] text-[var(--muted-foreground)]'; return <button type="button" onClick={onClick} disabled={disabled} className={`${wide ? 'sm:col-span-2 ' : ''}flex h-9 items-center justify-center gap-2 rounded-lg border text-xs font-semibold disabled:opacity-50 ${colors}`}>{icon}{children}</button> }
