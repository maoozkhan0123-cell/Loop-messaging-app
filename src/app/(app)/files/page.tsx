'use client'

import { useRef, useState } from 'react'
import { Download, FileText, Image as ImageIcon, File, Hash, MessageSquare, Search, X, RefreshCw, ExternalLink, Upload } from 'lucide-react'
import { useMyFiles } from '@/hooks/useMyFiles'
import { useChannels } from '@/hooks/useChannels'
import { useProfile } from '@/hooks/useProfile'
import { FileUpload } from '@/components/files/FileUpload'
import { isImageMime, formatFileSize, cn } from '@/lib/utils'
import { format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { GanttChart, ViewSwitcher, type WorkView } from '@/components/ui/WorkViews'

type FilterType = 'all' | 'images' | 'documents' | 'other'

function channelLabel(channel: { type: string; name?: string | null; other_member?: unknown }) {
  if (channel.type === 'dm' || channel.type === 'group_dm') {
    const member = channel.other_member as { display_name?: string } | undefined
    return `DM — ${member?.display_name ?? 'Unknown member'}`
  }
  return `# ${channel.name}`
}

export default function FilesPage() {
  const { data: files, isLoading, isError, error, refetch, isFetching } = useMyFiles()
  const router = useRouter()
  const { data: me } = useProfile()
  const { data: channels = [] } = useChannels()
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [uploadChannelId, setUploadChannelId] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [workView, setWorkView] = useState<WorkView>('list')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const availableChannels = channels.filter((channel) => !channel.archived_at)
  // Never silently choose the first channel: users must explicitly pick where a file is shared.
  const selectedUploadChannel = availableChannels.find((channel) => channel.id === uploadChannelId)

  const filtered = (files ?? []).filter((f) => {
    const isImg = isImageMime(f.mime_type)
    const isDoc = !isImg && (
      f.mime_type?.includes('pdf') ||
      f.mime_type?.includes('word') ||
      f.mime_type?.includes('document') ||
      f.mime_type?.includes('spreadsheet') ||
      f.mime_type?.includes('presentation') ||
      f.mime_type?.includes('text/')
    )

    if (filter === 'images' && !isImg) return false
    if (filter === 'documents' && !isDoc) return false
    if (filter === 'other' && (isImg || isDoc)) return false
    if (search.trim()) {
      return f.file_name.toLowerCase().includes(search.toLowerCase())
    }
    return true
  })

  const counts = {
    all: (files ?? []).length,
    images: (files ?? []).filter((f) => isImageMime(f.mime_type)).length,
    documents: (files ?? []).filter((f) => {
      if (isImageMime(f.mime_type)) return false
      return f.mime_type?.includes('pdf') || f.mime_type?.includes('word') ||
        f.mime_type?.includes('document') || f.mime_type?.includes('spreadsheet') ||
        f.mime_type?.includes('presentation') || f.mime_type?.includes('text/')
    }).length,
    other: 0,
  }
  counts.other = (files ?? []).length - counts.images - counts.documents

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="border-b border-[#DDE8F2] px-4 sm:px-6 pt-4 sm:pt-5 pb-0 flex-shrink-0 bg-[#F8FBFD]">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h1 className="text-[20px] sm:text-[22px] font-bold text-[#101828]">Files</h1><p className="mt-0.5 text-xs text-[#667085]">Browse and share files across your workspace.</p></div>
          <div className="flex items-center gap-2">
            <select value={uploadChannelId} onChange={(event) => setUploadChannelId(event.target.value)} className="h-9 min-w-0 max-w-52 rounded-lg border border-[#D6E2EC] bg-white px-2.5 text-xs text-[#344054] outline-none focus:border-[#289ED8]" aria-label="Upload destination">
              <option value="" disabled>Select destination…</option>
              {availableChannels.map((channel) => <option key={channel.id} value={channel.id}>{channelLabel(channel)}</option>)}
            </select>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => { setPendingFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = '' }} />
            <button type="button" disabled={!selectedUploadChannel} onClick={() => fileInputRef.current?.click()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--primary)] px-3.5 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"><Upload size={14} /> Upload</button>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-0 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {(['all', 'images', 'documents', 'other'] as FilterType[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={cn(
                'flex items-center gap-1.5 h-9 px-3 sm:px-4 text-[13px] font-medium border-b-2 transition-all capitalize flex-shrink-0',
                filter === tab
                  ? 'text-[#289ED8] border-[#289ED8]'
                  : 'text-[#6B7280] border-transparent hover:text-[#1D1C1D]'
              )}
            >
              {tab === 'images' && <ImageIcon size={13} />}
              {tab === 'documents' && <FileText size={13} />}
              {tab === 'other' && <File size={13} />}
              {tab}
              <span className={cn(
                'ml-0.5 text-[11px] px-1.5 py-0.5 rounded-full',
                filter === tab ? 'bg-[#EAF7FC] text-[#289ED8]' : 'bg-[#F3F4F6] text-[#9CA3AF]'
              )}>
                {counts[tab]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="px-4 sm:px-6 py-3 border-b border-[#F3F4F6] flex-shrink-0 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] max-w-sm focus-within:border-[#3589FA] focus-within:bg-white transition-colors">
          <Search size={14} className="text-[#9CA3AF] flex-shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files…"
            className="flex-1 text-[13px] bg-transparent focus:outline-none text-[#111827] placeholder-[#9CA3AF] min-w-0"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="text-[#9CA3AF] hover:text-[#6B7280]">
              <X size={13} />
            </button>
          )}
        </div>
        <ViewSwitcher value={workView} onChange={setWorkView} />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-[#3589FA] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : isError ? (
        <div className="flex-1 flex items-center justify-center px-4"><div className="max-w-md text-center"><div className="w-14 h-14 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto mb-3"><FileText size={24} /></div><p className="text-[15px] font-semibold text-[#374151]">Files could not be loaded</p><p className="text-xs text-[#9CA3AF] mt-1 mb-4">{error instanceof Error ? error.message : 'Please check your connection and try again.'}</p><button type="button" onClick={() => void refetch()} disabled={isFetching} className="h-9 px-4 rounded-lg bg-[#3589FA] text-white text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-60"><RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />Retry</button></div></div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-[#F3F4F6] flex items-center justify-center mx-auto mb-3">
              <FileText size={28} className="text-[#D1D5DB]" />
            </div>
            <p className="text-[15px] font-semibold text-[#374151] mb-1">No files found</p>
            <p className="text-[13px] text-[#9CA3AF]">
              {search ? `No files match "${search}"` : 'Files shared in your channels will appear here.'}
            </p>
            {!search && <button type="button" onClick={() => router.push('/people')} className="mt-4 h-9 px-4 rounded-lg bg-[#3589FA] text-white text-sm font-semibold">Open a conversation</button>}
          </div>
        </div>
      ) : workView === 'gantt' ? (
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="mb-3"><p className="text-sm font-semibold text-[var(--foreground)]">File activity timeline</p><p className="text-[11px] text-[var(--muted-foreground)]">Files arranged by the date they were shared.</p></div>
          <GanttChart items={filtered.map((file) => ({ id: file.id, title: file.file_name, subtitle: `${file.uploader_name || 'Team member'}${file.channel_name ? ` · ${file.channel_name}` : ''}`, start: file.message_created_at, end: file.message_created_at, color: isImageMime(file.mime_type) ? '#8B5CF6' : '#289ED8', onClick: () => { if (file.signed_url) window.open(file.signed_url, '_blank', 'noopener,noreferrer') } }))} emptyText="No file activity to show." />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
          <p className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3">
            {filtered.length} file{filtered.length !== 1 ? 's' : ''}
          </p>
          <div className="flex flex-col gap-1.5">
            {filtered.map((file) => {
              const isImg = isImageMime(file.mime_type)
              const isOwn = file.sender_id === me?.id
              const url = file.signed_url ?? ''
              const isDM = file.channel_type === 'dm' || file.channel_type === 'group_dm'

              return (
                <div
                  key={file.id}
                  className="flex items-center gap-3 p-3 rounded-xl border border-transparent hover:border-[#E5E7EB] hover:bg-[#F9FAFB] transition-all group"
                >
                  {/* Thumbnail / icon */}
                  {isImg ? (
                    <a href={url} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-lg overflow-hidden border border-[#E5E7EB] flex-shrink-0 hover:opacity-90 transition-opacity">
                      {/* Signed storage URLs are short-lived and should not be cached by an image optimizer. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={file.file_name} className="w-full h-full object-cover" />
                    </a>
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[#EBF5FF] flex items-center justify-center flex-shrink-0">
                      <FileText size={20} className="text-[#3589FA]" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#111827] truncate">{file.file_name}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-[#9CA3AF]">{formatFileSize(file.size_bytes)}</span>
                      <span className="text-[#D1D5DB] text-[11px]">·</span>
                      <span className="text-[11px] text-[#9CA3AF]">{isOwn ? 'You' : (file.uploader_name || 'Team member')}</span>
                      {file.channel_name && (
                        <>
                          <span className="text-[#D1D5DB] text-[11px]">·</span>
                          <span className="flex items-center gap-0.5 text-[11px] text-[#9CA3AF]">
                            {isDM ? <MessageSquare size={10} /> : <Hash size={10} />}
                            {file.channel_name}
                          </span>
                        </>
                      )}
                      <span className="text-[#D1D5DB] text-[11px]">·</span>
                      <span className="text-[11px] text-[#9CA3AF]">
                        {format(new Date(file.message_created_at), 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>

                  {/* Download */}
                  <a
                    href={url}
                    download={file.file_name}
                    className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 w-9 h-9 flex items-center justify-center rounded-lg text-[#6B7280] hover:text-[#3589FA] hover:bg-[#EBF5FF] transition-all flex-shrink-0"
                    title="Download"
                  >
                    <Download size={16} />
                  </a>
                  {file.channel_id && <button type="button" title="Open conversation" onClick={() => router.push(`${isDM ? '/dm' : '/channel'}/${file.channel_id}`)} className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 w-9 h-9 flex items-center justify-center rounded-lg text-[#6B7280] hover:text-[#3589FA] hover:bg-[#EBF5FF] transition-all flex-shrink-0"><ExternalLink size={15} /></button>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {pendingFiles.length > 0 && selectedUploadChannel && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#101828]/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setPendingFiles([]) }}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-2 shadow-2xl">
            <FileUpload channelId={selectedUploadChannel.id} destinationLabel={channelLabel(selectedUploadChannel)} files={pendingFiles} onClose={() => setPendingFiles([])} onComplete={() => { setPendingFiles([]); void refetch() }} />
          </div>
        </div>
      )}
    </div>
  )
}
