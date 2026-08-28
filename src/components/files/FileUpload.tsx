'use client'

import { useState } from 'react'
import { X, Upload, File, Image, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { formatFileSize, isImageMime } from '@/lib/utils'

interface FileUploadProps {
  channelId: string
  files: File[]
  onClose: () => void
  onComplete: () => void
}

interface UploadState {
  file: File
  progress: number
  status: 'pending' | 'uploading' | 'done' | 'error'
  error?: string
}

export function FileUpload({ channelId, files, onClose, onComplete }: FileUploadProps) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [uploads, setUploads] = useState<UploadState[]>(
    files.map((f) => ({ file: f, progress: 0, status: 'pending' }))
  )
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleUpload = async () => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Use the send_message RPC (same as MessageInput) — handles membership
      // check and last_read_at bump atomically via SECURITY DEFINER
      const { data: messageId, error: msgError } = await supabase.rpc('send_message', {
        p_channel_id: channelId,
        p_body: message.trim() || null,
        p_parent_id: null,
      })

      if (msgError) throw new Error(msgError.message)
      if (!messageId) throw new Error('Message was not created')

      // Upload each file to Storage then insert attachment record
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const objectKey = `${channelId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

        setUploads((prev) =>
          prev.map((u, idx) => (idx === i ? { ...u, status: 'uploading' } : u))
        )

        const { error: uploadError } = await supabase.storage
          .from('attachments')
          .upload(objectKey, file, { upsert: false })

        if (uploadError) {
          setUploads((prev) =>
            prev.map((u, idx) =>
              idx === i ? { ...u, status: 'error', error: uploadError.message } : u
            )
          )
          continue
        }

        const { error: attachError } = await supabase.from('attachments').insert({
          message_id: messageId,
          uploader_id: (await supabase.auth.getUser()).data.user?.id,
          object_key: objectKey,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size,
        })

        if (attachError) {
          setUploads((prev) =>
            prev.map((u, idx) =>
              idx === i ? { ...u, status: 'error', error: attachError.message } : u
            )
          )
          continue
        }

        setUploads((prev) =>
          prev.map((u, idx) => (idx === i ? { ...u, status: 'done', progress: 100 } : u))
        )
      }

      queryClient.invalidateQueries({ queryKey: ['messages', channelId] })
      onComplete()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-4 mb-3 border border-[#E5E7EB] rounded-lg bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB]">
        <span className="text-sm font-medium text-[#111827]">
          Upload {files.length} file{files.length !== 1 ? 's' : ''}
        </span>
        <button type="button" onClick={onClose} className="p-1 rounded hover:bg-[#F3F4F6] text-[#6B7280]">
          <X size={14} />
        </button>
      </div>

      {/* Error banner */}
      {submitError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-b border-red-100">
          <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-600">{submitError}</p>
        </div>
      )}

      {/* File list */}
      <div className="p-3 space-y-2 max-h-48 overflow-y-auto">
        {uploads.map((upload, i) => (
          <div key={i} className="flex items-center gap-3">
            {isImageMime(upload.file.type) ? (
              <Image size={16} className="text-[#3589FA] flex-shrink-0" />
            ) : (
              <File size={16} className="text-[#6B7280] flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#111827] truncate">{upload.file.name}</p>
              <p className="text-[10px] text-[#9CA3AF]">{formatFileSize(upload.file.size)}</p>
              {upload.error && <p className="text-[10px] text-red-500">{upload.error}</p>}
            </div>
            <div className="flex-shrink-0">
              {upload.status === 'uploading' && <Loader2 size={14} className="animate-spin text-[#3589FA]" />}
              {upload.status === 'done' && <span className="text-[#22C55E] text-xs">✓</span>}
              {upload.status === 'error' && <span className="text-red-500 text-xs">✗</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Message */}
      <div className="px-3 pb-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a message (optional)"
          className="w-full px-2 py-1.5 text-sm border border-[#E5E7EB] rounded focus:outline-none focus:border-[#3589FA]"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={onClose}
          className="px-3 h-7 text-xs border border-[#E5E7EB] rounded text-[#6B7280] hover:bg-[#F9FAFB] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleUpload}
          disabled={isSubmitting}
          className="px-3 h-7 text-xs bg-[#3589FA] text-white rounded hover:bg-[#2558C7] transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {isSubmitting ? <><Loader2 size={12} className="animate-spin" /> Uploading...</> : <><Upload size={12} /> Upload</>}
        </button>
      </div>
    </div>
  )
}
