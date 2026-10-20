'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Smile, Paperclip, Send, Bold, Italic, Strikethrough, Code,
  Link2, List, ListOrdered, Quote, AtSign, Mic, MicOff, Plus, X, FileText,
} from 'lucide-react'
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'
import { useTypingIndicator } from '@/hooks/useTypingIndicator'
import { useProfile } from '@/hooks/useProfile'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient, InfiniteData } from '@tanstack/react-query'
import type { Message } from '@/types/database'
import { cn, formatFileSize, isImageMime } from '@/lib/utils'

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25 MB
const MAX_MESSAGE_LENGTH = 10_000
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/heic',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain', 'text/csv', 'text/markdown',
  // Archives
  'application/zip', 'application/x-zip-compressed',
  // Audio (voice notes)
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg',
  // Video
  'video/mp4', 'video/webm',
])

interface MessageInputProps {
  channelId: string
  parentId?: string
  placeholder?: string
  onFileDrop?: (files: File[]) => void // kept for backward compat
}

export function MessageInput({ channelId, parentId, placeholder }: MessageInputProps) {
  const [body, setBody] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([])
  const [uploadingSet, setUploadingSet] = useState<Set<File>>(new Set())
  const [showEmoji, setShowEmoji] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emojiRef = useRef<HTMLDivElement>(null)
  const emojiBtnRef = useRef<HTMLButtonElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Pre-upload tracking — files are uploaded the moment they're attached,
  // so by the time the user clicks Send the bytes are already in Supabase Storage.
  const uploadedKeysRef = useRef(new Map<File, string | null>()) // File → objectKey (null = failed)
  const uploadPromisesRef = useRef(new Map<File, Promise<string | null>>())

  const { sendTyping } = useTypingIndicator(channelId)
  const { data: profile } = useProfile()
  const supabase = createClient()
  const queryClient = useQueryClient()

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      mediaRecorderRef.current?.stop()
      pendingPreviews.forEach(URL.revokeObjectURL)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmoji) return
    const handler = (e: MouseEvent) => {
      if (!emojiRef.current?.contains(e.target as Node) && !emojiBtnRef.current?.contains(e.target as Node))
        setShowEmoji(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showEmoji])

  // ── Add files + immediate pre-upload ─────────────────────────────────────
  // Files are uploaded to Supabase Storage the MOMENT they are attached.
  // By the time the user clicks Send, upload is done (or close to done).
  // Send only needs to write the tiny DB record — images appear in milliseconds.
  const addFiles = useCallback((newFiles: File[]) => {
    if (!profile?.id) {
      setError('Your session is not ready. Please refresh and try again.')
      return
    }
    const valid: File[] = []
    const rejected: string[] = []

    for (const f of newFiles) {
      if (f.size > MAX_FILE_SIZE) { rejected.push(`${f.name}: exceeds 25 MB limit`); continue }
      if (f.type && !ALLOWED_MIME_TYPES.has(f.type)) { rejected.push(`${f.name}: file type not allowed`); continue }
      valid.push(f)
    }

    if (rejected.length > 0) setError(rejected.join('\n'))
    if (valid.length === 0) return

    setPendingFiles((prev) => [...prev, ...valid])
    setPendingPreviews((prev) => [
      ...prev,
      ...valid.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : '')),
    ])

    // Start uploading each file immediately — fire-and-forget, track progress
    setUploadingSet((prev) => { const s = new Set(prev); valid.forEach((f) => s.add(f)); return s })

    for (const file of valid) {
      const safeExt = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin'
      const objectKey = `${profile.id}/${channelId}/${crypto.randomUUID()}.${safeExt}`
      const promise = supabase.storage
        .from('attachments')
        .upload(objectKey, file, { upsert: false })
        .then(({ error: upErr }: { error: Error | null }) => {
          const key = upErr ? null : objectKey
          uploadedKeysRef.current.set(file, key)
          setUploadingSet((prev) => { const s = new Set(prev); s.delete(file); return s })
          return key
        })
      uploadPromisesRef.current.set(file, promise)
    }
  }, [supabase, profile?.id, channelId])

  const removeFile = (idx: number) => {
    const file = pendingFiles[idx]
    const preview = pendingPreviews[idx]
    if (preview) URL.revokeObjectURL(preview)
    setPendingFiles((prev) => prev.filter((_, i) => i !== idx))
    setPendingPreviews((prev) => prev.filter((_, i) => i !== idx))
    setUploadingSet((prev) => { const s = new Set(prev); s.delete(file); return s })
  }

  // ── Send ───────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = body.trim()
    if ((!trimmed && pendingFiles.length === 0) || isSending) return
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      setError(`Message too long (${trimmed.length.toLocaleString()} / ${MAX_MESSAGE_LENGTH.toLocaleString()} characters)`)
      return
    }

    setError(null)
    setIsSending(true)
    const savedBody = trimmed
    const savedFiles = [...pendingFiles]

    // Clear input immediately
    setBody('')
    setPendingFiles([])
    setUploadingSet(new Set())
    setPendingPreviews((prev) => { prev.forEach(URL.revokeObjectURL); return [] })
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      // Step 1: Create message text — fast (~100ms)
      const { data: messageId, error: msgErr } = await supabase.rpc('send_message', {
        p_channel_id: channelId,
        p_body: savedBody || null,
        p_parent_id: parentId ?? null,
      })
      if (msgErr) throw new Error(msgErr.message)
      if (!messageId) throw new Error('No message ID returned')

      // Step 2: Optimistic insert — message text appears instantly for sender
      const optimisticMsg: Message = {
        id: messageId as string,
        channel_id: channelId,
        user_id: profile?.id ?? null,
        parent_id: parentId ?? null,
        body: savedBody || null,
        edited_at: null,
        deleted_at: null,
        created_at: new Date().toISOString(),
        profiles: profile ?? undefined,
        reactions: [],
        attachments: [],
        reply_count: 0,
      }
      queryClient.setQueryData<InfiniteData<Message[]>>(
        ['messages', channelId, parentId ?? null],
        (old) => {
          if (!old) return old
          const next = [...old.pages]
          next[next.length - 1] = [...(next[next.length - 1] ?? []), optimisticMsg]
          return { ...old, pages: next }
        }
      )

      // Step 3: Insert attachment records.
      // Files were already uploaded to Supabase Storage when attached (pre-upload).
      // We just need to write the tiny DB record — no upload wait here.
      if (savedFiles.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()

        await Promise.all(savedFiles.map(async (file) => {
          try {
            // If pre-upload finished: objectKey is ready. If still in progress: await it.
            let objectKey = uploadedKeysRef.current.get(file) ?? undefined
            if (objectKey === undefined) {
              const promise = uploadPromisesRef.current.get(file)
              objectKey = (promise ? await promise : null) ?? undefined
            }
            if (!objectKey) return // upload failed — skip silently

            await supabase.from('attachments').insert({
              message_id: messageId as string,
              uploader_id: user?.id ?? null,
              object_key: objectKey,
              file_name: file.name,
              mime_type: file.type || null,
              size_bytes: file.size,
            })
            // Realtime INSERT on attachments → appendAttachment → image appears in chat
          } catch { /* silent — message text already delivered */ }
        }))
      }
    } catch (err) {
      setBody(savedBody)
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setIsSending(false)
      // Clean up pre-upload tracking for sent files
      savedFiles.forEach((f) => {
        uploadedKeysRef.current.delete(f)
        uploadPromisesRef.current.delete(f)
      })
    }
  }, [body, pendingFiles, channelId, parentId, isSending, supabase, profile, queryClient]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') { e.preventDefault(); wrapSelection('**') }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); wrapSelection('_') }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value)
    if (error && !e.target.value.trim().length) setError(null)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
    if (profile) sendTyping(profile.display_name)
  }

  // ── Formatting ─────────────────────────────────────────────────────────────
  const wrapSelection = useCallback((before: string, after: string = before) => {
    const el = textareaRef.current
    if (!el) return
    const s = el.selectionStart; const e2 = el.selectionEnd
    const selected = body.substring(s, e2)
    const newBody = body.substring(0, s) + before + selected + after + body.substring(e2)
    setBody(newBody)
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + before.length, e2 + before.length) })
  }, [body])

  const handleEmojiSelect = (data: EmojiClickData) => {
    setBody((prev) => prev + data.emoji)
    setShowEmoji(false)
    textareaRef.current?.focus()
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true) }
  const handleDragLeave = () => setIsDragging(false)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) addFiles(files)
  }
  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
    if (files.length > 0) { e.preventDefault(); addFiles(files) }
  }
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) addFiles(files)
    e.target.value = ''
  }

  // ── Voice recording ────────────────────────────────────────────────────────
  const handleVoiceToggle = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      setIsRecording(false)
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      setRecordingSeconds(0)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
      const mr = new MediaRecorder(stream, { mimeType })
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const ext = mimeType.includes('webm') ? 'webm' : 'ogg'
        addFiles([new File([blob], `voice-note-${Date.now()}.${ext}`, { type: mimeType })])
        stream.getTracks().forEach((t) => t.stop())
      }
      mr.start(250)
      mediaRecorderRef.current = mr
      setIsRecording(true)
      setRecordingSeconds(0)
      timerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000)
    } catch {
      setError('Microphone access denied.')
    }
  }

  const formatSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const bodyLen = body.length
  const nearLimit = bodyLen > MAX_MESSAGE_LENGTH * 0.8
  const overLimit = bodyLen > MAX_MESSAGE_LENGTH
  const canSend = (!!body.trim() || pendingFiles.length > 0) && !isSending && !overLimit

  return (
    <div className="px-2 sm:px-4 pb-2 sm:pb-4 flex-shrink-0">
      {error && <p className="text-xs text-red-500 mb-1 px-1 whitespace-pre-wrap">{error}</p>}
      {nearLimit && !error && (
        <p className={cn('text-xs mb-1 px-1 text-right', overLimit ? 'text-red-500' : 'text-[#9CA3AF]')}>
          {bodyLen.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
        </p>
      )}

      <div
        className={cn(
          'rounded-xl border bg-white transition-all overflow-hidden',
          isDragging ? 'border-[#3589FA] bg-blue-50/30' : 'border-[#D1D5DB] focus-within:border-[#3589FA] shadow-sm'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Formatting toolbar */}
        <div className="flex items-center gap-0.5 px-2 sm:px-3 pt-2 pb-1.5 border-b border-[#F3F4F6] overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <FmtBtn title="Bold (Ctrl+B)" onClick={() => wrapSelection('**')}><Bold size={13} /></FmtBtn>
          <FmtBtn title="Italic (Ctrl+I)" onClick={() => wrapSelection('_')}><Italic size={13} /></FmtBtn>
          <FmtBtn title="Strikethrough" onClick={() => wrapSelection('~~')}><Strikethrough size={13} /></FmtBtn>
          <Sep />
          <FmtBtn title="Link" onClick={() => wrapSelection('[', '](url)')}><Link2 size={13} /></FmtBtn>
          <FmtBtn title="Ordered list" onClick={() => wrapSelection('\n1. ', '')}><ListOrdered size={13} /></FmtBtn>
          <FmtBtn title="Bullet list" onClick={() => wrapSelection('\n- ', '')}><List size={13} /></FmtBtn>
          <Sep />
          <FmtBtn title="Inline code" onClick={() => wrapSelection('`')}><Code size={13} /></FmtBtn>
          <FmtBtn title="Block quote" onClick={() => wrapSelection('\n> ', '')}><Quote size={13} /></FmtBtn>
        </div>

        {/* ── File previews (shows BEFORE sending — like Slack/WhatsApp) ── */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2.5">
            {pendingFiles.map((file, idx) => {
              const preview = pendingPreviews[idx]
              const isImg = isImageMime(file.type)
              return (
                <div key={idx} className="relative group/preview">
                  {isImg && preview ? (
                    /* Image thumbnail */
                    <div className="w-[80px] h-[80px] rounded-lg overflow-hidden border border-[#E5E7EB] bg-[#F9FAFB]">
                      <img src={preview} alt={file.name} className="w-full h-full object-cover" />
                      {uploadingSet.has(file) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                  ) : (
                    /* File card */
                    <div className="flex items-center gap-2 h-[52px] px-3 rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] min-w-0 max-w-[180px]">
                      <div className="w-8 h-8 rounded-lg bg-[#EBF5FF] flex items-center justify-center flex-shrink-0">
                        {uploadingSet.has(file)
                          ? <div className="w-4 h-4 border-2 border-[#3589FA] border-t-transparent rounded-full animate-spin" />
                          : <FileText size={15} className="text-[#3589FA]" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-[#111827] truncate">{file.name}</p>
                        <p className="text-[10px] text-[#9CA3AF]">{uploadingSet.has(file) ? 'Uploading…' : formatFileSize(file.size)}</p>
                      </div>
                    </div>
                  )}
                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#374151] text-white flex items-center justify-center opacity-0 group-hover/preview:opacity-100 transition-opacity shadow"
                  >
                    <X size={10} />
                  </button>
                  {/* Filename tooltip on image */}
                  {isImg && (
                    <p className="mt-0.5 text-[10px] text-[#6B7280] max-w-[80px] truncate text-center">{file.name}</p>
                  )}
                </div>
              )
            })}
            {/* Add more files */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-[52px] h-[52px] rounded-xl border-2 border-dashed border-[#D1D5DB] flex items-center justify-center text-[#9CA3AF] hover:border-[#3589FA] hover:text-[#3589FA] transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>
        )}

        {/* Text input area */}
        {isRecording ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <span className="text-sm text-[#1D1C1D] font-medium">Recording… {formatSeconds(recordingSeconds)}</span>
            <span className="text-xs text-[#9CA3AF]">Click the mic icon to stop</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            value={body}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={placeholder ?? 'Message…'}
            rows={1}
            className="w-full px-4 py-2.5 text-[14px] resize-none focus:outline-none bg-transparent placeholder-[#9CA3AF] text-[#1D1C1D] leading-relaxed"
            style={{ minHeight: 42, maxHeight: 160 }}
          />
        )}

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-0.5">
            {/* Attach */}
            <SecBtn title="Attach files" onClick={() => fileInputRef.current?.click()}><Plus size={15} /></SecBtn>
            <input ref={fileInputRef} type="file" multiple hidden onChange={handleFileChange} />

            {/* Emoji — same backdrop approach as message reactions */}
            <div className="relative">
              <button
                ref={emojiBtnRef}
                type="button"
                title="Emoji"
                onClick={() => setShowEmoji((v) => !v)}
                className="w-7 h-7 flex items-center justify-center rounded text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] transition-colors"
              >
                <Smile size={15} />
              </button>
              {showEmoji && (
                <>
                  <div className="fixed inset-0 z-[199]" onClick={() => setShowEmoji(false)} />
                  <div
                    ref={emojiRef}
                    className="absolute bottom-full left-0 mb-2 z-[200]"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <EmojiPicker onEmojiClick={handleEmojiSelect} height={340} width={300} />
                  </div>
                </>
              )}
            </div>

            {/* @ mention */}
            <SecBtn title="Mention someone" onClick={() => { setBody((b) => b + '@'); textareaRef.current?.focus() }}>
              <AtSign size={14} />
            </SecBtn>

            {/* File (alternate) */}
            <SecBtn title="Attach file" onClick={() => fileInputRef.current?.click()}><Paperclip size={14} /></SecBtn>

            {/* Voice */}
            <button
              type="button"
              title={isRecording ? 'Stop recording' : 'Record voice note'}
              onClick={handleVoiceToggle}
              className={cn(
                'w-7 h-7 flex items-center justify-center rounded transition-colors',
                isRecording ? 'bg-red-100 text-red-500 hover:bg-red-200' : 'text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6]'
              )}
            >
              {isRecording ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          </div>

          {/* Send */}
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            title="Send (Enter)"
            className={cn(
              'w-8 h-8 flex items-center justify-center rounded-lg transition-all',
              canSend
                ? 'bg-[#3589FA] text-white hover:bg-[#2575E8] shadow-sm'
                : 'text-[#D1D5DB] cursor-not-allowed'
            )}
          >
            <Send size={14} className={canSend ? 'translate-x-px' : ''} />
          </button>
        </div>
      </div>
    </div>
  )
}

function FmtBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="w-6 h-6 flex items-center justify-center rounded text-[#9CA3AF] hover:text-[#3589FA] hover:bg-[#EBF5FF] transition-colors">
      {children}
    </button>
  )
}
function SecBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className="w-7 h-7 flex items-center justify-center rounded text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F3F4F6] transition-colors">
      {children}
    </button>
  )
}
function Sep() { return <div className="w-px h-4 bg-[#E5E7EB] mx-0.5 flex-shrink-0" /> }
