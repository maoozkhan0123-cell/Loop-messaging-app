'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Hash, Lock, MessageSquare, Users, Info, Bell, Search, X, Paperclip,
  Download, FileText, UserPlus, Sparkles,
} from 'lucide-react'
import { openAssistant } from '@/components/ai/AssistantPanel'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { ThreadPanel } from '@/components/thread/ThreadPanel'
import { motion, AnimatePresence } from 'framer-motion'
import type { Message, ChannelWithMember } from '@/types/database'
import { useTypingIndicator } from '@/hooks/useTypingIndicator'
import { useMarkRead } from '@/hooks/useChannels'
import { useChannelFiles } from '@/hooks/useChannelFiles'
import { cn, formatFileSize, isImageMime } from '@/lib/utils'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useNotifications } from '@/hooks/useNotifications'
import { Avatar } from '@/components/ui/Avatar'
import { AddChannelMembersDialog } from './AddChannelMembersDialog'
import type { Profile } from '@/types/database'

interface MessagePaneProps {
  channel: ChannelWithMember
  currentUserId: string
}

type ActiveTab = 'messages' | 'files'

const PRESENCE_LABEL: Record<Profile['status'], string> = { online: 'Active now', away: 'Away', offline: 'Offline' }

export function MessagePane({ channel, currentUserId }: MessagePaneProps) {
  const [threadMessage, setThreadMessage] = useState<Message | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('messages')
  const [chatSearchOpen, setChatSearchOpen] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const router = useRouter()
  const notifications = useNotifications()
  const [addPeopleOpen, setAddPeopleOpen] = useState(false)
  const { typingUsers } = useTypingIndicator(channel.id)
  const markRead = useMarkRead()

  const isDM = channel.type === 'dm' || channel.type === 'group_dm'
  const other = channel.other_member as Profile | undefined
  const channelName = isDM ? (other?.display_name ?? 'Direct Message') : (channel.name ?? 'Channel')
  const Icon = channel.type === 'private' ? Lock : isDM ? MessageSquare : Hash
  const subtitle = isDM
    ? [other ? PRESENCE_LABEL[other.status] : null, other?.job_title].filter(Boolean).join(' · ')
    : channel.topic || (channel.type === 'private' ? 'Private channel' : 'Public channel')

  // Mark channel as read when it's opened or switched to
  useEffect(() => {
    const timer = setTimeout(() => markRead.mutate(channel.id), 500)
    return () => clearTimeout(timer)
  }, [channel.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close chat search on channel switch
  useEffect(() => {
    setChatSearchOpen(false)
    setChatSearchQuery('')
  }, [channel.id])

  const handleSearchToggle = useCallback(() => {
    setChatSearchOpen((v) => {
      if (v) setChatSearchQuery('')
      return !v
    })
  }, [])

  const intro = (
    <div className="px-4 pb-6 pt-10 sm:px-6">
      {isDM && other
        ? <Avatar src={other.avatar_url} name={other.display_name} size={64} status={other.status} />
        : <span className="grid h-16 w-16 place-items-center rounded-2xl bg-[#EBF5FF] text-[#3589FA]"><Icon size={28} /></span>}
      <h3 className="mt-4 text-xl font-bold text-[#111827]">{isDM ? channelName : `Welcome to #${channelName}`}</h3>
      <p className="mt-1 max-w-lg text-sm text-[#6B7280]">
        {isDM
          ? <>This is the beginning of your conversation with <span className="font-semibold text-[#374151]">{channelName}</span>. Say hello!</>
          : <>This is the very start of the <span className="font-semibold text-[#374151]">#{channelName}</span> channel. Share updates, files and ideas with your team here.</>}
      </p>
      {!isDM && (
        <button type="button" onClick={() => setAddPeopleOpen(true)} className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-[#E5E7EB] px-3 text-sm font-semibold text-[#374151] hover:bg-[#F3F4F6]">
          <UserPlus size={15} /> Add people
        </button>
      )}
    </div>
  )

  return (
    <div className="flex flex-1 min-w-0 h-full relative">
      {/* Main pane */}
      <div className="flex flex-col flex-1 min-w-0 h-full bg-white">

        {/* Header */}
        <div className="bg-white border-b border-[#E5E7EB] flex-shrink-0">
          <div className="flex items-center gap-2 px-3 sm:px-5 h-[60px]">
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              title="Conversation details"
              className="-ml-1.5 flex min-w-0 items-center gap-3 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-[#F3F4F6]"
            >
              {isDM && other
                ? <Avatar src={other.avatar_url} name={other.display_name} size={36} status={other.status} />
                : <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-[#EBF5FF] text-[#3589FA]"><Icon size={17} /></span>}
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold leading-5 text-[#111827]">{channelName}</span>
                {subtitle && <span className="block truncate text-xs leading-4 text-[#6B7280]">{subtitle}</span>}
              </span>
            </button>

            <div className="ml-auto flex flex-shrink-0 items-center gap-1">
              <div className="mr-1 flex items-center rounded-lg bg-[#F3F4F6] p-0.5" role="tablist" aria-label="Conversation view">
                <TabButton label="Messages" isActive={activeTab === 'messages'} onClick={() => setActiveTab('messages')} icon={<MessageSquare size={13} />} />
                <TabButton label="Files" isActive={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={<Paperclip size={13} />} />
              </div>
              <HeaderIconBtn label="Summarise with AI" icon={<Sparkles size={16} />} onClick={() => openAssistant({ prompt: 'Catch me up on this conversation: main topics, decisions and anything that needs my reply.', context: { type: 'channel', id: channel.id } })} />
              <HeaderIconBtn label="Search in this conversation" icon={<Search size={16} />} onClick={handleSearchToggle} active={chatSearchOpen} />
              {isDM && <HeaderIconBtn label={notifications.enabled ? 'Notifications on' : 'Notifications off'} icon={<Bell size={16} />} className="hidden sm:flex" active={notifications.enabled} onClick={notifications.toggle} />}
              {!isDM && (
                <button type="button" onClick={() => setAddPeopleOpen(true)} title="Members" className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm text-[#6B7280] transition-colors hover:bg-[#F3F4F6] hover:text-[#111827]">
                  <Users size={16} />
                  <span className="hidden text-[13px] font-medium lg:inline">Members</span>
                </button>
              )}
              <HeaderIconBtn label="Details" icon={<Info size={16} />} onClick={() => setDetailsOpen((open) => !open)} active={detailsOpen} />
            </div>
          </div>

          {/* In-chat search bar */}
          <AnimatePresence>
            {chatSearchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 52, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="flex h-[52px] items-center gap-2 px-3 pb-2 sm:px-5">
                  <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-3.5 focus-within:border-[#3589FA] focus-within:bg-white">
                    <Search size={14} className="text-[#9CA3AF] flex-shrink-0" />
                    <input
                      autoFocus
                      value={chatSearchQuery}
                      onChange={(e) => setChatSearchQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') handleSearchToggle() }}
                      placeholder={`Search in ${isDM ? channelName : '#' + channelName}…`}
                      className="flex-1 bg-transparent text-[13px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none min-w-0"
                    />
                    {chatSearchQuery && (
                      <button type="button" aria-label="Clear search" onClick={() => setChatSearchQuery('')} className="text-[#9CA3AF] hover:text-[#6B7280]">
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <button type="button" onClick={handleSearchToggle} className="h-9 rounded-full px-3 text-[13px] font-medium text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]">
                    Close
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {activeTab === 'messages' ? (
          <>
            <MessageList
              channelId={channel.id}
              currentUserId={currentUserId}
              // Only pass onThreadOpen for non-DM channels
              onThreadOpen={isDM ? undefined : setThreadMessage}
              searchQuery={chatSearchQuery}
              intro={intro}
            />

            {/* Typing indicator */}
            <div className="px-4 sm:px-6 h-5 flex items-center flex-shrink-0">
              {typingUsers.length > 0 && (
                <p className="text-xs text-[#6B7280] truncate">
                  <span className="font-semibold text-[#374151]">{typingUsers.map((u) => u.display_name).join(', ')}</span>{' '}
                  {typingUsers.length === 1 ? 'is' : 'are'} typing
                  <TypingDots />
                </p>
              )}
            </div>

            {isDM && other && other.status !== 'online' && <OfflineBanner key={channel.id} name={channelName} status={other.status} />}

            <MessageInput
              channelId={channel.id}
              placeholder={isDM ? `Message ${channelName}` : `Message #${channelName}`}
            />
          </>
        ) : (
          <FilesTab channelId={channel.id} currentUserId={currentUserId} />
        )}
      </div>

      {/* Thread panel (channels only: side-panel on desktop, full screen overlay on mobile) */}
      <AnimatePresence>
        {threadMessage && !isDM && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 md:relative md:inset-auto md:z-auto w-full md:w-[360px] h-full bg-white flex-shrink-0 border-l border-[#E5E7EB]"
          >
            <ThreadPanel
              message={threadMessage}
              channelId={channel.id}
              currentUserId={currentUserId}
              onClose={() => setThreadMessage(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {detailsOpen && (
          <motion.aside initial={{ opacity: 0, x: '100%' }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: '100%' }} transition={{ duration: 0.18 }} className="fixed inset-0 z-50 md:relative md:inset-auto md:z-auto flex w-full md:w-[320px] h-full flex-col bg-white border-l border-[#E5E7EB] flex-shrink-0">
            <div className="h-[60px] px-4 flex flex-shrink-0 items-center justify-between border-b border-[#E5E7EB]"><h2 className="font-bold text-[#111827]">Details</h2><button type="button" aria-label="Close details" onClick={() => setDetailsOpen(false)} className="p-2 rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]"><X size={16} /></button></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <div className="pb-5 border-b border-[#E5E7EB]">
                {isDM && other ? <Avatar src={other.avatar_url} name={other.display_name} size={64} status={other.status} /> : <div className="w-14 h-14 rounded-2xl bg-[#EBF5FF] flex items-center justify-center text-[#3589FA]"><Icon size={25} /></div>}
                <h3 className="mt-3 text-lg font-bold text-[#111827]">{isDM ? channelName : `#${channelName}`}</h3>
                <p className="text-sm text-[#6B7280] mt-0.5">{isDM ? (other?.job_title || 'Direct conversation') : (channel.topic || (channel.type === 'private' ? 'Private channel' : 'Public channel'))}</p>
                {isDM && other?.email && <p className="mt-1 truncate text-xs text-[#9CA3AF]">{other.email}</p>}
              </div>
              <div className="py-4 space-y-1">
                <DetailsAction icon={<MessageSquare size={16} />} label="Messages" onClick={() => { setActiveTab('messages'); setDetailsOpen(false) }} />
                <DetailsAction icon={<Paperclip size={16} />} label="Shared files" onClick={() => { setActiveTab('files'); setDetailsOpen(false) }} />
                <DetailsAction icon={<Search size={16} />} label="Search in conversation" onClick={() => { setDetailsOpen(false); setChatSearchOpen(true) }} />
                {!isDM && <DetailsAction icon={<Users size={16} />} label="Members" onClick={() => { setDetailsOpen(false); setAddPeopleOpen(true) }} />}
                <DetailsAction icon={<Users size={16} />} label="Team directory" onClick={() => router.push('/people')} />
              </div>
              <div className="rounded-xl bg-[#F8FAFC] border border-[#E5E7EB] p-3 text-xs text-[#64748B]"><p className="font-semibold text-[#374151] mb-1">Created</p><p>{format(new Date(channel.created_at), 'MMMM d, yyyy')}</p></div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
      {!isDM && <AddChannelMembersDialog channelId={channel.id} channelName={channelName} open={addPeopleOpen} onOpenChange={setAddPeopleOpen} />}
    </div>
  )
}

// ── Files tab ──────────────────────────────────────────────────────────────

function FilesTab({ channelId, currentUserId }: { channelId: string; currentUserId: string }) {
  const { data: files, isLoading } = useChannelFiles(channelId)

  if (isLoading) {
    return (
      <div className="flex-1 flex items-start px-6 pt-10">
        <div className="w-5 h-5 border-2 border-[#3589FA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!files || files.length === 0) {
    return (
      <div className="flex-1 px-4 pt-10 sm:px-6">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#F3F4F6] text-[#9CA3AF]"><Paperclip size={24} /></span>
        <p className="mt-4 text-[15px] font-semibold text-[#111827]">No files yet</p>
        <p className="mt-1 text-[13px] text-[#6B7280]">Files shared in this conversation will appear here.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto py-5 px-4 sm:px-6">
      <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
        {files.length} file{files.length !== 1 ? 's' : ''}
      </p>
      <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-3">
        {files.map((file) => {
          const isImage = isImageMime(file.mime_type)
          const url = file.signed_url ?? ''
          const isOwn = file.sender_id === currentUserId
          return (
            <div
              key={file.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-[#E5E7EB] hover:border-[#D1D5DB] hover:bg-[#F9FAFB] transition-colors group"
            >
              {isImage ? (
                <div className="w-10 h-10 rounded-lg overflow-hidden border border-[#E5E7EB] flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={file.file_name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[#EBF5FF] flex items-center justify-center flex-shrink-0">
                  <FileText size={18} className="text-[#3589FA]" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#111827] truncate">{file.file_name}</p>
                <p className="text-[11px] text-[#9CA3AF]">
                  {formatFileSize(file.size_bytes)} · {isOwn ? 'You' : 'Shared'} · {format(new Date(file.message_created_at), 'MMM d, yyyy')}
                </p>
              </div>
              <a
                href={url}
                download={file.file_name}
                aria-label={`Download ${file.file_name}`}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-[#6B7280] hover:text-[#3589FA] hover:bg-[#EBF5FF] transition-colors md:opacity-0 md:group-hover:opacity-100"
              >
                <Download size={15} />
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Subcomponents ──────────────────────────────────────────────────────────

function HeaderIconBtn({ label, icon, onClick, active, className }: { label: string; icon: React.ReactNode; onClick?: () => void; active?: boolean; className?: string }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
        active ? 'text-[#3589FA] bg-[#EBF5FF]' : 'text-[#6B7280] hover:text-[#1D1C1D] hover:bg-[#F3F4F6]',
        className
      )}
    >
      {icon}
    </button>
  )
}

function TabButton({ label, isActive, onClick, icon }: { label: string; isActive: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      title={label}
      onClick={onClick}
      className={cn(
        'flex h-7 items-center gap-1.5 rounded-md px-2 sm:px-2.5 text-[13px] font-medium transition-colors',
        isActive ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#111827]'
      )}
    >
      {icon}<span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function DetailsAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full h-10 px-3 rounded-lg flex items-center gap-3 text-sm text-[#374151] hover:bg-[#F3F4F6]">
      <span className="text-[#6B7280]">{icon}</span>{label}
    </button>
  )
}

function OfflineBanner({ name, status }: { name: string; status: Profile['status'] }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="mx-3 mb-2 flex flex-shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-[#4B4B4B] sm:mx-5" style={{ background: '#EBF5FF' }}>
      <Bell size={13} className="shrink-0 text-[#3589FA]" />
      <span className="min-w-0 flex-1 truncate">
        <span className="font-semibold">{name}</span> is {status === 'away' ? 'away' : 'offline'}. They will see your message when they are back.
      </span>
      <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="text-[#9CA3AF] hover:text-[#6B7280]"><X size={13} /></button>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex items-end gap-0.5 ml-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1 h-1 rounded-full bg-[#6B7280] animate-bounce" style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.8s' }} />
      ))}
    </span>
  )
}
