'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, MessageSquare, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'
import { useCreateDM } from '@/hooks/useChannels'
import { Avatar } from '@/components/ui/Avatar'
import type { Profile } from '@/types/database'
import { cn } from '@/lib/utils'

export default function PeoplePage() {
  const router = useRouter()
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [startingDM, setStartingDM] = useState<string | null>(null)
  const createDM = useCreateDM()

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
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[20px] sm:text-[22px] font-bold text-[#0F172A] tracking-tight">Team Directory</h1>
            {profiles && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-semibold bg-[#EFF6FF] text-[#3589FA]">
                <Users size={11} />
                {profiles.length - 1} members
              </span>
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
                <PeopleGrid profiles={online} startingDM={startingDM} onMessage={handleStartDM} />
              </section>
            )}

            {/* Offline group */}
            {offline.length > 0 && (
              <section>
                <SectionLabel label="Others" count={offline.length} dot="bg-[#CBD5E1]" />
                <PeopleGrid profiles={offline} startingDM={startingDM} onMessage={handleStartDM} />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
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
}: {
  profiles: Profile[]
  startingDM: string | null
  onMessage: (id: string) => void
}) {
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {profiles.map((profile) => (
        <PersonCard
          key={profile.id}
          profile={profile}
          loading={startingDM === profile.id}
          onMessage={() => onMessage(profile.id)}
        />
      ))}
    </div>
  )
}

function PersonCard({
  profile,
  loading,
  onMessage,
}: {
  profile: Profile
  loading: boolean
  onMessage: () => void
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
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#F1F5F9] text-[#64748B] max-w-[90px] truncate">
            {profile.job_title || 'Teammate'}
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
