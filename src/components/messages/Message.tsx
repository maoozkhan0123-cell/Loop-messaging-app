'use client'

import { useState, useRef, useEffect, memo } from 'react'
import { formatMessageTime, formatShortTime, groupReactions, isImageMime, formatFileSize, cn } from '@/lib/utils'
import { Avatar } from '@/components/ui/Avatar'
import { Pencil, Trash2, Paperclip, Download, Check, CheckCheck, ChevronRight, Plus, Play, Pause, Mic, Bookmark, Copy, Link2 } from 'lucide-react'
import type { Message as MessageType, Attachment } from '@/types/database'
import { useSignedAttachmentUrl } from '@/hooks/useSignedAttachmentUrl'
import { useEditMessage, useDeleteMessage } from '@/hooks/useMessages'
import { useReactions } from '@/hooks/useReactions'
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'
import * as Tooltip from '@radix-ui/react-tooltip'
import { usePreferences } from '@/hooks/usePreferences'

// 5 quick reactions shown in the hover toolbar (WhatsApp / Slack style)
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢']

interface MessageProps {
  message: MessageType
  channelId: string
  currentUserId: string
  showHeader: boolean
  onThreadOpen?: (message: MessageType) => void
}

export const Message = memo(function Message({
  message, channelId, currentUserId, showHeader, onThreadOpen,
}: MessageProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editBody, setEditBody] = useState(message.body ?? '')
  const [showFullPicker, setShowFullPicker] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [saved, setSaved] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const plusBtnRef = useRef<HTMLButtonElement>(null)

  const editMessage = useEditMessage()
  const deleteMessage = useDeleteMessage()
  const { toggleReaction } = useReactions(channelId)
  const { preferences } = usePreferences()

  useEffect(() => {
    try {
      const ids = JSON.parse(localStorage.getItem('bysync.saved-message-ids') || '[]') as string[]
      setSaved(ids.includes(message.id))
    } catch { setSaved(false) }
  }, [message.id])

  const toggleSaved = () => {
    try {
      const ids = new Set(JSON.parse(localStorage.getItem('bysync.saved-message-ids') || '[]') as string[])
      if (ids.has(message.id)) ids.delete(message.id); else ids.add(message.id)
      localStorage.setItem('bysync.saved-message-ids', JSON.stringify([...ids]))
      setSaved(ids.has(message.id))
    } catch {}
  }

  const copyText = () => { if (message.body) void navigator.clipboard.writeText(message.body) }
  const copyLink = () => {
    const kind = location.pathname.startsWith('/dm/') ? 'dm' : 'channel'
    void navigator.clipboard.writeText(`${location.origin}/${kind}/${channelId}?message=${message.id}`)
  }

  const isOwn = message.user_id === currentUserId
  const profile = message.profiles
  const reactions = message.reactions ?? []
  const attachments = message.attachments ?? []
  const grouped = groupReactions(reactions)

  // Close full emoji picker on outside click
  useEffect(() => {
    if (!showFullPicker) return
    const handler = (e: MouseEvent) => {
      if (
        !pickerRef.current?.contains(e.target as Node) &&
        !plusBtnRef.current?.contains(e.target as Node)
      ) setShowFullPicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFullPicker])

  const handleEdit = async () => {
    if (!editBody.trim() || editBody === message.body) { setIsEditing(false); return }
    try {
      await editMessage.mutateAsync({ messageId: message.id, body: editBody, channelId })
      setIsEditing(false)
    } catch { /* noop */ }
  }

  const handleDelete = async () => {
    try { await deleteMessage.mutateAsync({ messageId: message.id, channelId }) } catch { /* noop */ }
  }

  const handleQuickReact = (emoji: string) => {
    toggleReaction.mutate({ messageId: message.id, emoji })
  }

  const handleFullPickerSelect = (data: EmojiClickData) => {
    setShowFullPicker(false)
    toggleReaction.mutate({ messageId: message.id, emoji: data.emoji })
  }

  if (!!message.deleted_at) {
    return (
      <div className="flex gap-3 px-5 py-0.5">
        <p className="text-sm italic text-[#9CA3AF]">This message was deleted.</p>
      </div>
    )
  }

  return (
    <Tooltip.Provider delayDuration={0}>
      <div
        className={cn(
          'group relative flex flex-col gap-1.5 py-1 px-5 transition-colors',
          isEditing ? 'bg-[#f2c74433]' : 'hover:bg-gray-100/60'
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div className="flex items-start gap-2.5">
          {/* Avatar column */}
          {showHeader ? (
            <div className="shrink-0 mt-0.5">
              <Avatar src={profile?.avatar_url} name={profile?.display_name ?? 'Unknown'} size={36} />
            </div>
          ) : (
            <div className="w-9 shrink-0 flex items-center justify-center">
              {hovered && !isEditing && (
                <span className="text-[10px] text-[#9CA3AF] leading-none select-none">
                  {formatShortTime(message.created_at)}
                </span>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            {showHeader && (
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-sm font-bold text-[#111827] leading-snug">
                  {profile?.display_name ?? 'Unknown'}
                </span>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <span tabIndex={0} className="text-xs text-[#9CA3AF] cursor-help leading-snug">
                      {formatShortTime(message.created_at)}
                    </span>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content side="top" className="px-2 py-1 text-xs bg-[#1A1D21] text-white rounded shadow z-50" sideOffset={4}>
                      {formatMessageTime(message.created_at)}
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </div>
            )}

            {/* Body */}
            {isEditing ? (
              <div>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleEdit() }
                    if (e.key === 'Escape') { setIsEditing(false); setEditBody(message.body ?? '') }
                  }}
                  className="w-full px-3 py-2 text-sm border border-[#3589FA] rounded resize-none focus:outline-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex items-center gap-2 mt-1 text-xs text-[#6B7280]">
                  <span>Esc to cancel · Enter to save</span>
                  <button type="button" onClick={() => void handleEdit()} className="flex items-center gap-1 text-[#3589FA] hover:underline">
                    <Check size={12} /> Save
                  </button>
                  <button type="button" onClick={() => { setIsEditing(false); setEditBody(message.body ?? '') }} className="hover:underline">Cancel</button>
                </div>
              </div>
            ) : (
              <p className="text-[14px] text-[#111827] leading-relaxed whitespace-pre-wrap break-words">
                {message.body}
                {message.edited_at && <span className="text-[11px] text-[#9CA3AF] ml-1">(edited)</span>}
              </p>
            )}

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {attachments.map((att) => <AttachmentCard key={att.id} attachment={att} showInlineImages={preferences.mediaPreview} showPreview={preferences.attachmentPreview} />)}
              </div>
            )}

            {/* Reaction pills */}
            {grouped.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {grouped.map(({ emoji, userIds, count }) => {
                  const reacted = userIds.includes(currentUserId)
                  return (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => handleQuickReact(emoji)}
                      className={cn(
                        'flex items-center gap-1 h-6 px-2 rounded-full border text-xs transition-colors select-none',
                        reacted
                          ? 'bg-[#EBF5FF] border-[#3589FA] text-[#3589FA]'
                          : 'bg-[#F3F4F6] border-transparent text-[#6B7280] hover:border-[#9CA3AF]'
                      )}
                    >
                      <span className="text-[13px]">{emoji}</span>
                      <span className="font-semibold text-[11px]">{count}</span>
                    </button>
                  )
                })}
                {/* + add more */}
                <button
                  type="button"
                  onClick={() => setShowFullPicker(true)}
                  className="flex items-center justify-center w-6 h-6 rounded-full border border-dashed border-[#D1D5DB] text-[#9CA3AF] hover:border-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                >
                  <Plus size={10} />
                </button>
              </div>
            )}

            {/* Delivered tick — own messages */}
            {isOwn && !isEditing && (
              <div className="flex justify-end mt-0.5 pr-1">
                <CheckCheck size={11} className="text-[#3589FA]" aria-label="Delivered" />
              </div>
            )}

            {/* Thread bar — channels only */}
            {(message.reply_count ?? 0) > 0 && !isEditing && onThreadOpen && (
              <button
                type="button"
                onClick={() => onThreadOpen(message)}
                className="group/thread flex items-center gap-2 p-1 max-w-[600px] rounded hover:bg-white border border-transparent hover:border-[#E5E7EB] transition-all mt-0.5"
              >
                <span className="text-xs font-bold text-[#3589FA]">
                  {message.reply_count} {message.reply_count === 1 ? 'reply' : 'replies'}
                </span>
                <span className="text-xs text-[#9CA3AF] group-hover/thread:hidden">Last reply in thread</span>
                <span className="text-xs text-[#9CA3AF] hidden group-hover/thread:inline">View thread</span>
                <ChevronRight size={13} className="text-[#9CA3AF] ml-auto opacity-0 group-hover/thread:opacity-100 shrink-0" />
              </button>
            )}
          </div>
        </div>

        {/* ── Hover action toolbar: 5 quick emojis + edit/delete ── */}
        {hovered && !isEditing && (
          <div
            className="absolute right-4 -top-4 flex items-center bg-white border border-[#E5E7EB] rounded-xl shadow-md px-1.5 py-0.5 z-10 gap-0.5"
          >
            {/* Quick reactions */}
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleQuickReact(emoji)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[16px] hover:bg-[#F3F4F6] transition-colors"
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}

            {/* More emojis */}
            <button
              ref={plusBtnRef}
              type="button"
              onClick={() => setShowFullPicker((v) => !v)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
              title="More reactions"
            >
              <Plus size={14} />
            </button>

            <div className="w-px h-4 bg-[#E5E7EB] mx-0.5" />

            {/* Thread reply — channels only */}
            {onThreadOpen && (
              <ActionBtn label="Reply in thread" onClick={() => onThreadOpen(message)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
                </svg>
              </ActionBtn>
            )}

            <ActionBtn label={saved ? 'Remove from saved' : 'Save message'} onClick={toggleSaved} active={saved}>
              <Bookmark size={13} fill={saved ? 'currentColor' : 'none'} />
            </ActionBtn>
            <ActionBtn label="Copy message text" onClick={copyText}>
              <Copy size={13} />
            </ActionBtn>
            <ActionBtn label="Copy message link" onClick={copyLink}>
              <Link2 size={13} />
            </ActionBtn>

            {/* Edit — own messages */}
            {isOwn && (
              <ActionBtn label="Edit message" onClick={() => { setIsEditing(true); setEditBody(message.body ?? '') }}>
                <Pencil size={13} />
              </ActionBtn>
            )}

            {/* Delete — own messages */}
            {isOwn && (
              <ActionBtn label="Delete message" onClick={() => setShowDeleteModal(true)} danger>
                <Trash2 size={13} />
              </ActionBtn>
            )}
          </div>
        )}

        {/* Full emoji picker — fixed backdrop */}
        {showFullPicker && (
          <>
            <div className="fixed inset-0 z-[199]" onClick={() => setShowFullPicker(false)} />
            <div
              ref={pickerRef}
              className="absolute right-4 top-6 z-[200]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <EmojiPicker onEmojiClick={handleFullPickerSelect} height={360} width={300} />
            </div>
          </>
        )}

        {/* Custom delete confirmation modal */}
        {showDeleteModal && (
          <>
            <div className="fixed inset-0 z-[500] bg-black/40 backdrop-blur-[1px]" onClick={() => setShowDeleteModal(false)} />
            <div className="fixed inset-0 z-[501] flex items-center justify-center pointer-events-none">
              <div className="bg-white rounded-2xl shadow-2xl w-[340px] mx-4 pointer-events-auto overflow-hidden">
                <div className="px-6 pt-5 pb-4">
                  <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-3">
                    <Trash2 size={18} className="text-red-500" />
                  </div>
                  <h3 className="font-bold text-[16px] text-[#111827] mb-1">Delete message?</h3>
                  <p className="text-[13px] text-[#6B7280]">This cannot be undone. The message will be permanently removed.</p>
                </div>
                <div className="flex border-t border-[#F3F4F6]">
                  <button
                    type="button"
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 h-12 text-[14px] font-medium text-[#6B7280] hover:bg-[#F9FAFB] transition-colors border-r border-[#F3F4F6]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowDeleteModal(false); void handleDelete() }}
                    className="flex-1 h-12 text-[14px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Tooltip.Provider>
  )
})

function ActionBtn({ label, onClick, children, danger, active }: { label: string; onClick?: () => void; children: React.ReactNode; danger?: boolean; active?: boolean }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
            danger ? 'text-[#9CA3AF] hover:text-red-500 hover:bg-red-50' : active ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[#9CA3AF] hover:text-[#111827] hover:bg-[#F3F4F6]'
          )}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="top" className="px-2 py-1 text-xs bg-[#1A1D21] text-white rounded shadow z-[300]" sideOffset={4}>
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

function ImageAttachment({ url, attachment }: { url: string; attachment: Attachment }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="rounded-xl overflow-hidden border border-[#E5E7EB] max-w-xs group/img relative">
      {!loaded && (
        <div className="w-64 h-40 bg-[#F3F4F6] animate-pulse rounded-xl" />
      )}
      {/* Attachment URLs are signed and short-lived. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={attachment.file_name}
        onLoad={() => setLoaded(true)}
        className={cn('max-w-full object-contain transition-opacity duration-200', loaded ? 'opacity-100' : 'opacity-0 absolute inset-0')}
        style={{ maxHeight: 280 }}
      />
      <a
        href={url} download={attachment.file_name}
        className="absolute top-1.5 right-1.5 w-7 h-7 flex items-center justify-center rounded-lg bg-black/50 text-white opacity-0 group-hover/img:opacity-100 transition-opacity"
      >
        <Download size={13} />
      </a>
    </div>
  )
}

function AttachmentCard({ attachment, showInlineImages, showPreview }: { attachment: Attachment; showInlineImages: boolean; showPreview: boolean }) {
  const isImage = isImageMime(attachment.mime_type)
  const isAudio = attachment.mime_type?.startsWith('audio/')
  const { data: url, isLoading } = useSignedAttachmentUrl(attachment.object_key)

  if (isLoading || !url) {
    return <div className="w-64 h-14 bg-[#F3F4F6] animate-pulse rounded-xl" />
  }

  if (isImage && showInlineImages && showPreview) {
    return <ImageAttachment url={url} attachment={attachment} />
  }

  if (isAudio) {
    return <AudioPlayer url={url} />
  }

  return (
    <div className="flex items-center gap-3 p-3 border border-[#E5E7EB] rounded-xl max-w-xs bg-[#F9FAFB] group/file">
      <div className="w-9 h-9 rounded-lg bg-[#EBF5FF] flex items-center justify-center flex-shrink-0">
        <Paperclip size={15} className="text-[#3589FA]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-[#111827] truncate">{attachment.file_name}</p>
        <p className="text-[11px] text-[#9CA3AF]">{formatFileSize(attachment.size_bytes)}</p>
      </div>
      <a href={url} download={attachment.file_name}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-[#6B7280] hover:text-[#3589FA] hover:bg-[#EBF5FF] transition-colors opacity-0 group-hover/file:opacity-100"
      >
        <Download size={13} />
      </a>
    </div>
  )
}

function AudioPlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const toggle = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause() } else { void audioRef.current.play() }
    setPlaying((v) => !v)
  }

  const fmt = (s: number) => {
    const safe = isFinite(s) ? s : 0
    return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, '0')}`
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  const progress = duration ? (current / duration) * 100 : 0

  return (
    <div className="flex items-center gap-2.5 bg-[#F3F4F6] rounded-2xl px-3 py-2.5 w-[240px]">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => { setPlaying(false); setCurrent(0) }}
      />
      <button
        type="button"
        onClick={toggle}
        className="w-8 h-8 rounded-full bg-[#3589FA] flex items-center justify-center flex-shrink-0 hover:bg-[#2575E8] transition-colors"
      >
        {playing
          ? <Pause size={13} className="text-white" />
          : <Play size={13} className="text-white ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {/* Progress bar — clickable */}
        <div
          className="h-1 bg-[#D1D5DB] rounded-full cursor-pointer relative"
          onClick={handleSeek}
        >
          <div
            className="absolute left-0 top-0 h-full bg-[#3589FA] rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-[#9CA3AF]">{fmt(current)}</span>
          <span className="text-[10px] text-[#9CA3AF]">{fmt(duration)}</span>
        </div>
      </div>

      <Mic size={12} className="text-[#9CA3AF] flex-shrink-0" />
    </div>
  )
}
