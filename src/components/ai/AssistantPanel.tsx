'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp, CalendarDays, Check, FolderKanban, Loader2, MessageSquareText, RotateCcw, Sparkles, SquarePen, User, X } from 'lucide-react'
import { formatMessage } from '@/lib/formatMessage'
import { cn } from '@/lib/utils'
import type { TaskProposal } from '@/lib/ai/tools'

/** Open the assistant from anywhere: window.dispatchEvent(new CustomEvent(OPEN_AI_EVENT, { detail })). */
export const OPEN_AI_EVENT = 'bysync:open-ai'
export type OpenAiDetail = { prompt?: string; context?: { type: 'task' | 'channel'; id: string } }
export function openAssistant(detail: OpenAiDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenAiDetail>(OPEN_AI_EVENT, { detail }))
}

type Turn = { role: 'user' | 'assistant'; content: string; proposals?: Array<TaskProposal & { state?: 'saving' | 'created' | 'cancelled' | 'failed'; createdTaskId?: string; error?: string }> }

const SUGGESTIONS = [
  { icon: FolderKanban, text: 'What should I work on today?' },
  { icon: CalendarDays, text: 'What is due this week?' },
  { icon: MessageSquareText, text: 'Catch me up on #general' },
  { icon: SquarePen, text: 'Create a task for me to review the designs, due Friday' },
]

export function AssistantPanel() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [context, setContext] = useState<OpenAiDetail['context']>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const send = useCallback(async (text: string, history: Turn[], ctx?: OpenAiDetail['context']) => {
    const question = text.trim()
    if (!question || busy) return
    const next: Turn[] = [...history, { role: 'user', content: question }]
    setTurns(next); setInput(''); setError(null); setBusy(true)
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          context: ctx,
          today: new Date().toLocaleDateString('en-CA'),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'The assistant could not answer.')
      setTurns([...next, { role: 'assistant', content: body.reply, proposals: body.proposals }])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The assistant could not answer.')
    } finally {
      setBusy(false)
    }
  }, [busy])

  // Opened from the top bar or a "Summarise with AI" button, optionally with a question to ask right away.
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<OpenAiDetail>).detail ?? {}
      setOpen(true)
      if (detail.context) setContext(detail.context)
      if (detail.prompt) void send(detail.prompt, turns, detail.context ?? context)
      else window.setTimeout(() => inputRef.current?.focus(), 150)
    }
    window.addEventListener(OPEN_AI_EVENT, handle)
    return () => window.removeEventListener(OPEN_AI_EVENT, handle)
  }, [send, turns, context])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [turns, busy])

  const updateProposal = (turnIndex: number, proposalId: string, patch: Partial<NonNullable<Turn['proposals']>[number]>) =>
    setTurns((current) => current.map((turn, index) => index !== turnIndex ? turn : { ...turn, proposals: turn.proposals?.map((item) => item.id === proposalId ? { ...item, ...patch } : item) }))

  const confirm = async (turnIndex: number, proposal: TaskProposal) => {
    updateProposal(turnIndex, proposal.id, { state: 'saving', error: undefined })
    try {
      const response = await fetch('/api/ai/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proposal) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'The task could not be created.')
      updateProposal(turnIndex, proposal.id, { state: 'created', createdTaskId: body.taskId })
      for (const key of [['dashboard'], ['unified-inbox'], ['project_tasks'], ['project_tasks_workspace']]) void queryClient.invalidateQueries({ queryKey: key })
    } catch (cause) {
      updateProposal(turnIndex, proposal.id, { state: 'failed', error: cause instanceof Error ? cause.message : 'The task could not be created.' })
    }
  }

  const reset = () => { setTurns([]); setError(null); setContext(undefined); inputRef.current?.focus() }
  const retry = () => {
    const lastUser = [...turns].reverse().find((turn) => turn.role === 'user')
    if (!lastUser) return
    void send(lastUser.content, turns.slice(0, turns.lastIndexOf(lastUser)), context)
  }

  return <AnimatePresence>
    {open && <>
      <motion.div key="ai-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="fixed inset-0 z-[150] bg-black/20 sm:bg-transparent" />
      <motion.aside key="ai-panel" role="dialog" aria-label="Bytechsol AI" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed inset-y-0 right-0 z-[151] flex w-full flex-col bg-white shadow-2xl sm:w-[440px] sm:rounded-l-2xl sm:border-l sm:border-[#E5E7EB]">
        <header className="flex h-[60px] flex-shrink-0 items-center gap-3 border-b border-[#E5E7EB] px-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--primary)] to-[#27AAE1] text-white"><Sparkles size={17} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-[#111827]">Bytechsol AI</h2>
            <p className="truncate text-xs text-[#6B7280]">{context ? `Looking at this ${context.type}` : 'Answers from your workspace'}</p>
          </div>
          {turns.length > 0 && <button type="button" onClick={reset} title="New chat" aria-label="New chat" className="grid h-8 w-8 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]"><SquarePen size={16} /></button>}
          <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="grid h-8 w-8 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]"><X size={17} /></button>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {!turns.length && !busy ? <div>
            <h3 className="text-lg font-bold text-[#111827]">How can I help?</h3>
            <p className="mt-1 text-sm text-[#6B7280]">Ask about your tasks, projects, messages or calendar. I only see what you can see.</p>
            <div className="mt-5 space-y-2">{SUGGESTIONS.map(({ icon: Icon, text }) => <button key={text} type="button" onClick={() => void send(text, turns, context)}
              className="flex w-full items-center gap-3 rounded-xl border border-[#E5E7EB] px-3.5 py-3 text-left text-sm text-[#374151] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]">
              <Icon size={16} className="flex-shrink-0 text-[var(--primary)]" />{text}
            </button>)}</div>
          </div> : <div className="space-y-5">
            {turns.map((turn, index) => turn.role === 'user'
              ? <div key={index} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--primary)] px-3.5 py-2.5 text-sm text-white">{turn.content}</div></div>
              : <div key={index} className="flex gap-2.5">
                <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]"><Sparkles size={14} /></span>
                <div className="min-w-0 flex-1">
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#111827]">{formatMessage(turn.content)}</div>
                  {turn.proposals?.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} onConfirm={() => void confirm(index, proposal)} onCancel={() => updateProposal(index, proposal.id, { state: 'cancelled' })} />)}
                </div>
              </div>)}
            {busy && <div className="flex items-center gap-2.5 text-sm text-[#6B7280]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]"><Loader2 size={14} className="animate-spin" /></span>Looking through your workspace…</div>}
          </div>}
          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <span className="flex-1">{error}</span>
            <button type="button" onClick={retry} className="flex flex-shrink-0 items-center gap-1 font-semibold hover:underline"><RotateCcw size={13} />Retry</button>
          </div>}
        </div>

        <form onSubmit={(event) => { event.preventDefault(); void send(input, turns, context) }} className="flex-shrink-0 border-t border-[#E5E7EB] p-3">
          <div className="flex items-end gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 focus-within:border-[var(--primary)] focus-within:shadow-[0_0_0_3px_var(--focus-ring)]">
            <textarea ref={inputRef} value={input} rows={1} maxLength={4000} disabled={busy}
              onChange={(event) => { setInput(event.target.value); event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px` }}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(input, turns, context) } }}
              placeholder="Ask anything about your work…" aria-label="Message Bytechsol AI"
              className="max-h-[140px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white transition-opacity disabled:opacity-40"><ArrowUp size={16} /></button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-[#9CA3AF]">AI can make mistakes. Check important details.</p>
        </form>
      </motion.aside>
    </>}
  </AnimatePresence>
}

function ProposalCard({ proposal, onConfirm, onCancel }: { proposal: NonNullable<Turn['proposals']>[number]; onConfirm: () => void; onCancel: () => void }) {
  const done = proposal.state === 'created'
  return <div className={cn('mt-3 rounded-xl border p-3.5', done ? 'border-emerald-200 bg-emerald-50' : proposal.state === 'cancelled' ? 'border-[#E5E7EB] bg-[#F9FAFB] opacity-60' : 'border-[var(--primary)]/40 bg-[var(--primary-soft)]')}>
    <p className="text-[11px] font-bold uppercase tracking-wider text-[#6B7280]">{done ? 'Task created' : proposal.state === 'cancelled' ? 'Cancelled' : 'New task: review and confirm'}</p>
    <p className="mt-1 text-sm font-semibold text-[#111827]">{proposal.title}</p>
    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[#4B5563]">
      <span className="flex items-center gap-1"><FolderKanban size={12} />{proposal.boardName}</span>
      <span className="flex items-center gap-1"><User size={12} />{proposal.assigneeName ?? 'Unassigned'}</span>
      <span className="flex items-center gap-1"><CalendarDays size={12} />{proposal.dueDate ?? 'No due date'}</span>
      <span className="capitalize">Priority: {proposal.priority}</span>
    </dl>
    {proposal.description && <p className="mt-2 line-clamp-3 text-xs text-[#4B5563]">{proposal.description}</p>}
    {proposal.error && <p className="mt-2 text-xs font-medium text-red-600">{proposal.error}</p>}
    {done ? <Link href={`/projects?board=${proposal.boardId}&task=${proposal.createdTaskId}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"><Check size={13} />Open task</Link>
      : proposal.state !== 'cancelled' && <div className="mt-3 flex gap-2">
        <button type="button" onClick={onConfirm} disabled={proposal.state === 'saving'} className="flex h-8 items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 text-xs font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-60">{proposal.state === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}Confirm</button>
        <button type="button" onClick={onCancel} disabled={proposal.state === 'saving'} className="h-8 rounded-lg px-3 text-xs font-semibold text-[#6B7280] hover:bg-white">Cancel</button>
      </div>}
  </div>
}
