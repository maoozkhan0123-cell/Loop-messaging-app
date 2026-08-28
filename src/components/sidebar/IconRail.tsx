'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Home, MessagesSquare, FolderOpen, MoreHorizontal, Smile, X, Camera, Loader2, Bell, BellOff, Kanban, Lightbulb } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { Avatar } from '@/components/ui/Avatar'
import { useProfile, useUpdateProfile } from '@/hooks/useProfile'
import { useNotifications } from '@/hooks/useNotifications'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

interface IconRailProps {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function IconRail({ sidebarOpen, onToggleSidebar }: IconRailProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { enabled: notifEnabled, permission: notifPermission, toggle: toggleNotif } = useNotifications()

  const isHome = pathname === '/' || pathname.includes('/channel')
  const isDM = pathname.includes('/dm') || pathname.includes('/people')

  const statusColor =
    profile?.status === 'online' ? '#36D7AE'
    : profile?.status === 'away' ? '#F59E0B'
    : '#6B7280'

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleStatusToggle = () => {
    const newStatus = profile?.status === 'away' ? 'online' : 'away'
    updateProfile.mutate({ status: newStatus })
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return }
    if (file.size > 5 * 1024 * 1024) { alert('Image must be under 5 MB'); return }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${profile.id}/avatar.${ext}`

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      // Bust the cache
      const busted = `${publicUrl}?t=${Date.now()}`
      await updateProfile.mutateAsync({ avatar_url: busted })
    } catch (err) {
      alert('Upload failed. Make sure the "avatars" storage bucket exists in Supabase.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <aside
      className="flex flex-col items-center flex-shrink-0 relative z-20 shadow-xl border-r border-[#27272A]"
      style={{ width: 70, background: '#000000', height: '100%', paddingTop: 10, paddingBottom: 12 }}
    >
      {/* Workspace logo */}
      <button
        type="button"
        onClick={onToggleSidebar}
        title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', flexShrink: 0, display: 'block', marginBottom: 14 }}
        className="hover:scale-105 transition-transform focus-visible:outline-none bg-black border border-[#27272A] shadow-md"
      >
        <Image src="/huddle-logo.svg" alt="Huddle" width={44} height={44} priority style={{ objectFit: 'cover', display: 'block' }} />
      </button>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%' }}>
        <RailBtn icon={Home} label="Home" isActive={isHome} onClick={() => router.push('/')} />
        <RailBtn icon={MessagesSquare} label="DMs" isActive={isDM} onClick={() => router.push('/people')} />
        <RailBtn icon={FolderOpen} label="Files" isActive={pathname === '/files'} onClick={() => router.push('/files')} />
        <RailBtn icon={Kanban} label="Projects" isActive={pathname === '/projects'} onClick={() => router.push('/projects')} />
        <RailBtn icon={Lightbulb} label="Ideas" isActive={pathname === '/ideas'} onClick={() => router.push('/ideas')} />
        <RailBtn icon={MoreHorizontal} label="More" isActive={false} onClick={() => {}} />
      </div>

      <div style={{ flex: 1 }} />

      {/* Avatar upload input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarUpload}
      />

      {/* User menu popover */}
      {profile && (
        <Popover.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="hover:opacity-90 transition-all focus-visible:outline-none relative"
              style={{ width: 36, height: 36 }}
            >
              {uploading ? (
                <div className="w-9 h-9 flex items-center justify-center">
                  <Loader2 size={18} className="animate-spin text-white/60" />
                </div>
              ) : (
                <Avatar src={profile.avatar_url} name={profile.display_name} size={36} status={profile.status} />
              )}
              <span
                style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 12, height: 12, borderRadius: '50%',
                  background: statusColor, border: '2px solid #0D1F31',
                  display: profile.status === 'offline' || !profile.status ? 'none' : 'block'
                }}
              />
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="right"
              align="end"
              sideOffset={15}
              className="z-50 bg-[#F8F8F8] rounded-xl shadow-2xl border border-[#E5E7EB] w-72 overflow-hidden outline-none"
              style={{ paddingBottom: 4 }}
            >
              {/* Top info section */}
              <div className="bg-white px-4 py-3 flex gap-3 items-start">
                {/* Avatar with upload overlay */}
                <div className="relative flex-shrink-0 group/avatar">
                  <Avatar src={profile.avatar_url} name={profile.display_name} size={40} square status={profile.status} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded flex items-center justify-center bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity"
                    title="Change photo"
                  >
                    <Camera size={14} className="text-white" />
                  </button>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[#1D1C1D] text-[15px] truncate leading-tight">
                    {profile.display_name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280] mt-0.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
                    <span className="capitalize">{profile.status === 'away' ? 'Away' : 'Active'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] text-[#3589FA] hover:underline mt-0.5"
                  >
                    {uploading ? 'Uploading…' : 'Change photo'}
                  </button>
                </div>
              </div>

              <div className="px-4 py-2 bg-white">
                <button className="w-full flex items-center gap-2 border border-[#9CA3AF] rounded-md px-3 h-9 text-[#6B7280] hover:bg-[#F8F8F8] transition-colors text-[13px]">
                  <Smile size={16} />
                  Update your status
                </button>
              </div>
              <div className="bg-white pb-2 px-1">
                <MenuItem onClick={handleStatusToggle} label={<span>Set yourself as <span className="font-bold">{profile.status === 'away' ? 'active' : 'away'}</span></span>} />
                {/* Notifications toggle row */}
                <button
                  type="button"
                  onClick={toggleNotif}
                  className="w-full flex items-center justify-between px-3 h-9 rounded text-[13px] text-[#1D1C1D] hover:bg-[#3589FA] hover:text-white group transition-none"
                >
                  <div className="flex items-center gap-2">
                    {notifEnabled
                      ? <Bell size={14} className="text-[#3589FA] group-hover:text-white" />
                      : <BellOff size={14} className="text-[#9CA3AF] group-hover:text-white" />
                    }
                    <span>Notifications</span>
                  </div>
                  <div className={cn(
                    'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
                    notifEnabled ? 'bg-[#3589FA] group-hover:bg-white/30' : 'bg-[#D1D5DB] group-hover:bg-white/30'
                  )}>
                    <span className={cn(
                      'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all',
                      notifEnabled ? 'left-[18px]' : 'left-0.5'
                    )} />
                  </div>
                </button>
                {notifPermission === 'denied' && (
                  <p className="text-[10px] text-red-400 px-3 pb-1">Blocked in browser — check site settings</p>
                )}
              </div>

              <div className="h-px bg-[#E5E7EB] my-1" />

              <div className="px-1 py-1">
                <MenuItem onClick={() => { setMenuOpen(false); router.push('/profile') }} label="Profile" />
                <MenuItem onClick={() => {}} label="Preferences" />
              </div>

              <div className="h-px bg-[#E5E7EB] my-1" />

              <div className="px-1 py-1">
                <MenuItem onClick={handleSignOut} label="Sign out" />
              </div>

              <button
                onClick={() => setMenuOpen(false)}
                className="absolute top-2 right-2 p-1 rounded hover:bg-[#F3F4F6] text-[#6B7280]"
              >
                <X size={16} />
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      )}
    </aside>
  )
}

function MenuItem({ onClick, label, rightLabel, icon }: { onClick: () => void; label: React.ReactNode; rightLabel?: string; icon?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 h-7 rounded text-[13px] text-[#1D1C1D] hover:bg-[#3589FA] hover:text-white group transition-none"
    >
      <div className="flex items-center gap-2">
        {icon && <span className="rotate-45 block">🚀</span>}
        {label}
      </div>
      {rightLabel && <span className="text-[#6B7280] group-hover:text-white/80">{rightLabel}</span>}
    </button>
  )
}

function RailBtn({ icon: Icon, label, isActive, onClick }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string; isActive?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '6px 0', gap: 3, cursor: 'pointer', background: 'none', border: 'none' }}
      className="group"
    >
      <span
        style={{
          width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isActive ? '#FFFFFF' : 'transparent',
          boxShadow: isActive ? '0 4px 12px rgba(255,255,255,0.15)' : 'none',
          transition: 'all 0.15s ease',
        }}
        className={cn(!isActive && 'group-hover:bg-white/15')}
      >
        <Icon size={20} className={cn('transition-all group-hover:scale-110', isActive ? 'text-[#000000]' : 'text-zinc-400 group-hover:text-white')} />
      </span>
      <span
        style={{ fontSize: 10, lineHeight: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}
        className={cn('transition-colors', isActive ? 'text-white font-bold' : 'text-zinc-400 group-hover:text-zinc-200')}
      >
        {label}
      </span>
    </button>
  )
}
