'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Hash, Lock, MessageSquare, Users, Info, ChevronDown,
  Headphones, Bell, Search, MoreHorizontal, X, Plus, Paperclip,
  Download, FileText,
} from 'lucide-react'
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

interface MessagePaneProps {
  channel: ChannelWithMember
  currentUserId: string
}

type ActiveTab = 'messages' | 'files'

export function MessagePane({ channel, currentUserId }: MessagePaneProps) {
  const [threadMessage, setThreadMessage] = useState<Message | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>('messages')
  const [chatSearchOpen, setChatSearchOpen] = useState(false)
  const [chatSearchQuery, setChatSearchQuery] = useState('')
  const { typingUsers } = useTypingIndicator(channel.id)
  const markRead = useMarkRead()

  const isDM = channel.type === 'dm' || channel.type === 'group_dm'
  const other = channel.other_member as { display_name: string } | undefined
  const channelName = isDM ? (other?.display_name ?? 'Direct Message') : (channel.name ?? 'Channel')
  const Icon = channel.type === 'private' ? Lock : isDM ? MessageSquare : Hash

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

  return (
    <div className="flex flex-1 min-w-0 h-full relative">
      {/* Main pane */}
      <div className="flex flex-col flex-1 min-w-0 h-full bg-white">

        {/* Header row 1 */}
        <div className="bg-white border-b border-[#E5E7EB] flex-shrink-0">
          <div className="flex items-center justify-between px-2 sm:px-4 h-[49px]">
            <button
              type="button"
              className="flex items-center gap-1.5 font-bold text-[14px] sm:text-[15px] text-[#1D1C1D] hover:bg-[#F8F8F8] px-1.5 sm:px-2 py-1 rounded transition-colors max-w-[170px] sm:max-w-none"
            >
              {isDM ? (
                <span className="truncate">{channelName}</span>
              ) : (
                <>
                  <Icon size={15} className="text-[#6B7280] shrink-0" />
                  <span className="truncate">{channelName}</span>
                </>
              )}
              <ChevronDown size={13} className="ml-0.5 text-[#9CA3AF] shrink-0" />
            </button>

            <div className="flex items-center gap-0.5">
              {isDM && (
                <>
                  <HeaderIconBtn label="Call" icon={<Headphones size={16} />} className="hidden sm:flex" />
                  <HeaderIconBtn label="Notifications" icon={<Bell size={16} />} className="hidden sm:flex" />
                </>
              )}
              {/* In-chat search toggle */}
              <HeaderIconBtn
                label="Search in this conversation"
                icon={<Search size={16} />}
                onClick={handleSearchToggle}
                active={chatSearchOpen}
              />
              <HeaderIconBtn label="More" icon={<MoreHorizontal size={16} />} />
              {isDM && (
                <HeaderIconBtn label="Close" icon={<X size={16} />} onClick={() => window.history.back()} />
              )}
              {!isDM && (
                <>
                  <div className="w-px h-4 bg-[#E5E7EB] mx-1 hidden sm:block" />
                  <button type="button" className="hidden sm:flex items-center gap-1.5 h-7 px-2 rounded text-sm text-[#6B7280] hover:bg-[#F3F4F6] transition-colors">
                    <Users size={14} />
                    <span className="text-sm">Members</span>
                  </button>
                  <HeaderIconBtn label="Details" icon={<Info size={16} />} className="hidden sm:flex" />
                </>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex items-center px-2 sm:px-4 gap-0 overflow-x-auto" style={{ borderTop: '1px solid #F3F4F6' }}>
            <TabButton label="Messages" isActive={activeTab === 'messages'} onClick={() => setActiveTab('messages')} icon={<MessageSquare size={13} />} />
            <TabButton label="Files" isActive={activeTab === 'files'} onClick={() => setActiveTab('files')} icon={<Paperclip size={13} />} />
            <button type="button" className="flex items-center justify-center w-7 h-7 ml-1 rounded text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] transition-colors flex-shrink-0">
              <Plus size={14} />
            </button>
          </div>

          {/* In-chat search bar */}
          <AnimatePresence>
            {chatSearchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 44, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden border-t border-[#F3F4F6]"
              >
                <div className="flex items-center gap-2 px-3 sm:px-4 h-[44px]">
                  <Search size={14} className="text-[#9CA3AF] flex-shrink-0" />
                  <input
                    autoFocus
                    value={chatSearchQuery}
                    onChange={(e) => setChatSearchQuery(e.target.value)}
                    placeholder={`Search in ${isDM ? channelName : '#' + channelName}…`}
                    className="flex-1 text-[13px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none min-w-0"
                  />
                  {chatSearchQuery && (
                    <button type="button" onClick={() => setChatSearchQuery('')} className="text-[#9CA3AF] hover:text-[#6B7280]">
                      <X size={14} />
                    </button>
                  )}
                  <button type="button" onClick={handleSearchToggle} className="text-[11px] text-[#6B7280] hover:text-[#111827] ml-1 px-2 py-1 rounded border border-[#E5E7EB] hover:bg-[#F3F4F6]">
                    Esc
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
            />

            {/* Typing indicator */}
            <div className="px-3 sm:px-5 h-5 flex items-center flex-shrink-0">
              {typingUsers.length > 0 && (
                <p className="text-xs text-[#6B7280] truncate">
                  {typingUsers.map((u) => u.display_name).join(', ')}{' '}
                  {typingUsers.length === 1 ? 'is' : 'are'} typing
                  <TypingDots />
                </p>
              )}
            </div>

            {isDM && <OfflineBanner name={channelName} />}

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
    </div>
  )
}

// ── Files tab ──────────────────────────────────────────────────────────────

function FilesTab({ channelId, currentUserId }: { channelId: string; currentUserId: string }) {
  const { data: files, isLoading } = useChannelFiles(channelId)

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#3589FA] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!files || files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Paperclip size={32} className="text-[#D1D5DB] mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-[#374151] mb-1">No files yet</p>
          <p className="text-[12px] text-[#9CA3AF]">Files shared in this conversation will appear here.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto py-4 px-5">
      <p className="text-[11px] font-semibold text-[#6B7280] uppercase tracking-wider mb-3">
        {files.length} file{files.length !== 1 ? 's' : ''}
      </p>
      <div className="flex flex-col gap-2">
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
                className="opacity-0 group-hover:opacity-100 w-8 h-8 flex items-center justify-center rounded-lg text-[#6B7280] hover:text-[#3589FA] hover:bg-[#EBF5FF] transition-all"
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
      onClick={onClick}
      className={cn(
        'w-8 h-8 flex items-center justify-center rounded transition-colors',
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
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 h-9 px-3 text-sm font-medium transition-all border-b-2 -mb-px',
        isActive ? 'text-[#3589FA] border-[#3589FA]' : 'text-[#6B7280] border-transparent hover:text-[#1D1C1D] hover:bg-[#F8F8F8]'
      )}
    >
      {icon}{label}
    </button>
  )
}

function OfflineBanner({ name }: { name: string }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <div className="flex items-center gap-2 px-5 py-2 flex-shrink-0 text-[13px] text-[#4B4B4B]" style={{ background: '#EBF5FF', borderTop: '1px solid #C7E2FF' }}>
      <Bell size={13} className="shrink-0 text-[#3589FA]" />
      <span>
        They will see your messages when they get back.{' '}
        <button type="button" className="text-[#3589FA] font-semibold hover:underline">Notify anyway?</button>
      </span>
      <button type="button" onClick={() => setDismissed(true)} className="ml-auto text-[#9CA3AF] hover:text-[#6B7280]"><X size={13} /></button>
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
