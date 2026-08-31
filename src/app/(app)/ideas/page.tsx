'use client'

import { useState } from 'react'
import {
  Lightbulb,
  Plus,
  MessageSquare,
  Sparkles,
  X,
  Trash2,
  Search
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useIdeas, useIdeaComments } from '@/hooks/useIdeas'
import { useProfile } from '@/hooks/useProfile'
import type { Idea, IdeaStatus } from '@/types/database'

const STATUS_CONFIG: Record<
  IdeaStatus,
  { label: string; bg: string; text: string; border: string }
> = {
  under_review: { label: 'Under Review', bg: '#F3E8FF', text: '#7E22CE', border: '#D8B4FE' },
  planned: { label: 'Planned', bg: '#E0F2FE', text: '#0369A1', border: '#7DD3FC' },
  in_progress: { label: 'In Progress', bg: '#FFEDD5', text: '#C2410C', border: '#FDBA74' },
  completed: { label: 'Completed', bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' },
  archived: { label: 'Archived', bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB' }
}

export default function IdeasPage() {
  const { ideas, isLoading, createIdea, updateStatus, deleteIdea, addComment } = useIdeas()
  const { data: currentProfile } = useProfile()

  const [searchQuery, setSearchQuery] = useState('')
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null)

  const filteredIdeas = ideas.filter(
    (i) =>
      i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.description.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newDesc.trim()) return
    await createIdea({ title: newTitle.trim(), description: newDesc.trim() })
    setNewTitle('')
    setNewDesc('')
    setShowSubmitModal(false)
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAFAFA] overflow-hidden">
      {/* Page Header */}
      <header className="bg-white border-b border-[#E4E4E7] px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3 sm:gap-4 flex-shrink-0 shadow-2xs">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-black flex items-center justify-center text-white shadow-sm flex-shrink-0">
            <Lightbulb size={18} />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-[#000000]">Team Ideas</h1>
            <p className="text-xs text-[#71717A] hidden sm:block">
              Share ideas and suggestions so everyone on the team can review and collaborate.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
            <input
              type="text"
              placeholder="Search team ideas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg w-full sm:w-52 focus:outline-none focus:border-[#000000] focus:bg-white transition-all"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-black hover:bg-[#18181B] rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus size={15} /> Submit Idea
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-4 sm:p-6 overflow-y-auto max-w-4xl w-full mx-auto space-y-4">
        {isLoading ? (
          <div className="py-20 flex items-center justify-center text-[#A1A1AA] text-sm gap-2">
            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
            Loading team ideas...
          </div>
        ) : filteredIdeas.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center border border-[#E4E4E7] shadow-xs max-w-md mx-auto my-8">
            <div className="w-14 h-14 rounded-2xl bg-[#F4F4F5] flex items-center justify-center text-black mx-auto mb-3 border border-[#E4E4E7]">
              <Sparkles size={28} />
            </div>
            <h3 className="text-base font-bold text-[#000000] mb-1">No Ideas Submitted Yet</h3>
            <p className="text-xs text-[#71717A] mb-5">
              Submit the first idea to share your thoughts with the team!
            </p>
            <button
              type="button"
              onClick={() => setShowSubmitModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-black hover:bg-[#18181B] rounded-xl shadow-xs"
            >
              Submit Idea
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredIdeas.map((idea) => {
              const statusCfg = STATUS_CONFIG[idea.status] || STATUS_CONFIG.under_review

              return (
                <div
                  key={idea.id}
                  className="bg-white rounded-2xl border border-[#E5E7EB] shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between"
                >
                  {/* Card Top */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      {/* Status Badge */}
                      <span
                        className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border"
                        style={{
                          backgroundColor: statusCfg.bg,
                          color: statusCfg.text,
                          borderColor: statusCfg.border
                        }}
                      >
                        {statusCfg.label}
                      </span>

                      {/* Status Picker & Actions */}
                      <div className="flex items-center gap-2">
                        <select
                          value={idea.status}
                          onChange={(e) =>
                            updateStatus({ ideaId: idea.id, status: e.target.value as IdeaStatus })
                          }
                          className="text-[10px] font-semibold bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2 py-0.5 text-[#475569] cursor-pointer focus:outline-none"
                        >
                          <option value="under_review">Status: Under Review</option>
                          <option value="planned">Status: Planned</option>
                          <option value="in_progress">Status: In Progress</option>
                          <option value="completed">Status: Completed</option>
                          <option value="archived">Status: Archived</option>
                        </select>

                        {currentProfile && idea.author_id === currentProfile.id && (
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Delete this idea?')) deleteIdea(idea.id)
                            }}
                            className="text-[#94A3B8] hover:text-[#DC2626] p-1 rounded-lg"
                            title="Delete Idea"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <h3
                      onClick={() => setSelectedIdea(idea)}
                      className="text-base font-bold text-[#000000] hover:text-[#52525B] transition-colors cursor-pointer mb-2"
                    >
                      {idea.title}
                    </h3>

                    {/* Description */}
                    <p className="text-xs text-[#52525B] leading-relaxed mb-4 whitespace-pre-wrap">
                      {idea.description}
                    </p>
                  </div>

                  {/* Card Footer */}
                  <div className="flex items-center justify-between text-[11px] text-[#71717A] pt-3 border-t border-[#F4F4F5]">
                    <div className="flex items-center gap-2">
                      {idea.author ? (
                        <div className="flex items-center gap-1.5">
                          <Avatar src={idea.author.avatar_url} name={idea.author.display_name} size={20} />
                          <span className="font-semibold text-[#18181B]">{idea.author.display_name}</span>
                        </div>
                      ) : (
                        <span>Anonymous</span>
                      )}
                      <span>•</span>
                      <span>
                        {new Date(idea.created_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedIdea(idea)}
                      className="flex items-center gap-1.5 text-black font-semibold hover:bg-black hover:text-white cursor-pointer bg-[#F4F4F5] border border-[#E4E4E7] px-3 py-1 rounded-lg transition-colors"
                    >
                      <MessageSquare size={13} />
                      {idea.comments_count || 0} Comments
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* MODAL: Submit New Idea */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#E5E7EB]">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-[#D97706]">
                <Lightbulb size={20} />
                <h3 className="text-base font-bold text-[#0D1F31]">Submit Team Idea</h3>
              </div>
              <button onClick={() => setShowSubmitModal(false)} className="text-[#9CA3AF] hover:text-[#0D1F31]">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitIdea} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">Title *</label>
                <input
                  type="text"
                  required
                  placeholder="What is your idea or suggestion?"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#D97706]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">Description *</label>
                <textarea
                  required
                  rows={5}
                  placeholder="Explain the details of your idea so the team can think about it..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#D97706] leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[#4B5563] hover:bg-[#F3F4F6] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-[#B45309] rounded-lg shadow-xs"
                >
                  Submit Idea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Idea Discussion */}
      {selectedIdea && (
        <IdeaDetailModal
          idea={selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onAddComment={addComment}
        />
      )}
    </div>
  )
}

function IdeaDetailModal({
  idea,
  onClose,
  onAddComment
}: {
  idea: Idea
  onClose: () => void
  onAddComment: (params: any) => Promise<any>
}) {
  const [commentText, setCommentText] = useState('')
  const { data: comments = [], isLoading } = useIdeaComments(idea.id)

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    await onAddComment({ ideaId: idea.id, content: commentText.trim() })
    setCommentText('')
  }

  const statusCfg = STATUS_CONFIG[idea.status] || STATUS_CONFIG.under_review

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-[#E5E7EB] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E5E7EB]">
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full border"
            style={{
              backgroundColor: statusCfg.bg,
              color: statusCfg.text,
              borderColor: statusCfg.border
            }}
          >
            {statusCfg.label}
          </span>

          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#0D1F31]">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          <h2 className="text-lg font-bold text-[#0D1F31]">{idea.title}</h2>
          <p className="text-xs text-[#334155] leading-relaxed whitespace-pre-wrap">{idea.description}</p>

          <div className="flex items-center gap-2 text-xs text-[#64748B] pt-2 border-t border-[#F1F5F9]">
            {idea.author && <Avatar src={idea.author.avatar_url} name={idea.author.display_name} size={20} />}
            <span>Submitted by {idea.author?.display_name || 'Anonymous'}</span>
            <span>•</span>
            <span>{new Date(idea.created_at).toLocaleDateString()}</span>
          </div>

          {/* Discussion */}
          <div className="pt-4 border-t border-[#E5E7EB]">
            <h4 className="text-xs font-bold text-[#0D1F31] mb-3 flex items-center gap-1.5">
              <MessageSquare size={14} className="text-[#D97706]" /> Discussion & Feedback ({comments.length})
            </h4>

            <div className="space-y-3 mb-4 max-h-48 overflow-y-auto pr-1">
              {isLoading ? (
                <p className="text-xs text-[#9CA3AF]">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] italic">No comments yet. Share your feedback!</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 bg-[#F8FAFC] p-2.5 rounded-xl border border-[#E2E8F0]">
                    <Avatar src={c.author?.avatar_url} name={c.author?.display_name || 'User'} size={24} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0D1F31]">
                          {c.author?.display_name || 'User'}
                        </span>
                        <span className="text-[10px] text-[#94A3B8]">
                          {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-[#334155] mt-0.5 leading-relaxed">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment Form */}
            <form onSubmit={handleCommentSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Share your thoughts on this idea..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#D97706]"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#D97706] hover:bg-[#B45309] rounded-lg"
              >
                Comment
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
