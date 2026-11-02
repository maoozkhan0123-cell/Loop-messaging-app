'use client'

import { useEffect, useState } from 'react'
import { Bold, Code2, Eye, Italic, List, Pencil, Quote, Save, X } from 'lucide-react'
import type { TaskMember } from '@/types/task'

function inlineMarkdown(text:string) {
  const parts=text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^)]+\)|@\[[^\]]+\]\(member:[^)]+\))/g)
  return parts.map((part,index) => {
    if (/^`[^`]+`$/.test(part)) return <code key={index} className="rounded bg-[var(--surface-muted)] px-1 py-0.5 font-mono text-[.9em]">{part.slice(1,-1)}</code>
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2,-2)}</strong>
    if (/^\*[^*]+\*$/.test(part)) return <em key={index}>{part.slice(1,-1)}</em>
    const link=part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer" className="text-[var(--primary)] underline underline-offset-2">{link[1]}</a>
    const mention=part.match(/^@\[([^\]]+)\]\(member:([^)]+)\)$/)
    if (mention) return <span key={index} data-member-id={mention[2]} className="rounded bg-[var(--primary-soft)] px-1 py-0.5 font-medium text-[var(--primary)]">@{mention[1]}</span>
    return part
  })
}

export function MarkdownContent({value}:{value:string}) {
  if (!value.trim()) return <p className="text-sm text-[var(--muted-foreground)]">Add context, acceptance criteria, links, or implementation notes.</p>
  const lines=value.split('\n')
  const content:React.ReactNode[]=[]
  for (let index=0; index<lines.length; index+=1) {
    const line=lines[index]
    if (line.startsWith('```')) {
      const language=line.slice(3).trim()
      const code:string[]=[]
      index+=1
      while (index<lines.length && !lines[index].startsWith('```')) { code.push(lines[index]); index+=1 }
      content.push(<pre key={`code-${index}`} className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100"><code data-language={language||undefined}>{code.join('\n')}</code></pre>)
    } else if (line.startsWith('### ')) content.push(<h4 key={index} className="pt-2 text-sm font-bold">{inlineMarkdown(line.slice(4))}</h4>)
    else if (line.startsWith('## ')) content.push(<h3 key={index} className="pt-2 text-base font-bold">{inlineMarkdown(line.slice(3))}</h3>)
    else if (line.startsWith('# ')) content.push(<h2 key={index} className="pt-2 text-lg font-bold">{inlineMarkdown(line.slice(2))}</h2>)
    else if (/^[-*] \[[ xX]\] /.test(line)) { const checked=/^[-*] \[[xX]\]/.test(line); content.push(<div key={index} className="flex items-start gap-2"><span role="checkbox" aria-checked={checked} className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] ${checked?'border-[var(--primary)] bg-[var(--primary)] text-white':'border-[var(--ui-border)]'}`}>{checked?'✓':''}</span><span className={checked?'text-[var(--muted-foreground)] line-through':''}>{inlineMarkdown(line.replace(/^[-*] \[[ xX]\] /,''))}</span></div>) }
    else if (/^[-*] /.test(line)) content.push(<div key={index} className="flex gap-2 pl-1"><span aria-hidden>•</span><span>{inlineMarkdown(line.slice(2))}</span></div>)
    else if (/^\d+\. /.test(line)) content.push(<div key={index} className="pl-1">{inlineMarkdown(line)}</div>)
    else if (line.startsWith('> ')) content.push(<blockquote key={index} className="border-l-2 border-[var(--primary)] pl-3 text-[var(--muted-foreground)]">{inlineMarkdown(line.slice(2))}</blockquote>)
    else content.push(line?<p key={index}>{inlineMarkdown(line)}</p>:<div key={index} className="h-2"/>)
  }
  return <div className="space-y-2 text-sm leading-6 text-[var(--foreground)]">{content}</div>
}

export function TaskDescriptionEditor({value,members=[],onSave,onDirtyChange}:{value:string;members?:TaskMember[];onSave:(value:string)=>Promise<unknown>|void;onDirtyChange?:(dirty:boolean)=>void}) {
  const [editing,setEditing]=useState(false)
  const [preview,setPreview]=useState(false)
  const [draft,setDraft]=useState(value)
  const [activeMentionIndex,setActiveMentionIndex]=useState(0)
  useEffect(() => { if (!editing) setDraft(value) },[value,editing])
  useEffect(() => { onDirtyChange?.(editing && draft!==value) },[draft,editing,onDirtyChange,value])
  const wrap=(before:string,after=before) => setDraft((current) => `${current}${current?'\n':''}${before}text${after}`)
  const mentionNeedle=draft.match(/(?:^|\s)@([^\s@]*)$/)?.[1]?.toLowerCase()
  const mentionCandidates=mentionNeedle===undefined?[]:members.filter((member) => member.name.toLowerCase().includes(mentionNeedle)).slice(0,6)
  const insertMention=(member:TaskMember) => { const safeName=member.name.replace(/[\[\]()\r\n]/g,'').trim()||'Member'; setDraft((current) => current.replace(/@[^\s@]*$/,`@[${safeName}](member:${member.id}) `)); setActiveMentionIndex(0) }
  const save=async () => { if (draft!==value) await onSave(draft); setEditing(false); setPreview(false) }
  const cancel=() => { setDraft(value); setEditing(false); setPreview(false) }
  if (!editing) return <section className="group w-full rounded-xl border border-transparent p-3 text-left transition hover:border-[var(--ui-border)] hover:bg-[var(--surface-muted)]"><div className="mb-2 flex items-center justify-between"><h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Description</h2><button type="button" onClick={() => setEditing(true)} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-[var(--muted-foreground)] opacity-70 hover:bg-[var(--surface)] group-hover:opacity-100" aria-label="Edit description"><Pencil size={13}/>Edit</button></div><MarkdownContent value={value}/></section>
  return <section className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--surface)]"><div className="flex flex-wrap items-center gap-1 border-b border-[var(--ui-border)] bg-[var(--surface-raised)] p-2"><Tool label="Bold" onClick={() => wrap('**')} icon={<Bold size={14}/>}/><Tool label="Italic" onClick={() => wrap('*')} icon={<Italic size={14}/>}/><Tool label="List" onClick={() => setDraft((current) => `${current}${current?'\n':''}- `)} icon={<List size={14}/>}/><Tool label="Quote" onClick={() => setDraft((current) => `${current}${current?'\n':''}> `)} icon={<Quote size={14}/>}/><Tool label="Inline code" onClick={() => wrap('`')} icon={<Code2 size={14}/>}/><span className="flex-1"/><button type="button" onClick={() => setPreview((current) => !current)} className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]"><Eye size={14}/>{preview?'Edit':'Preview'}</button></div>{preview?<div className="min-h-40 p-4"><MarkdownContent value={draft}/></div>:<div className="relative"><textarea autoFocus value={draft} onChange={(event) => { setDraft(event.target.value); setActiveMentionIndex(0) }} onKeyDown={(event) => { if (mentionCandidates.length&&['ArrowDown','ArrowUp'].includes(event.key)) { event.preventDefault(); const offset=event.key==='ArrowDown'?1:-1; setActiveMentionIndex((current) => (current+offset+mentionCandidates.length)%mentionCandidates.length) } else if (mentionCandidates.length&&event.key==='Enter'&&!(event.metaKey||event.ctrlKey)) { event.preventDefault(); insertMention(mentionCandidates[activeMentionIndex]||mentionCandidates[0]) } else if ((event.metaKey||event.ctrlKey)&&event.key==='Enter') { event.preventDefault(); void save() } else if (event.key==='Escape'&&mentionNeedle!==undefined) { event.preventDefault(); setDraft((current) => current.replace(/@[^\s@]*$/,'')) } else if (event.key==='Escape') { event.preventDefault(); cancel() } else if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='b') { event.preventDefault(); wrap('**') } else if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='i') { event.preventDefault(); wrap('*') } }} rows={8} className="min-h-44 w-full resize-y bg-[var(--surface)] p-4 font-mono text-[13px] leading-6 text-[var(--foreground)] outline-none" placeholder="Describe the task using Markdown…" role="combobox" aria-autocomplete="list" aria-expanded={mentionNeedle!==undefined} aria-controls={mentionNeedle!==undefined?'description-mention-options':undefined} aria-activedescendant={mentionCandidates[activeMentionIndex]?`description-mention-${mentionCandidates[activeMentionIndex].id}`:undefined}/>{mentionNeedle!==undefined&&<div id="description-mention-options" role="listbox" aria-label="Mention a team member" className="absolute inset-x-3 bottom-3 z-20 max-h-40 overflow-y-auto rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] p-1 shadow-xl">{mentionCandidates.length?mentionCandidates.map((member,index) => <button id={`description-mention-${member.id}`} role="option" aria-selected={index===activeMentionIndex} key={member.id} type="button" onMouseEnter={() => setActiveMentionIndex(index)} onClick={() => insertMention(member)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${index===activeMentionIndex?'bg-[var(--surface-muted)]':'hover:bg-[var(--surface-muted)]'}`}><span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--primary-soft)] text-[9px] font-bold text-[var(--primary)]">{member.initials}</span><span><strong className="block">{member.name}</strong>{member.role&&<small className="text-[var(--muted-foreground)]">{member.role}</small>}</span></button>):<p className="px-2 py-2 text-xs text-[var(--muted-foreground)]">No matching members</p>}</div>}</div>}<div className="flex items-center justify-between border-t border-[var(--ui-border)] px-3 py-2"><span className="text-[10px] text-[var(--muted-foreground)]">Markdown · @ mentions · Ctrl/⌘ + Enter to save</span><div className="flex gap-2"><button type="button" onClick={cancel} className="flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-semibold text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)]"><X size={13}/>Cancel</button><button type="button" onClick={() => void save()} className="flex h-8 items-center gap-1 rounded-md bg-[var(--primary)] px-3 text-xs font-semibold text-white"><Save size={13}/>Save</button></div></div></section>
}

function Tool({label,onClick,icon}:{label:string;onClick:()=>void;icon:React.ReactNode}) { return <button type="button" title={label} aria-label={label} onClick={onClick} className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]">{icon}</button> }
