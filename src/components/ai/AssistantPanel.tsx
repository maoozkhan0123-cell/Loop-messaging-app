'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isToday, isYesterday, subDays, format } from 'date-fns'
import { ArrowLeft, ArrowUp, CalendarDays, Check, FolderKanban, History, Loader2, MessageSquareText, RotateCcw, Sparkles, SquarePen, Trash2, User, X } from 'lucide-react'
import { formatMessage } from '@/lib/formatMessage'
import { createClient } from '@/lib/supabase/client'
import { useProfile } from '@/hooks/useProfile'
import { useAllProfiles } from '@/hooks/useProfiles'
import { Avatar } from '@/components/ui/Avatar'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { cn } from '@/lib/utils'
import type { TaskProposal } from '@/lib/ai/tools'

/** Open the assistant from anywhere: window.dispatchEvent(new CustomEvent(OPEN_AI_EVENT, { detail })). */
export const OPEN_AI_EVENT = 'bysync:open-ai'
export type OpenAiDetail = { prompt?: string; context?: { type: 'task' | 'channel'; id: string } }
export function openAssistant(detail: OpenAiDetail = {}) {
  window.dispatchEvent(new CustomEvent<OpenAiDetail>(OPEN_AI_EVENT, { detail }))
}

type Proposal = TaskProposal & { state?: 'saving' | 'created' | 'cancelled' | 'failed'; createdTaskId?: string; error?: string }
type Turn = { role: 'user' | 'assistant'; content: string; messageId?: string; proposals?: Proposal[] }
type Conversation = { id: string; title: string; updated_at: string }

type Language = 'auto' | 'english' | 'roman_urdu'
const LANGUAGES: Array<[Language, string]> = [['auto', 'Auto'], ['english', 'English'], ['roman_urdu', 'Roman Urdu']]
const LANGUAGE_KEY = 'bysync.ai.language'

const SUGGESTIONS: Record<'english' | 'roman_urdu', Array<{ icon: typeof FolderKanban; text: string }>> = {
  english: [
    { icon: FolderKanban, text: 'What should I work on today?' },
    { icon: CalendarDays, text: 'What is due this week?' },
    { icon: MessageSquareText, text: 'Catch me up on #general' },
    { icon: SquarePen, text: 'Create a task for me to review the designs, due Friday' },
  ],
  roman_urdu: [
    { icon: FolderKanban, text: 'Aaj mujhe kis task par kaam karna chahiye?' },
    { icon: CalendarDays, text: 'Is hafte mere kaun se tasks due hain?' },
    { icon: MessageSquareText, text: '#general mein kya baat hui? Short mein batao' },
    { icon: SquarePen, text: 'Mere liye designs review karne ka task banao, Friday tak' },
  ],
}

function groupLabel(iso: string) {
  const date = new Date(iso)
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  if (date > subDays(new Date(), 7)) return 'Previous 7 days'
  return 'Older'
}

export function AssistantPanel() {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const { data: me } = useProfile()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'chat' | 'history'>('chat')
  const [turns, setTurns] = useState<Turn[]>([])
  const [conversationId, setConversationId] = useState<string>()
  const [title, setTitle] = useState<string>()
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadingChat, setLoadingChat] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [context, setContext] = useState<OpenAiDetail['context']>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lastChatKey = me ? `bysync.ai.last-chat.${me.id}` : null
  const { data: profiles = [] } = useAllProfiles()
  const [language, setLanguage] = useState<Language>('auto')
  const [mention, setMention] = useState<{ query: string; start: number; index: number } | null>(null)

  useEffect(() => {
    try { const saved = localStorage.getItem(LANGUAGE_KEY) as Language | null; if (saved && LANGUAGES.some(([value]) => value === saved)) setLanguage(saved) } catch {}
  }, [])
  const chooseLanguage = (value: Language) => { setLanguage(value); try { localStorage.setItem(LANGUAGE_KEY, value) } catch {} }

  // @mentions: typing "@" lists teammates; picking one inserts "@Name" so the assistant knows who is meant.
  const mentionMatches = mention
    ? profiles.filter((person) => person.id !== me?.id && person.display_name.toLowerCase().includes(mention.query.toLowerCase())).slice(0, 5)
    : []
  const updateMention = (value: string, caret: number) => {
    const match = value.slice(0, caret).match(/(^|\s)@([A-Za-z.'-]*(?: [A-Za-z.'-]*)?)$/)
    setMention(match ? { query: match[2], start: caret - match[2].length - 1, index: 0 } : null)
  }
  const pickMention = (name: string) => {
    if (!mention) return
    const el = inputRef.current
    const caret = el?.selectionStart ?? input.length
    const next = `${input.slice(0, mention.start)}@${name} ${input.slice(caret)}`
    setInput(next); setMention(null)
    window.requestAnimationFrame(() => { const position = mention.start + name.length + 2; el?.focus(); el?.setSelectionRange(position, position) })
  }

  // Saved chats (migration 017). An empty list when history is not set up.
  const { data: historyResult, isLoading: loadingHistory } = useQuery({
    queryKey: ['ai-conversations', me?.id],
    enabled: open && !!me && view === 'history',
    queryFn: async () => {
      const { data, error: listError } = await supabase.from('ai_conversations').select('id,title,updated_at').order('updated_at', { ascending: false }).limit(100)
      // PGRST205 / 42P01: the history tables (migration 017) are not in the database yet.
      if (listError) return { conversations: [] as Conversation[], unavailable: ['PGRST205', '42P01'].includes(listError.code ?? '') ? 'setup' as const : 'error' as const }
      return { conversations: (data ?? []) as Conversation[], unavailable: null }
    },
  })
  const conversations = historyResult?.conversations ?? []

  const loadConversation = useCallback(async (id: string) => {
    setLoadingChat(true); setError(null); setView('chat')
    const [{ data: chat }, { data: rows, error: loadError }] = await Promise.all([
      supabase.from('ai_conversations').select('title').eq('id', id).maybeSingle(),
      supabase.from('ai_messages').select('id,role,content,proposals').eq('conversation_id', id).order('created_at'),
    ])
    setLoadingChat(false)
    if (loadError || !chat) { setError('That chat could not be opened.'); return false }
    setConversationId(id); setTitle(chat.title); setContext(undefined)
    setTurns(((rows ?? []) as Array<{ id: string; role: Turn['role']; content: string; proposals: Proposal[] | null }>).map((row) => ({
      role: row.role, content: row.content, messageId: row.role === 'assistant' ? row.id : undefined,
      proposals: row.proposals?.length ? row.proposals : undefined,
    })))
    try { if (lastChatKey) localStorage.setItem(lastChatKey, id) } catch {}
    return true
  }, [supabase, lastChatKey])

  // Reopen the last chat after a reload, like ClickUp Brain.
  useEffect(() => {
    if (!open || !lastChatKey || conversationId || turns.length) return
    let saved: string | null = null
    try { saved = localStorage.getItem(lastChatKey) } catch {}
    if (saved) void loadConversation(saved).then((ok) => { if (!ok) try { localStorage.removeItem(lastChatKey) } catch {} })
  }, [open, lastChatKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (text: string, history: Turn[], ctx?: OpenAiDetail['context'], chatId?: string) => {
    const question = text.trim()
    if (!question || busy) return
    const next: Turn[] = [...history, { role: 'user', content: question }]
    setTurns(next); setInput(''); setError(null); setBusy(true); setView('chat')
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map(({ role, content }) => ({ role, content })),
          context: ctx,
          conversationId: chatId,
          language,
          today: new Date().toLocaleDateString('en-CA'),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'The assistant could not answer.')
      setTurns([...next, { role: 'assistant', content: body.reply, proposals: body.proposals?.length ? body.proposals : undefined, messageId: body.messageId }])
      if (body.conversationId) {
        if (!chatId) setTitle(question.replace(/\s+/g, ' ').slice(0, 80))
        setConversationId(body.conversationId)
        try { if (lastChatKey) localStorage.setItem(lastChatKey, body.conversationId) } catch {}
        void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The assistant could not answer.')
    } finally {
      setBusy(false)
    }
  }, [busy, lastChatKey, queryClient, language])

  const newChat = useCallback(() => {
    setTurns([]); setConversationId(undefined); setTitle(undefined); setError(null); setContext(undefined); setView('chat')
    try { if (lastChatKey) localStorage.removeItem(lastChatKey) } catch {}
  }, [lastChatKey])

  // Opened from the top bar or a "Summarise with AI" button. A button with a question starts a fresh chat.
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<OpenAiDetail>).detail ?? {}
      setOpen(true)
      if (detail.prompt) {
        newChat()
        setContext(detail.context)
        void send(detail.prompt, [], detail.context, undefined)
      } else window.setTimeout(() => inputRef.current?.focus(), 150)
    }
    window.addEventListener(OPEN_AI_EVENT, handle)
    return () => window.removeEventListener(OPEN_AI_EVENT, handle)
  }, [send, newChat])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [turns, busy, view])

  const updateProposal = (turnIndex: number, proposalId: string, patch: Partial<Proposal>) =>
    setTurns((current) => current.map((turn, index) => index !== turnIndex ? turn : { ...turn, proposals: turn.proposals?.map((item) => item.id === proposalId ? { ...item, ...patch } : item) }))

  const confirm = async (turnIndex: number, proposal: Proposal) => {
    updateProposal(turnIndex, proposal.id, { state: 'saving', error: undefined })
    try {
      const response = await fetch('/api/ai/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...proposal, messageId: turns[turnIndex]?.messageId }) })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'The task could not be created.')
      updateProposal(turnIndex, proposal.id, { state: 'created', createdTaskId: body.taskId })
      for (const key of [['dashboard'], ['unified-inbox'], ['project_tasks'], ['project_tasks_workspace']]) void queryClient.invalidateQueries({ queryKey: key })
    } catch (cause) {
      updateProposal(turnIndex, proposal.id, { state: 'failed', error: cause instanceof Error ? cause.message : 'The task could not be created.' })
    }
  }

  const cancelProposal = async (turnIndex: number, proposal: Proposal) => {
    updateProposal(turnIndex, proposal.id, { state: 'cancelled' })
    const messageId = turns[turnIndex]?.messageId
    if (!messageId) return
    // Only lasting states are saved; temporary ones (saving, failed) and errors are dropped (undefined is not serialised).
    const stored = (turns[turnIndex].proposals ?? []).map((item) => ({
      ...item, error: undefined,
      state: item.id === proposal.id ? 'cancelled' : item.state === 'created' ? 'created' : undefined,
    }))
    await supabase.from('ai_messages').update({ proposals: stored }).eq('id', messageId)
  }

  const removeConversation = async (chat: Conversation) => {
    if (!(await confirmDialog({ title: 'Delete this chat?', description: `“${chat.title}” will be removed from your history.` }))) return
    await supabase.from('ai_conversations').delete().eq('id', chat.id)
    if (chat.id === conversationId) newChat()
    void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
  }

  const retry = () => {
    const lastUser = [...turns].reverse().find((turn) => turn.role === 'user')
    if (!lastUser) return
    void send(lastUser.content, turns.slice(0, turns.lastIndexOf(lastUser)), context, conversationId)
  }

  const groups = conversations.reduce<Array<[string, Conversation[]]>>((list, chat) => {
    const label = groupLabel(chat.updated_at)
    const group = list.find(([name]) => name === label)
    if (group) group[1].push(chat); else list.push([label, [chat]])
    return list
  }, [])

  return <AnimatePresence>
    {open && <>
      <motion.div key="ai-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} className="fixed inset-0 z-[150] bg-black/20 sm:bg-transparent" />
      <motion.aside key="ai-panel" role="dialog" aria-label="Bytechsol AI" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed inset-y-0 right-0 z-[151] flex w-full flex-col bg-white shadow-2xl sm:w-[440px] sm:rounded-l-2xl sm:border-l sm:border-[#E5E7EB]">
        <header className="flex h-[60px] flex-shrink-0 items-center gap-2 border-b border-[#E5E7EB] px-3">
          {view === 'history'
            ? <button type="button" onClick={() => setView('chat')} aria-label="Back to chat" className="grid h-8 w-8 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]"><ArrowLeft size={17} /></button>
            : <span className="ml-1 grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[var(--primary)] to-[#27AAE1] text-white"><Sparkles size={17} /></span>}
          <div className="min-w-0 flex-1 px-1">
            <h2 className="truncate text-[15px] font-bold text-[#111827]">{view === 'history' ? 'Chat history' : title || 'Bytechsol AI'}</h2>
            <p className="truncate text-xs text-[#6B7280]">{view === 'history' ? 'Only you can see your chats' : context ? `Looking at this ${context.type}` : 'Answers from your workspace'}</p>
          </div>
          <button type="button" onClick={() => setView(view === 'history' ? 'chat' : 'history')} title="Chat history" aria-label="Chat history" aria-pressed={view === 'history'} className={cn('grid h-8 w-8 place-items-center rounded-lg hover:bg-[#F3F4F6]', view === 'history' ? 'bg-[var(--primary-soft)] text-[var(--primary)]' : 'text-[#6B7280]')}><History size={16} /></button>
          <button type="button" onClick={newChat} title="New chat" aria-label="New chat" className="grid h-8 w-8 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]"><SquarePen size={16} /></button>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close assistant" className="grid h-8 w-8 place-items-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F6]"><X size={17} /></button>
        </header>

        {view === 'history' ? <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <button type="button" onClick={newChat} className="mb-4 flex w-full items-center gap-2.5 rounded-xl border border-dashed border-[var(--primary)]/50 px-3 py-2.5 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]"><SquarePen size={15} />New chat</button>
          {loadingHistory ? <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[var(--primary)]" /></div>
            : groups.length ? groups.map(([label, chats]) => <div key={label} className="mb-4">
              <h3 className="mb-1 px-2 text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">{label}</h3>
              {chats.map((chat) => <div key={chat.id} className={cn('group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[#F3F4F6]', chat.id === conversationId && 'bg-[var(--primary-soft)]')}>
                <button type="button" onClick={() => void loadConversation(chat.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                  <MessageSquareText size={15} className="flex-shrink-0 text-[#9CA3AF]" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm text-[#111827]">{chat.title}</span><span className="block text-[11px] text-[#9CA3AF]">{format(new Date(chat.updated_at), isToday(new Date(chat.updated_at)) ? 'p' : 'MMM d, p')}</span></span>
                </button>
                <button type="button" onClick={() => void removeConversation(chat)} aria-label={`Delete chat ${chat.title}`} className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md text-[#9CA3AF] hover:bg-red-50 hover:text-red-600 sm:opacity-0 sm:group-hover:opacity-100"><Trash2 size={14} /></button>
              </div>)}
            </div>)
            : historyResult?.unavailable ? <div className="mx-1 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">{historyResult.unavailable === 'setup' ? 'Chat history is not switched on yet' : 'Chat history could not be loaded'}</p>
              <p className="mt-1 text-xs leading-5">{historyResult.unavailable === 'setup'
                ? 'An admin needs to run the database script supabase/migrations/017_ai_conversations.sql once in Supabase (SQL Editor → Run). Until then the assistant still answers, but chats are not saved.'
                : 'Please try again in a moment.'}</p>
            </div>
            : <div className="px-2 py-10 text-center"><History size={26} className="mx-auto text-[#D1D5DB]" /><p className="mt-3 text-sm font-semibold text-[#111827]">No saved chats yet</p><p className="mt-1 text-xs text-[#6B7280]">Your conversations with the assistant appear here.</p></div>}
        </div> : <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {loadingChat ? <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-[var(--primary)]" /></div>
            : !turns.length && !busy ? <div>
              <h3 className="text-lg font-bold text-[#111827]">{language === 'roman_urdu' ? 'Main aap ki kya madad karun?' : 'How can I help?'}</h3>
              <p className="mt-1 text-sm text-[#6B7280]">{language === 'roman_urdu' ? 'Apne tasks, projects, messages, calendar ya ideas ke baare mein poochein. Type @ to mention a teammate.' : 'Ask about your tasks, projects, messages, calendar or ideas. Type @ to mention a teammate.'}</p>
              <div className="mt-5 space-y-2">{SUGGESTIONS[language === 'roman_urdu' ? 'roman_urdu' : 'english'].map(({ icon: Icon, text }) => <button key={text} type="button" onClick={() => void send(text, turns, context, conversationId)}
                className="flex w-full items-center gap-3 rounded-xl border border-[#E5E7EB] px-3.5 py-3 text-left text-sm text-[#374151] transition-colors hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]">
                <Icon size={16} className="flex-shrink-0 text-[var(--primary)]" />{text}
              </button>)}</div>
            </div> : <div className="space-y-5">
              {turns.map((turn, index) => turn.role === 'user'
                ? <div key={index} className="flex justify-end"><div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--primary)] px-3.5 py-2.5 text-sm text-white">{turn.content}</div></div>
                : <div key={index} className="flex gap-2.5">
                  <span className="mt-0.5 grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]"><Sparkles size={14} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#111827]">{formatMessage(turn.content.replace(/\n{3,}/g, '\n\n'))}</div>
                    {turn.proposals?.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} onConfirm={() => void confirm(index, proposal)} onCancel={() => void cancelProposal(index, proposal)} />)}
                  </div>
                </div>)}
              {busy && <div className="flex items-center gap-2.5 text-sm text-[#6B7280]"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]"><Loader2 size={14} className="animate-spin" /></span>Looking through your workspace…</div>}
            </div>}
          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <span className="flex-1">{error}</span>
            {turns.some((turn) => turn.role === 'user') && <button type="button" onClick={retry} className="flex flex-shrink-0 items-center gap-1 font-semibold hover:underline"><RotateCcw size={13} />Retry</button>}
          </div>}
        </div>}

        {view === 'chat' && <form onSubmit={(event) => { event.preventDefault(); void send(input, turns, context, conversationId) }} className="relative flex-shrink-0 border-t border-[#E5E7EB] p-3">
          {mention && mentionMatches.length > 0 && <div role="listbox" aria-label="Mention a teammate" className="absolute bottom-full left-3 right-3 mb-1 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white py-1 shadow-xl">
            {mentionMatches.map((person, index) => <button key={person.id} type="button" role="option" aria-selected={index === mention.index} onMouseDown={(event) => { event.preventDefault(); pickMention(person.display_name) }}
              className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm', index === mention.index ? 'bg-[var(--primary-soft)]' : 'hover:bg-[#F3F4F6]')}>
              <Avatar src={person.avatar_url} name={person.display_name} size={24} status={person.status} />
              <span className="min-w-0 flex-1 truncate font-medium text-[#111827]">{person.display_name}</span>
              <span className="truncate text-xs text-[#9CA3AF]">{person.job_title}</span>
            </button>)}
          </div>}
          <div className="flex items-end gap-2 rounded-2xl border border-[#E5E7EB] bg-white px-3 py-2 focus-within:border-[var(--primary)] focus-within:shadow-[0_0_0_3px_var(--focus-ring)]">
            <textarea ref={inputRef} value={input} rows={1} maxLength={4000} disabled={busy}
              onChange={(event) => { setInput(event.target.value); updateMention(event.target.value, event.target.selectionStart); event.target.style.height = 'auto'; event.target.style.height = `${Math.min(event.target.scrollHeight, 140)}px` }}
              onKeyDown={(event) => {
                if (mention && mentionMatches.length) {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const step = event.key === 'ArrowDown' ? 1 : -1; setMention({ ...mention, index: (mention.index + step + mentionMatches.length) % mentionMatches.length }); return }
                  if (event.key === 'Enter' || event.key === 'Tab') { event.preventDefault(); pickMention(mentionMatches[mention.index]?.display_name ?? mentionMatches[0].display_name); return }
                  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setMention(null); return }
                }
                if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(input, turns, context, conversationId) }
              }}
              placeholder="Ask anything about your work…" aria-label="Message Bytechsol AI"
              className="max-h-[140px] min-h-[24px] flex-1 resize-none bg-transparent py-1 text-sm text-[#111827] placeholder-[#9CA3AF] outline-none" />
            <button type="submit" disabled={busy || !input.trim()} aria-label="Send" className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white transition-opacity disabled:opacity-40"><ArrowUp size={16} /></button>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <div role="radiogroup" aria-label="Reply language" className="flex items-center rounded-lg bg-[#F3F4F6] p-0.5">
              {LANGUAGES.map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={language === value} onClick={() => chooseLanguage(value)}
                className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold transition-colors', language === value ? 'bg-white text-[#111827] shadow-sm' : 'text-[#6B7280] hover:text-[#111827]')}>{label}</button>)}
            </div>
            <p className="text-[11px] text-[#9CA3AF]">AI can make mistakes. Check important details.</p>
          </div>
        </form>}
      </motion.aside>
    </>}
  </AnimatePresence>
}

function ProposalCard({ proposal, onConfirm, onCancel }: { proposal: Proposal; onConfirm: () => void; onCancel: () => void }) {
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
