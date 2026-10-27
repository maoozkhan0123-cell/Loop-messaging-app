'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { Home, MessagesSquare, FolderOpen, Smile, X, Camera, Loader2, Bell, BellOff, Kanban, Lightbulb, Hash, Users, Settings, Inbox, CalendarDays } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { Avatar } from '@/components/ui/Avatar'
import { useProfile, useUpdateProfile } from '@/hooks/useProfile'
import { useNotifications } from '@/hooks/useNotifications'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useMobileNav } from '@/components/AppShell'
import { PreferencesModal } from '@/components/PreferencesModal'

interface IconRailProps {
  onOpenSidebar: () => void
  onCloseSidebar: () => void
}

export function IconRail({ onOpenSidebar, onCloseSidebar }: IconRailProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { closeMobileMenu } = useMobileNav()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const supabase = createClient()
  const [menuOpen, setMenuOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { enabled: notifEnabled, permission: notifPermission, toggle: toggleNotif } = useNotifications()

  useEffect(() => {
    const openPreferences = () => setPreferencesOpen(true)
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault()
        setPreferencesOpen(true)
      }
    }
    window.addEventListener('bysync:open-preferences', openPreferences)
    window.addEventListener('keydown', handleShortcut)
    return () => {
      window.removeEventListener('bysync:open-preferences', openPreferences)
      window.removeEventListener('keydown', handleShortcut)
    }
  }, [])

  const isHome = pathname === '/' || pathname === '/dashboard'
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
    } catch {
      alert('Upload failed. Make sure the "avatars" storage bucket exists in Supabase.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <aside
      className="flex flex-col items-center flex-shrink-0 relative z-20 shadow-xl border-r border-white/10"
      style={{ width: 70, background: '#171936', height: '100%', paddingTop: 10, paddingBottom: 12 }}
    >
      {/* Workspace logo */}
      <button
        type="button"
        onClick={() => { onCloseSidebar(); closeMobileMenu(); router.push('/dashboard') }}
        title="Go to Home"
        style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', flexShrink: 0, display: 'block', marginBottom: 14 }}
        className="hover:scale-105 transition-transform focus-visible:outline-none bg-white border border-white/20 shadow-md"
      >
        <Image src="/bysync-logo.svg" alt="BySync" width={44} height={44} priority style={{ objectFit: 'cover', display: 'block' }} />
      </button>

      {/* Nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%' }}>
        <RailBtn icon={Home} label="Home" isActive={isHome} onClick={() => { onCloseSidebar(); closeMobileMenu(); router.push('/dashboard') }} />
        <RailBtn icon={Inbox} label="Inbox" isActive={pathname === '/inbox'} onClick={() => { onCloseSidebar(); closeMobileMenu(); router.push('/inbox') }} />
        <RailBtn icon={MessagesSquare} label="Messages" isActive={pathname.includes('/dm')} onClick={() => { onOpenSidebar(); router.push('/people') }} />
        <RailBtn icon={Hash} label="Channels" isActive={pathname.includes('/channel')} onClick={() => { onOpenSidebar(); closeMobileMenu() }} />
        <RailBtn icon={Users} label="Team" isActive={isDM && pathname === '/people'} onClick={() => { onCloseSidebar(); closeMobileMenu(); router.push('/people') }} />
        <RailBtn icon={FolderOpen} label="Files" isActive={pathname === '/files'} onClick={() => { onCloseSidebar(); closeMobileMenu(); router.push('/files') }} />
        <RailBtn icon={Kanban} label="Projects" isActive={pathname === '/projects'} onClick={() => { onCloseSidebar(); closeMobileMenu(); router.push('/projects') }} />
        <RailBtn icon={CalendarDays} label="Calendar" isActive={pathname === '/calendar'} onClick={() => { onCloseSidebar(); closeMobileMenu(); router.push('/calendar') }} />
        <RailBtn icon={Lightbulb} label="Ideas" isActive={pathname === '/ideas'} onClick={() => { onCloseSidebar(); closeMobileMenu(); router.push('/ideas') }} />
        <RailBtn icon={Settings} label="Settings" onClick={() => setPreferencesOpen(true)} />
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
                  background: statusColor, border: '2px solid #111827',
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
                  {profile.email && <div className="mt-0.5 truncate text-[11px] text-[#8A878A]">{profile.email}</div>}
                  <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280] mt-0.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: statusColor }} />
                    <span className="capitalize">{profile.status === 'away' ? 'Away' : 'Active'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[11px] text-[#289ED8] hover:underline mt-0.5"
                  >
                    {uploading ? 'Uploading…' : 'Change photo'}
                  </button>
                </div>
              </div>

              <div className="px-4 py-2 bg-white">
                <button type="button" onClick={handleStatusToggle} className="w-full flex items-center gap-2 border border-[#9CA3AF] rounded-md px-3 h-9 text-[#6B7280] hover:bg-[#F8F8F8] transition-colors text-[13px]">
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
                  className="w-full flex items-center justify-between px-3 h-9 rounded text-[13px] text-[#1D1C1D] hover:bg-[#289ED8] hover:text-white group transition-none"
                >
                  <div className="flex items-center gap-2">
                    {notifEnabled
                      ? <Bell size={14} className="text-[#289ED8] group-hover:text-white" />
                      : <BellOff size={14} className="text-[#9CA3AF] group-hover:text-white" />
                    }
                    <span>Notifications</span>
                  </div>
                  <div className={cn(
                    'relative w-9 h-5 rounded-full transition-colors flex-shrink-0',
                    notifEnabled ? 'bg-[#289ED8] group-hover:bg-white/30' : 'bg-[#D1D5DB] group-hover:bg-white/30'
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
                <MenuItem onClick={() => { setMenuOpen(false); setPreferencesOpen(true) }} label="Preferences" />
                <MenuItem onClick={() => { setMenuOpen(false); window.dispatchEvent(new Event('open-search')) }} label="Keyboard shortcuts & commands" rightLabel="Ctrl K" />
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
      <PreferencesModal open={preferencesOpen} onOpenChange={setPreferencesOpen} />
    </aside>
  )
}

function MenuItem({ onClick, label, rightLabel, icon }: { onClick: () => void; label: React.ReactNode; rightLabel?: string; icon?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 h-7 rounded text-[13px] text-[#1D1C1D] hover:bg-[#289ED8] hover:text-white group transition-none"
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
          background: isActive ? 'linear-gradient(135deg, #289ED8, #27AAE1)' : 'transparent',
          boxShadow: isActive ? '0 6px 16px rgba(40,158,216,0.35)' : 'none',
          transition: 'all 0.15s ease',
        }}
        className={cn(!isActive && 'group-hover:bg-white/15')}
      >
        <Icon size={20} className={cn('transition-all group-hover:scale-110', isActive ? 'text-white' : 'text-blue-100/65 group-hover:text-white')} />
      </span>
      <span
        style={{ fontSize: 10, lineHeight: '12px', fontWeight: 600, whiteSpace: 'nowrap' }}
        className={cn('transition-colors', isActive ? 'text-white font-bold' : 'text-blue-100/60 group-hover:text-white')}
      >
        {label}
      </span>
    </button>
  )
}
