'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Smile, Paperclip, Send, Bold, Italic, Strikethrough, Code,
  Link2, List, ListOrdered, Quote, AtSign, Mic, MicOff, Plus, X, FileText, Clock,
} from 'lucide-react'
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react'
import { useTypingIndicator } from '@/hooks/useTypingIndicator'
import { useProfile } from '@/hooks/useProfile'
import { createClient } from '@/lib/supabase/client'
import { useQuery, useQueryClient, InfiniteData } from '@tanstack/react-query'
import { Avatar } from '@/components/ui/Avatar'
import { useAllProfiles } from '@/hooks/useProfiles'
import type { Message } from '@/types/database'
import { cn, formatFileSize, isImageMime } from '@/lib/utils'
import { usePreferences } from '@/hooks/usePreferences'
import { bumpThreadReplyCount } from '@/hooks/useMessages'
import { htmlToMarkdown, markdownToHtml } from '@/lib/richText'

// About 8 lines of 14px text before the box starts scrolling.
const MAX_INPUT_HEIGHT = 208

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
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [scheduleFor, setScheduleFor] = useState('')
  const [scheduleMin, setScheduleMin] = useState('')

  const editorRef = useRef<HTMLDivElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const [active, setActive] = useState<Record<string, boolean>>({})
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
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
  const { data: allProfiles = [] } = useAllProfiles()
  // People who can be @mentioned: the other members of this conversation.
  const { data: memberIds = [] } = useQuery({
    queryKey: ['channel-member-ids', channelId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await createClient().from('channel_members').select('user_id').eq('channel_id', channelId)
      return ((data ?? []) as Array<{ user_id: string }>).map((row) => row.user_id)
    },
  })
  const [mention, setMention] = useState<{ query: string; node: Text; start: number; index: number } | null>(null)
  const mentionMatches = mention
    ? allProfiles.filter((person) => person.id !== profile?.id && memberIds.includes(person.id) && person.display_name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 6)
    : []
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { preferences } = usePreferences()
  const draftKey = `bysync.draft.${channelId}.${parentId ?? 'root'}`

  /** Replaces the whole message (draft restore, clear after send, failed send). */
  const replaceBody = useCallback((markdown: string) => {
    setBody(markdown)
    if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(markdown)
  }, [])

  // Restore and preserve unsent text per conversation. Files remain session-only.
  useEffect(() => {
    try { replaceBody(sessionStorage.getItem(draftKey) ?? '') } catch { replaceBody('') }
  }, [draftKey, replaceBody])

  useEffect(() => {
    try {
      if (body) sessionStorage.setItem(draftKey, body)
      else sessionStorage.removeItem(draftKey)
    } catch {}
  }, [body, draftKey])

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
    const pendingUpload = uploadPromisesRef.current.get(file)
    if (pendingUpload) {
      void pendingUpload.then((objectKey) => {
        if (objectKey) void supabase.storage.from('attachments').remove([objectKey])
      })
    }
    uploadedKeysRef.current.delete(file)
    uploadPromisesRef.current.delete(file)
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
    replaceBody('')
    try { sessionStorage.removeItem(draftKey) } catch {}
    setPendingFiles([])
    setUploadingSet(new Set())
    setPendingPreviews((prev) => { prev.forEach(URL.revokeObjectURL); return [] })

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
      if (parentId) bumpThreadReplyCount(queryClient, channelId, parentId)

      // Step 3: Insert attachment records.
      // Files were already uploaded to Supabase Storage when attached (pre-upload).
      // We just need to write the tiny DB record — no upload wait here.
      if (savedFiles.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()

        const attachmentErrors = (await Promise.all(savedFiles.map(async (file) => {
          try {
            // If pre-upload finished: objectKey is ready. If still in progress: await it.
            let objectKey = uploadedKeysRef.current.get(file) ?? undefined
            if (objectKey === undefined) {
              const promise = uploadPromisesRef.current.get(file)
              objectKey = (promise ? await promise : null) ?? undefined
            }
            if (!objectKey) return `${file.name}: upload failed`

            const { error: attachmentError } = await supabase.from('attachments').insert({
              message_id: messageId as string,
              uploader_id: user?.id ?? null,
              object_key: objectKey,
              file_name: file.name,
              mime_type: file.type || null,
              size_bytes: file.size,
            })
            if (attachmentError) {
              await supabase.storage.from('attachments').remove([objectKey])
              return `${file.name}: ${attachmentError.message}`
            }
            return null
            // Realtime INSERT on attachments → appendAttachment → image appears in chat
          } catch (fileError) {
            return `${file.name}: ${fileError instanceof Error ? fileError.message : 'upload failed'}`
          }
        }))).filter(Boolean)
        if (attachmentErrors.length) setError(`Message sent, but some files failed:\n${attachmentErrors.join('\n')}`)
        void queryClient.invalidateQueries({ queryKey: ['my-files'] })
        void queryClient.invalidateQueries({ queryKey: ['channel-files', channelId] })
      }
    } catch (err) {
      replaceBody(savedBody)
      setError(err instanceof Error ? err.message : 'Failed to send')
    } finally {
      setIsSending(false)
      // Clean up pre-upload tracking for sent files
      savedFiles.forEach((f) => {
        uploadedKeysRef.current.delete(f)
        uploadPromisesRef.current.delete(f)
      })
    }
  }, [body, pendingFiles, channelId, parentId, isSending, supabase, profile, queryClient, draftKey, replaceBody])

  const handleSchedule = async () => {
    const trimmed = body.trim()
    if (!trimmed || !profile?.id || !scheduleFor) return
    const when = new Date(scheduleFor)
    if (when <= new Date()) { setError('Choose a time in the future.'); return }
    setIsSending(true); setError(null)
    try {
      const { error: scheduleError } = await supabase.from('scheduled_messages').insert({
        user_id: profile.id, channel_id: channelId, parent_id: parentId ?? null,
        body: trimmed, scheduled_for: when.toISOString(), status: 'pending',
      })
      if (scheduleError) throw scheduleError
      replaceBody(''); setScheduleFor(''); setScheduleOpen(false)
      try { sessionStorage.removeItem(draftKey) } catch {}
      void queryClient.invalidateQueries({ queryKey: ['scheduled-messages'] })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not schedule this message. Apply migration 010 first.')
    } finally { setIsSending(false) }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.nativeEvent.isComposing) return
    if (mention && mentionMatches.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const step = e.key === 'ArrowDown' ? 1 : -1; setMention({ ...mention, index: (mention.index + step + mentionMatches.length) % mentionMatches.length }); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(mentionMatches[mention.index]?.display_name ?? mentionMatches[0].display_name); return }
      if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && preferences.enterToSend) { e.preventDefault(); void handleSend() }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !preferences.enterToSend) { e.preventDefault(); void handleSend() }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'x') { e.preventDefault(); format('strikeThrough') }
  }

  const syncFromEditor = () => {
    const el = editorRef.current
    if (!el) return
    const markdown = htmlToMarkdown(el)
    // Leave the box truly empty so the placeholder shows again.
    if (!markdown && !el.querySelector('ul,ol,blockquote,pre')) el.innerHTML = ''
    setBody(markdown)
    if (error && !markdown) setError(null)
  }

  const handleInput = () => {
    syncFromEditor()
    updateMention()
    if (profile) sendTyping(profile.display_name)
  }

  // ── @mentions ──────────────────────────────────────────────────────────────
  // "@" plus letters right before the cursor opens the people list for this conversation.
  const updateMention = () => {
    const selection = document.getSelection()
    const node = selection?.anchorNode
    if (!selection?.isCollapsed || !node || node.nodeType !== Node.TEXT_NODE || !editorRef.current?.contains(node)) { setMention(null); return }
    const before = (node.textContent ?? '').slice(0, selection.anchorOffset)
    const match = before.match(/(^|\s)@([A-Za-z.'-]*(?: [A-Za-z.'-]*)?)$/)
    setMention(match ? { query: match[2], node: node as Text, start: selection.anchorOffset - match[2].length - 1, index: 0 } : null)
  }

  const pickMention = (name: string) => {
    if (!mention) return
    const selection = document.getSelection()
    if (!selection) return
    const range = document.createRange()
    range.setStart(mention.node, mention.start)
    range.setEnd(mention.node, selection.anchorNode === mention.node ? selection.anchorOffset : (mention.node.textContent ?? '').length)
    selection.removeAllRanges(); selection.addRange(range)
    document.execCommand('insertText', false, `@${name} `)
    setMention(null)
    syncFromEditor()
  }

  // ── Formatting ─────────────────────────────────────────────────────────────
  // Highlight the toolbar buttons that apply at the cursor, like Slack.
  const refreshActive = useCallback(() => {
    const el = editorRef.current
    const selection = document.getSelection()
    if (!el || !selection?.rangeCount || !el.contains(selection.anchorNode)) return
    savedRangeRef.current = selection.getRangeAt(0).cloneRange()
    const block = String(document.queryCommandValue('formatBlock')).toLowerCase()
    const inCode = !!(selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement)?.closest('code')
    setActive({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      blockquote: block === 'blockquote',
      pre: block === 'pre',
      code: inCode,
    })
  }, [])

  useEffect(() => {
    document.addEventListener('selectionchange', refreshActive)
    return () => document.removeEventListener('selectionchange', refreshActive)
  }, [refreshActive])

  /** Puts the cursor back where it was before a toolbar click or picker. */
  const restoreSelection = () => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    const selection = document.getSelection()
    const range = savedRangeRef.current
    if (selection && range && el.contains(range.startContainer)) { selection.removeAllRanges(); selection.addRange(range) }
    else if (selection) { const end = document.createRange(); end.selectNodeContents(el); end.collapse(false); selection.removeAllRanges(); selection.addRange(end) }
  }

  const format = (command: string) => {
    restoreSelection()
    document.execCommand('styleWithCSS', false, 'false')
    if (command === 'blockquote' || command === 'pre') {
      const current = String(document.queryCommandValue('formatBlock')).toLowerCase()
      document.execCommand('formatBlock', false, current === command ? 'div' : command)
    } else {
      document.execCommand(command)
    }
    syncFromEditor(); refreshActive()
  }

  const toggleInlineCode = () => {
    restoreSelection()
    const selection = document.getSelection()
    if (!selection?.rangeCount) return
    const range = selection.getRangeAt(0)
    const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
    const existing = startEl?.closest('code')
    if (existing && editorRef.current?.contains(existing)) {
      existing.replaceWith(document.createTextNode(existing.textContent ?? ''))
    } else {
      const code = document.createElement('code')
      code.textContent = range.collapsed ? 'code' : range.toString()
      range.deleteContents()
      range.insertNode(code)
      // A zero-width space after the code lets typing continue outside it.
      const after = document.createTextNode('\u200B')
      code.after(after)
      const caret = document.createRange()
      if (range.collapsed && code.textContent === 'code') caret.selectNodeContents(code)
      else caret.setStart(after, 1)
      selection.removeAllRanges(); selection.addRange(caret)
    }
    syncFromEditor(); refreshActive()
  }

  const openLink = () => {
    restoreSelection()
    setLinkUrl('')
    setLinkOpen(true)
  }

  const applyLink = () => {
    const raw = linkUrl.trim()
    setLinkOpen(false)
    if (!raw) return
    const url = /^(https?:\/\/|mailto:)/i.test(raw) ? raw : `https://${raw}`
    restoreSelection()
    const selection = document.getSelection()
    if (selection?.isCollapsed) {
      const link = document.createElement('a')
      link.href = url; link.textContent = raw
      selection.getRangeAt(0).insertNode(link)
      const caret = document.createRange(); caret.setStartAfter(link)
      selection.removeAllRanges(); selection.addRange(caret)
    } else {
      document.execCommand('createLink', false, url)
    }
    syncFromEditor()
  }

  /** Inserts plain text at the cursor (emoji, @). */
  const insertText = (text: string) => {
    restoreSelection()
    document.execCommand('insertText', false, text)
    syncFromEditor()
  }

  const handleEmojiSelect = (data: EmojiClickData) => {
    setShowEmoji(false)
    insertText(data.emoji)
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
    if (files.length > 0) { e.preventDefault(); addFiles(files); return }
    // Paste as plain text so styles from other apps don't leak into the message.
    e.preventDefault()
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
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
    <div className="relative px-3 sm:px-5 pb-3 sm:pb-5 flex-shrink-0">
      {mention && mentionMatches.length > 0 && (
        <div role="listbox" aria-label="Mention someone" className="absolute bottom-full left-3 right-3 z-[210] mb-1 max-w-sm overflow-hidden rounded-xl border border-[#E5E7EB] bg-white py-1 shadow-xl sm:left-5">
          <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">People in this conversation</p>
          {mentionMatches.map((person, index) => (
            <button key={person.id} type="button" role="option" aria-selected={index === mention.index}
              onMouseDown={(event) => { event.preventDefault(); pickMention(person.display_name) }}
              className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm', index === mention.index ? 'bg-[#EBF5FF]' : 'hover:bg-[#F3F4F6]')}>
              <Avatar src={person.avatar_url} name={person.display_name} size={24} status={person.status} />
              <span className="min-w-0 flex-1 truncate font-medium text-[#111827]">{person.display_name}</span>
              <span className="truncate text-xs text-[#9CA3AF]">{person.job_title}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-500 mb-1 px-1 whitespace-pre-wrap">{error}</p>}
      {nearLimit && !error && (
        <p className={cn('text-xs mb-1 px-1 text-right', overLimit ? 'text-red-500' : 'text-[#9CA3AF]')}>
          {bodyLen.toLocaleString()} / {MAX_MESSAGE_LENGTH.toLocaleString()}
        </p>
      )}

      <div
        className={cn(
          'rounded-2xl border bg-white transition-all overflow-hidden',
          isDragging ? 'border-[#3589FA] bg-blue-50/30' : 'border-[#E5E7EB] shadow-sm focus-within:border-[#3589FA] focus-within:shadow-[0_0_0_3px_rgba(53,137,250,0.12)]'
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Formatting toolbar */}
        {preferences.markdownHelp && <div className="flex items-center gap-0.5 px-2 sm:px-3 pt-2 pb-1.5 border-b border-[#F3F4F6] overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <FmtBtn title="Bold (Ctrl+B)" active={active.bold} onClick={() => format('bold')}><Bold size={14} /></FmtBtn>
          <FmtBtn title="Italic (Ctrl+I)" active={active.italic} onClick={() => format('italic')}><Italic size={14} /></FmtBtn>
          <FmtBtn title="Strikethrough (Ctrl+Shift+X)" active={active.strikeThrough} onClick={() => format('strikeThrough')}><Strikethrough size={14} /></FmtBtn>
          <Sep />
          <FmtBtn title="Link" active={linkOpen} onClick={openLink}><Link2 size={14} /></FmtBtn>
          <FmtBtn title="Numbered list" active={active.insertOrderedList} onClick={() => format('insertOrderedList')}><ListOrdered size={14} /></FmtBtn>
          <FmtBtn title="Bulleted list" active={active.insertUnorderedList} onClick={() => format('insertUnorderedList')}><List size={14} /></FmtBtn>
          <Sep />
          <FmtBtn title="Code" active={active.code} onClick={toggleInlineCode}><Code size={14} /></FmtBtn>
          <FmtBtn title="Code block" active={active.pre} onClick={() => format('pre')}><FileText size={14} /></FmtBtn>
          <FmtBtn title="Quote" active={active.blockquote} onClick={() => format('blockquote')}><Quote size={14} /></FmtBtn>
        </div>}
        {linkOpen && (
          <div className="flex items-center gap-2 border-b border-[#F3F4F6] px-3 py-2">
            <Link2 size={14} className="flex-shrink-0 text-[#9CA3AF]" />
            <input
              autoFocus
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); applyLink() }
                if (event.key === 'Escape') { event.preventDefault(); setLinkOpen(false); restoreSelection() }
              }}
              placeholder="Paste or type a link"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-[#111827] placeholder-[#9CA3AF] focus:outline-none"
            />
            <button type="button" onClick={() => { setLinkOpen(false); restoreSelection() }} className="h-7 rounded-md px-2 text-xs font-semibold text-[#6B7280] hover:bg-[#F3F4F6]">Cancel</button>
            <button type="button" onClick={applyLink} disabled={!linkUrl.trim()} className="h-7 rounded-md bg-[#3589FA] px-3 text-xs font-bold text-white disabled:opacity-50">Add link</button>
          </div>
        )}

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
                      {/* Local blob preview cannot be optimized by next/image. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
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
          <div
            ref={editorRef}
            role="textbox"
            aria-multiline="true"
            aria-label={placeholder ?? 'Message'}
            contentEditable
            suppressContentEditableWarning
            data-placeholder={placeholder ?? 'Message…'}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onKeyUp={refreshActive}
            onMouseUp={refreshActive}
            onBlur={() => setMention(null)}
            className="message-editor w-full overflow-y-auto px-4 py-2.5 text-[14px] leading-relaxed text-[#1D1C1D] focus:outline-none break-words"
            style={{ minHeight: 44, maxHeight: MAX_INPUT_HEIGHT }}
          />
        )}

        {/* Bottom toolbar */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-0.5">
            {/* Attach */}
            <SecBtn title="Attach files" onClick={() => fileInputRef.current?.click()}><Paperclip size={15} /></SecBtn>
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
            <SecBtn title="Mention someone" onClick={() => { insertText('@'); updateMention() }}>
              <AtSign size={14} />
            </SecBtn>


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

          <div className="flex items-center gap-1">
          <div className="relative">
            <button type="button" onClick={() => { setScheduleMin(new Date(Date.now() + 60000).toISOString().slice(0,16)); setScheduleOpen((value) => !value) }} disabled={!body.trim() || pendingFiles.length > 0} title="Schedule message" className="flex h-8 w-8 items-center justify-center rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#3589FA] disabled:cursor-not-allowed disabled:opacity-40"><Clock size={14}/></button>
            {scheduleOpen && <div className="absolute bottom-11 right-0 z-[210] w-72 rounded-xl border border-[#E5E7EB] bg-white p-3 shadow-xl"><p className="mb-2 text-xs font-bold text-[#111827]">Schedule message</p><input type="datetime-local" value={scheduleFor} min={scheduleMin} onChange={(event) => setScheduleFor(event.target.value)} className="h-9 w-full rounded-lg border border-[#D1D5DB] px-2 text-xs text-[#111827]"/><div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setScheduleOpen(false)} className="h-8 rounded-lg px-3 text-xs font-semibold text-[#6B7280]">Cancel</button><button type="button" onClick={() => void handleSchedule()} disabled={!scheduleFor || isSending} className="h-8 rounded-lg bg-[#3589FA] px-3 text-xs font-bold text-white disabled:opacity-50">Schedule</button></div></div>}
          </div>

          {/* Send */}
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!canSend}
            title={preferences.enterToSend ? 'Send (Enter)' : 'Send (Ctrl+Enter)'}
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
    </div>
  )
}

function FmtBtn({ title, onClick, active, children }: { title: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} aria-pressed={!!active} onMouseDown={(event) => event.preventDefault()} onClick={onClick}
      className={cn('w-7 h-7 flex items-center justify-center rounded-md transition-colors', active ? 'bg-[#EBF5FF] text-[#3589FA]' : 'text-[#6B7280] hover:text-[#3589FA] hover:bg-[#EBF5FF]')}>
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
