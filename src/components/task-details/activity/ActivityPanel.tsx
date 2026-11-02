'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { format, formatDistanceToNow, isValid } from 'date-fns'
import { AtSign, Download, History, Loader2, MessageSquare, Paperclip, Pencil, Reply, Send, SmilePlus, Trash2, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { downloadAttachmentBlob } from '@/lib/attachmentStorage'
import type { ActivityEvent, ActivityFilter, TaskAttachment, TaskComment, TaskMember } from '@/types/task'

const REACTIONS = ['👍','❤️','🚀','🎉','👀']
const COMMENT_ACTIVITY_TYPES=new Set<ActivityEvent['type']>(['comment_added','comment_updated','comment_removed','reaction_added','reaction_removed'])

export type ActivityActions = {
  setFilter: (filter: ActivityFilter) => void
  addComment: (body: string, parentCommentId?: string, mentionIds?: string[], attachmentIds?: string[]) => void | Promise<void>
  updateComment: (commentId: string, body: string) => void | Promise<void>
  deleteComment: (commentId: string) => void | Promise<void>
  toggleReaction: (commentId: string, emoji: string) => void
}

export interface ActivityPanelProps {
  comments: TaskComment[]
  activity: ActivityEvent[]
  attachments: TaskAttachment[]
  members: TaskMember[]
  currentUserId: string
  filter: ActivityFilter
  actions: ActivityActions
  composerRef?: React.RefObject<HTMLTextAreaElement | null>
  onUploadFiles?: (files: File[]) => Promise<TaskAttachment[]>
  onDraftStateChange?: (dirty: boolean) => void
}

export function ActivityPanel({ comments,activity,attachments,members,currentUserId,filter,actions,composerRef,onUploadFiles,onDraftStateChange }: ActivityPanelProps) {
  const memberMap=useMemo(() => new Map(members.map((member) => [member.id,member])),[members])
  const attachmentMap=useMemo(() => new Map(attachments.map((attachment) => [attachment.id,attachment])),[attachments])
  const roots=useMemo(() => comments.filter((comment) => !comment.parentCommentId && !comment.deletedAt).sort((a,b) => b.createdAt.localeCompare(a.createdAt)),[comments])
  const commentCount=comments.filter((comment) => !comment.deletedAt).length
  const visibleCount=filter==='comments' ? commentCount : filter==='history' ? activity.length : commentCount+activity.filter((event) => !COMMENT_ACTIVITY_TYPES.has(event.type)).length
  const repliesByParent=useMemo(() => {
    const result=new Map<string,TaskComment[]>()
    comments.filter((comment) => comment.parentCommentId && !comment.deletedAt).forEach((comment) => {
      const parentId=comment.parentCommentId!
      result.set(parentId,[...(result.get(parentId)||[]),comment])
    })
    return result
  },[comments])
  const mixedFeed=useMemo(() => {
    return [
      ...roots.map((comment) => ({kind:'comment' as const,id:`comment-${comment.id}`,timestamp:comment.createdAt,comment})),
      ...activity.filter((event) => !COMMENT_ACTIVITY_TYPES.has(event.type)).map((event) => ({kind:'event' as const,id:`event-${event.id}`,timestamp:event.timestamp,event})),
    ].sort((a,b) => b.timestamp.localeCompare(a.timestamp))
  },[activity,roots])
  return <aside className="flex h-full min-h-0 flex-col bg-[var(--surface-raised)]">
    <header className="sticky top-0 z-10 shrink-0 border-b border-[var(--ui-border)] bg-[var(--surface-raised)] px-4 pb-3 pt-4 sm:px-5">
      <div><h2 className="text-sm font-semibold">Activity &amp; Discussion</h2><p className="text-[10px] text-[var(--muted-foreground)]">{visibleCount} {visibleCount===1?'item':'items'}</p></div>
      <div role="tablist" aria-label="Activity view" className="mt-3 grid grid-cols-3 rounded-lg bg-[var(--surface-muted)] p-1">{(['all','comments','history'] as ActivityFilter[]).map((option) => <button key={option} id={`activity-${option}-tab`} role="tab" aria-selected={filter===option} aria-controls="activity-feed" tabIndex={filter===option?0:-1} type="button" onClick={() => actions.setFilter(option)} onKeyDown={(event) => { if (!['ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); const options:ActivityFilter[]=['all','comments','history']; const offset=event.key==='ArrowRight'?1:-1; const next=options[(options.indexOf(option)+offset+options.length)%options.length]; actions.setFilter(next); requestAnimationFrame(() => document.getElementById(`activity-${next}-tab`)?.focus()) }} className={`h-7 rounded-md text-[11px] font-semibold capitalize transition ${filter===option ? 'bg-[var(--surface)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'}`}>{option}</button>)}</div>
    </header>
    <div id="activity-feed" role="tabpanel" aria-labelledby={`activity-${filter}-tab`} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
      <div className={filter==='history'?'hidden':''}><CommentComposer currentUser={memberMap.get(currentUserId)} members={members} onSubmit={(body,mentionIds,files) => submitWithAttachments(body,mentionIds,files,onUploadFiles,actions.addComment)} composerRef={composerRef} onDraftStateChange={onDraftStateChange}/></div>
      <div className="mt-5 space-y-4">
        {filter==='all' && mixedFeed.map((item) => item.kind==='comment'
          ? <CommentCard key={item.id} comment={item.comment} replies={repliesByParent.get(item.comment.id)||[]} members={memberMap} attachments={attachmentMap} currentUserId={currentUserId} actions={actions}/>
          : <ActivityEventRow key={item.id} event={item.event} members={memberMap}/>)}
        {filter==='comments' && roots.map((comment) => <CommentCard key={comment.id} comment={comment} replies={repliesByParent.get(comment.id)||[]} members={memberMap} attachments={attachmentMap} currentUserId={currentUserId} actions={actions}/>)}
        {filter==='history' && <ActivityTimeline events={activity} members={memberMap}/>}
        {!visibleCount && <div className="py-12 text-center"><MessageSquare className="mx-auto text-[var(--muted-foreground)]" size={22}/><p className="mt-2 text-xs font-semibold">No activity yet</p><p className="mt-1 text-[11px] text-[var(--muted-foreground)]">Changes and comments will appear here.</p></div>}
      </div>
    </div>
  </aside>
}

async function submitWithAttachments(body:string,mentionIds:string[],files:File[],upload:ActivityPanelProps['onUploadFiles'],add:ActivityActions['addComment']) {
  const uploaded=files.length && upload ? await upload(files) : []
  await add(body,undefined,mentionIds,uploaded.map((item) => item.id))
}

function CommentComposer({currentUser,members,onSubmit,composerRef,onDraftStateChange}:{currentUser?:TaskMember;members:TaskMember[];onSubmit:(body:string,mentionIds:string[],files:File[])=>Promise<void>;composerRef?:React.RefObject<HTMLTextAreaElement|null>;onDraftStateChange?:(dirty:boolean)=>void}) {
  const localRef=useRef<HTMLTextAreaElement>(null)
  const inputRef=useRef<HTMLInputElement>(null)
  const ref=composerRef || localRef
  const [body,setBody]=useState('')
  const [files,setFiles]=useState<File[]>([])
  const [mentionIds,setMentionIds]=useState<string[]>([])
  const [activeMentionIndex,setActiveMentionIndex]=useState(0)
  const [emojiOpen,setEmojiOpen]=useState(false)
  const [sending,setSending]=useState(false)
  const [error,setError]=useState<string|null>(null)
  const mentionNeedle=body.match(/(?:^|\s)@([^\s@]*)$/)?.[1]?.toLowerCase()
  const mentionCandidates=mentionNeedle===undefined ? [] : members.filter((member) => member.name.toLowerCase().includes(mentionNeedle)).slice(0,6)
  useEffect(() => { onDraftStateChange?.(Boolean(body.trim()||files.length)) },[body,files,onDraftStateChange])
  const submit=async () => {
    const value=body.trim()
    if (!value || sending) return
    const inferred=members.filter((member) => value.toLowerCase().includes(`@${member.name.replace(/\s+/g,'').toLowerCase()}`)).map((member) => member.id)
    setSending(true); setError(null)
    try { await onSubmit(value,Array.from(new Set([...mentionIds,...inferred])),files); setBody(''); setFiles([]); setMentionIds([]); setEmojiOpen(false); if (ref.current) ref.current.style.height='auto' }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The comment could not be saved.') }
    finally { setSending(false) }
  }
  const insertMention=(member:TaskMember) => { setBody((current) => current.replace(/@[^\s@]*$/,`@${member.name.replace(/\s+/g,'')} `)); setMentionIds((current) => current.includes(member.id)?current:[...current,member.id]); ref.current?.focus() }
  return <div className="flex gap-2.5"><Avatar name={currentUser?.name || 'You'} src={currentUser?.avatarUrl} size={28}/><div className="min-w-0 flex-1"><div className="relative rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] focus-within:border-[var(--primary)] focus-within:ring-2 focus-within:ring-[var(--focus-ring)]"><textarea ref={ref} value={body} maxLength={10000} onChange={(event) => { setBody(event.target.value); setActiveMentionIndex(0); setError(null); event.currentTarget.style.height='auto'; event.currentTarget.style.height=`${Math.min(144,event.currentTarget.scrollHeight)}px` }} onKeyDown={(event) => { if (mentionCandidates.length && ['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); const offset=event.key==='ArrowDown'?1:-1; setActiveMentionIndex((current) => (current+offset+mentionCandidates.length)%mentionCandidates.length); return } if (mentionCandidates.length && event.key==='Enter' && !(event.ctrlKey||event.metaKey)) { event.preventDefault(); insertMention(mentionCandidates[activeMentionIndex]||mentionCandidates[0]); return } if (event.key==='Escape' && mentionNeedle!==undefined) { event.preventDefault(); setBody((current) => current.replace(/@[^\s@]*$/,'')); return } if ((event.ctrlKey || event.metaKey) && event.key==='Enter') { event.preventDefault(); void submit() } }} rows={2} placeholder="Write a comment…" className="max-h-36 min-h-16 w-full resize-none bg-transparent px-3 pt-2.5 text-xs leading-5 text-[var(--foreground)] outline-none" aria-label="Write a comment" role="combobox" aria-autocomplete="list" aria-expanded={mentionNeedle!==undefined} aria-controls={mentionNeedle!==undefined?'comment-mention-options':undefined} aria-activedescendant={mentionCandidates[activeMentionIndex]?`comment-mention-${mentionCandidates[activeMentionIndex].id}`:undefined}/>
    {mentionNeedle!==undefined && <div id="comment-mention-options" role="listbox" aria-label="Team members" className="absolute left-2 right-2 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] p-1 shadow-xl">{mentionCandidates.length ? mentionCandidates.map((member,index) => <button id={`comment-mention-${member.id}`} role="option" aria-selected={index===activeMentionIndex} key={member.id} type="button" onMouseEnter={() => setActiveMentionIndex(index)} onClick={() => insertMention(member)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${index===activeMentionIndex?'bg-[var(--surface-muted)]':'hover:bg-[var(--surface-muted)]'}`}><Avatar name={member.name} src={member.avatarUrl} size={22}/>{member.name}</button>) : <p className="px-2 py-2 text-xs text-[var(--muted-foreground)]">No matching members</p>}</div>}
    {!!files.length && <div className="flex flex-wrap gap-1.5 border-t border-[var(--ui-border)] px-2 py-2">{files.map((file,index) => <span key={`${file.name}-${file.size}-${index}`} className="flex max-w-full items-center gap-1 rounded-full bg-[var(--surface-muted)] px-2 py-1 text-[10px]"><Paperclip size={10}/><span className="max-w-32 truncate">{file.name}</span><button type="button" onClick={() => setFiles((current) => current.filter((_,itemIndex) => itemIndex!==index))} aria-label={`Remove ${file.name}`}><X size={10}/></button></span>)}</div>}
    <div className="flex items-center gap-1 border-t border-[var(--ui-border)] p-1.5"><button type="button" onClick={() => { setBody((current) => `${current}@`); ref.current?.focus() }} className="grid h-7 w-7 place-items-center rounded text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]" aria-label="Mention someone"><AtSign size={14}/></button><button type="button" onClick={() => inputRef.current?.click()} disabled={!onSubmit} className="grid h-7 w-7 place-items-center rounded text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]" aria-label="Attach files"><Paperclip size={14}/></button><input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => { setFiles((current) => [...current,...Array.from(event.target.files || [])]); event.currentTarget.value='' }}/><button type="button" onClick={() => setEmojiOpen((current) => !current)} className="grid h-7 w-7 place-items-center rounded text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]" aria-label="Add emoji"><SmilePlus size={14}/></button>{emojiOpen && <div className="absolute bottom-10 left-16 z-20 flex gap-1 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] p-2 shadow-xl">{REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => { setBody((current) => current+emoji); setEmojiOpen(false) }} className="grid h-8 w-8 place-items-center rounded hover:bg-[var(--surface-muted)]" aria-label={`Insert ${emoji}`}>{emoji}</button>)}</div>}<span className="flex-1 text-right text-[9px] text-[var(--muted-foreground)]">Ctrl/⌘ + Enter</span><button type="button" disabled={!body.trim() || sending} onClick={() => void submit()} className="flex h-7 items-center gap-1 rounded-md bg-[var(--primary)] px-2.5 text-[11px] font-semibold text-white disabled:opacity-40">{sending?<Loader2 size={12} className="animate-spin"/>:<Send size={12}/>}Send</button></div></div>{error && <p role="alert" className="mt-1 text-[10px] text-[var(--danger)]">{error}</p>}</div></div>
}

function CommentCard({comment,replies,members,attachments,currentUserId,actions}:{comment:TaskComment;replies:TaskComment[];members:Map<string,TaskMember>;attachments:Map<string,TaskAttachment>;currentUserId:string;actions:ActivityActions}) {
  const [replying,setReplying]=useState(false)
  const [reply,setReply]=useState('')
  const [showReplies,setShowReplies]=useState(false)
  return <article className="group"><CommentBody comment={comment} members={members} attachments={attachments} currentUserId={currentUserId} actions={actions}/><div className="ml-10 mt-2 flex items-center gap-2"><button type="button" onClick={() => setReplying((current) => !current)} className="flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-semibold text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]"><Reply size={11}/>Reply</button>{replies.length>0 && <button type="button" onClick={() => setShowReplies((current) => !current)} className="text-[10px] font-semibold text-[var(--primary)]">{showReplies?'Hide':`${replies.length} ${replies.length===1?'reply':'replies'}`}</button>}</div>{replying && <div className="ml-10 mt-2 flex gap-1"><input autoFocus value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey||event.metaKey) && event.key==='Enter' && reply.trim()) { void actions.addComment(reply.trim(),comment.id); setReply(''); setReplying(false) } }} placeholder="Write a reply" className="h-8 min-w-0 flex-1 rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2 text-xs outline-none focus:border-[var(--primary)]"/><button type="button" disabled={!reply.trim()} onClick={() => { if (reply.trim()) void actions.addComment(reply.trim(),comment.id); setReply(''); setReplying(false) }} className="rounded-md bg-[var(--primary)] px-2 text-[10px] font-semibold text-white disabled:opacity-40">Reply</button></div>}{showReplies && <div className="ml-10 mt-3 space-y-3 border-l border-[var(--ui-border)] pl-3">{replies.map((item) => <CommentBody key={item.id} comment={item} members={members} attachments={attachments} currentUserId={currentUserId} actions={actions} compact/>)}</div>}</article>
}

function CommentBody({comment,members,attachments,currentUserId,actions,compact=false}:{comment:TaskComment;members:Map<string,TaskMember>;attachments:Map<string,TaskAttachment>;currentUserId:string;actions:ActivityActions;compact?:boolean}) {
  const author=members.get(comment.authorId)
  const [editing,setEditing]=useState(false)
  const [draft,setDraft]=useState(comment.body)
  const own=comment.authorId===currentUserId
  return <div className="flex items-start gap-2.5"><Avatar name={author?.name || 'Former member'} src={author?.avatarUrl} size={compact?22:28}/><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><strong className="truncate text-xs">{author?.name || 'Former member'}</strong><SafeTime value={comment.createdAt}/>{comment.updatedAt && <span className="text-[9px] text-[var(--muted-foreground)]">edited</span>}<span className="flex-1"/>{own && <span className="flex opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><button type="button" onClick={() => setEditing(true)} className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--surface-muted)]" aria-label="Edit comment"><Pencil size={11}/></button><button type="button" onClick={() => { if (confirm('Delete this comment?')) void actions.deleteComment(comment.id) }} className="grid h-6 w-6 place-items-center rounded hover:bg-red-500/10 hover:text-[var(--danger)]" aria-label="Delete comment"><Trash2 size={11}/></button></span>}</div>{editing?<div className="mt-1"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey||event.metaKey)&&event.key==='Enter'&&draft.trim()) { void actions.updateComment(comment.id,draft.trim()); setEditing(false) } if (event.key==='Escape') { setDraft(comment.body); setEditing(false) } }} className="w-full rounded-md border border-[var(--ui-border)] bg-[var(--surface)] p-2 text-xs outline-none focus:border-[var(--primary)]"/><div className="mt-1 flex justify-end gap-1"><button type="button" onClick={() => { setDraft(comment.body); setEditing(false) }} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--surface-muted)]" aria-label="Cancel"><X size={12}/></button><button type="button" disabled={!draft.trim()} onClick={() => { if (draft.trim()) { void actions.updateComment(comment.id,draft.trim()); setEditing(false) } }} className="rounded bg-[var(--primary)] px-2 text-[10px] font-semibold text-white disabled:opacity-40">Save</button></div></div>:<p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5">{comment.body}</p>}<CommentAttachments ids={comment.attachmentIds} attachments={attachments}/><ReactionBar comment={comment} currentUserId={currentUserId} onToggle={(emoji) => actions.toggleReaction(comment.id,emoji)}/></div></div>
}

function CommentAttachments({ids,attachments}:{ids:string[];attachments:Map<string,TaskAttachment>}) { const [error,setError]=useState<string|null>(null); const visible=ids.map((id) => attachments.get(id)).filter((item):item is TaskAttachment=>Boolean(item)); if (!visible.length) return null; const download=async (attachment:TaskAttachment) => { setError(null); try { await downloadAttachmentBlob(attachment.storageKey,attachment.name) } catch (cause) { setError(cause instanceof Error?cause.message:'The attachment could not be downloaded.') } }; return <div className="mt-2"><div className="flex flex-wrap gap-1.5">{visible.map((attachment) => <button key={attachment.id} type="button" onClick={() => void download(attachment)} className="flex max-w-full items-center gap-1.5 rounded-md border border-[var(--ui-border)] px-2 py-1 text-[10px] hover:bg-[var(--surface-muted)]"><Paperclip size={10}/><span className="max-w-40 truncate">{attachment.name}</span><Download size={10}/></button>)}</div>{error&&<p role="alert" className="mt-1 text-[10px] text-[var(--danger)]">{error}</p>}</div> }

function ReactionBar({comment,currentUserId,onToggle}:{comment:TaskComment;currentUserId:string;onToggle:(emoji:string)=>void}) { return <div className="mt-2 flex flex-wrap items-center gap-1">{Object.entries(comment.reactions).filter(([,ids]) => ids.length).map(([emoji,ids]) => <button key={emoji} type="button" onClick={() => onToggle(emoji)} aria-label={`${ids.includes(currentUserId)?'Remove':'Add'} ${emoji} reaction, ${ids.length} ${ids.length===1?'person':'people'} reacted`} aria-pressed={ids.includes(currentUserId)} className={`rounded-full border px-2 py-0.5 text-[10px] ${ids.includes(currentUserId)?'border-[var(--primary)] bg-[var(--primary-soft)]':'border-[var(--ui-border)] hover:bg-[var(--surface-muted)]'}`}>{emoji} {ids.length}</button>)}<span className="relative group/reaction"><button type="button" className="grid h-6 w-6 place-items-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]" aria-label="Add a reaction"><SmilePlus size={12}/></button><span className="invisible absolute left-0 top-full z-20 flex gap-0.5 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] p-1 shadow-lg group-hover/reaction:visible group-focus-within/reaction:visible">{REACTIONS.map((emoji) => <button key={emoji} type="button" onClick={() => onToggle(emoji)} className="grid h-7 w-7 place-items-center rounded hover:bg-[var(--surface-muted)]" aria-label={`React with ${emoji}`}>{emoji}</button>)}</span></span></div> }

function ActivityTimeline({events,members}:{events:ActivityEvent[];members:Map<string,TaskMember>}) {
  const groups=useMemo(() => { const map=new Map<string,ActivityEvent[]>(); [...events].sort((a,b) => b.timestamp.localeCompare(a.timestamp)).forEach((event) => { const date=safeDate(event.timestamp); const key=date?format(date,'yyyy-MM-dd'):'Unknown'; map.set(key,[...(map.get(key)||[]),event]) }); return Array.from(map.entries()) },[events])
  return <div className="space-y-4 border-t border-[var(--ui-border)] pt-4">{groups.map(([day,items]) => <section key={day}><h3 className="mb-2 text-[9px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">{day==='Unknown'?'Unknown date':format(safeDate(items[0].timestamp)!,'EEEE, MMM d')}</h3><div className="space-y-3">{items.map((event) => <ActivityEventRow key={event.id} event={event} members={members}/>)}</div></section>)}</div>
}

function ActivityEventRow({event,members}:{event:ActivityEvent;members:Map<string,TaskMember>}) {
  return <div className="flex gap-2.5"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)] text-[var(--muted-foreground)]"><History size={12}/></span><div className="min-w-0"><p className="text-[11px] leading-4"><strong>{members.get(event.actorId)?.name || 'A team member'}</strong> {eventMessage(event)}</p><SafeTime value={event.timestamp}/></div></div>
}

function SafeTime({value}:{value:string}) { const date=safeDate(value); if (!date) return <span className="text-[9px] text-[var(--muted-foreground)]">Unknown time</span>; return <time dateTime={value} title={date.toLocaleString()} className="text-[9px] text-[var(--muted-foreground)]">{formatDistanceToNow(date,{addSuffix:true})}</time> }
function safeDate(value:string) { const date=new Date(value); return isValid(date)?date:null }
function eventMessage(event:ActivityEvent) { const from=readable(event.previousValue); const to=readable(event.newValue); const messages:Partial<Record<ActivityEvent['type'],string>>={task_created:'created the task',title_changed:`changed the title from “${from}” to “${to}”`,description_changed:'updated the description',cover_changed:'changed the task cover',status_changed:`changed status from ${from} to ${to}`,priority_changed:`changed priority from ${from} to ${to}`,dates_changed:'updated the task dates',estimate_changed:'updated the estimate',assignee_added:'added an assignee',assignee_removed:'removed an assignee',label_added:'added a label',label_removed:'removed a label',label_created:'created a label',label_updated:'updated a label',label_deleted:'deleted a label',checklist_created:'created a checklist',checklist_renamed:'renamed a checklist',checklist_removed:'removed a checklist',checklist_reordered:'reordered checklists',checklist_visibility_changed:'changed checklist visibility',checklist_item_created:'added a checklist item',checklist_item_updated:'updated a checklist item',checklist_item_completed:'updated checklist progress',checklist_item_removed:'removed a checklist item',checklist_item_reordered:'reordered checklist items',attachment_added:'added an attachment',attachment_removed:'removed an attachment',comment_added:'commented',comment_updated:'edited a comment',comment_removed:'removed a comment',reaction_added:'reacted to a comment',reaction_removed:'removed a reaction',dependency_added:'linked work',dependency_removed:'removed linked work',watch_started:'started watching this task',watch_stopped:'stopped watching this task',parent_changed:'changed the task hierarchy',task_moved:'moved the task to another project',task_archived:'archived the task',task_restored:'restored the task',task_duplicated:'duplicated the task',task_deleted:'moved the task to trash'}; return messages[event.type] || event.type.replaceAll('_',' ') }
function readable(value:unknown) { if (value==null) return 'none'; if (typeof value==='string'||typeof value==='number') return String(value).replaceAll('_',' '); return 'the previous value' }
