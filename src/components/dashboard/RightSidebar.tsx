'use client'

import { MessageCircle, Users } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { InteractiveCalendar } from './InteractiveCalendar'
import type { Profile, ProjectBoard, ProjectColumn, ProjectTask } from '@/types/database'
import type { CreateDashboardTaskInput } from '@/hooks/useDashboard'

type RightSidebarProps = {
  tasks: ProjectTask[]
  boards: ProjectBoard[]
  columns: ProjectColumn[]
  profiles: Profile[]
  onCreateTask: (input: CreateDashboardTaskInput) => Promise<unknown>
  onOpenTask: (task: ProjectTask) => void
  onMessageMember: (profile: Profile) => Promise<void>
  onViewTeam: () => void
  creatingTask?: boolean
}

export function RightSidebar(props: RightSidebarProps) {
  const online = [...props.profiles].filter((profile) => profile.status === 'online').sort(byName)
  const away = [...props.profiles].filter((profile) => profile.status === 'away').sort(byName)
  const offline = [...props.profiles].filter((profile) => profile.status === 'offline').sort(byName)
  return <aside className="space-y-4 border-t border-[var(--ui-border)] bg-[var(--surface-muted)] p-4 xl:sticky xl:top-0 xl:max-h-[calc(100vh-41px)] xl:overflow-y-auto xl:border-l xl:border-t-0">
    <div className="rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] p-4 shadow-sm"><InteractiveCalendar tasks={props.tasks} boards={props.boards} columns={props.columns} profiles={props.profiles} onCreateTask={props.onCreateTask} onOpenTask={props.onOpenTask} creating={props.creatingTask} /></div>
    <section className="rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] p-4 shadow-sm" aria-labelledby="team-presence-heading">
      <div className="mb-3 flex items-center justify-between"><div><h2 id="team-presence-heading" className="text-sm font-semibold">Team members</h2><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{online.length} online · {props.profiles.length} total</p></div><button type="button" onClick={props.onViewTeam} className="text-xs font-semibold text-[var(--primary)]">View all</button></div>
      {!props.profiles.length ? <div className="rounded-lg border border-dashed border-[var(--ui-border)] px-3 py-7 text-center"><Users size={20} className="mx-auto text-[var(--muted-foreground)]" /><p className="mt-2 text-xs text-[var(--muted-foreground)]">No team members found.</p></div> : <div className="max-h-72 space-y-4 overflow-y-auto pr-1"><PresenceGroup title={`Online now (${online.length})`} profiles={online} onMessage={props.onMessageMember} pulse /><PresenceGroup title="Away" profiles={away} onMessage={props.onMessageMember} /><PresenceGroup title="Offline" profiles={offline} onMessage={props.onMessageMember} /></div>}
    </section>
  </aside>
}

function PresenceGroup({ title, profiles, onMessage, pulse }: { title: string; profiles: Profile[]; onMessage: (profile: Profile) => Promise<void>; pulse?: boolean }) {
  if (!profiles.length) return null
  return <div><h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">{title}</h3><div className="space-y-0.5">{profiles.map((profile) => <div key={profile.id} className="group flex items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-[var(--surface-muted)] focus-within:bg-[var(--surface-muted)]"><div className="relative"><Avatar name={profile.display_name} src={profile.avatar_url} size={32} /><span aria-hidden="true" className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)] ${profile.status === 'online' ? `bg-emerald-500 ${pulse ? 'motion-safe:animate-pulse' : ''}` : profile.status === 'away' ? 'bg-amber-500' : 'bg-slate-400'}`} /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{profile.display_name}</p><p className="truncate text-[10px] text-[var(--muted-foreground)]">{profile.status === 'online' ? 'Active' : profile.status === 'away' ? 'Away' : 'Offline'} · {profile.job_title || 'Team member'}</p></div><button type="button" onClick={() => void onMessage(profile)} aria-label={`Message ${profile.display_name}`} title={`Message ${profile.display_name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--muted-foreground)] opacity-100 transition hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><MessageCircle size={14} /></button></div>)}</div></div>
}

function byName(a: Profile, b: Profile) { return a.display_name.localeCompare(b.display_name) }
