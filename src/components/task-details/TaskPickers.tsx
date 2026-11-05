'use client'

import { useMemo, useState } from 'react'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Check, Pencil, Search, Trash2 } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import type { DependencyRelation, LabelColor, TaskDependency, TaskDetails, TaskLabel, TaskMember } from '@/types/task'

const LABEL_COLORS: LabelColor[] = ['slate','rose','orange','amber','emerald','sky','blue','violet','pink']
const LABEL_SWATCH: Record<LabelColor,string> = {
  slate:'#64748B', rose:'#E11D48', orange:'#EA580C', amber:'#D97706', emerald:'#059669',
  sky:'#0284C7', blue:'#2563EB', violet:'#7C3AED', pink:'#DB2777',
}
const LABEL_STYLE: Record<LabelColor,string> = {
  slate:'bg-slate-500/15 text-slate-700 dark:text-slate-200', rose:'bg-rose-500/15 text-rose-700 dark:text-rose-200',
  orange:'bg-orange-500/15 text-orange-700 dark:text-orange-200', amber:'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  emerald:'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200', sky:'bg-sky-500/15 text-sky-800 dark:text-sky-200',
  blue:'bg-blue-500/15 text-blue-800 dark:text-blue-200', violet:'bg-violet-500/15 text-violet-800 dark:text-violet-200',
  pink:'bg-pink-500/15 text-pink-800 dark:text-pink-200',
}

export function TaskAssigneePicker({ members, selectedIds, onToggle }: {
  members: TaskMember[]
  selectedIds: string[]
  onToggle: (memberId: string, selected: boolean) => void | Promise<void>
}) {
  const [query,setQuery] = useState('')
  const visible = members.filter((member) => `${member.name} ${member.email || ''} ${member.role || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <div className="space-y-2"><SearchField value={query} onChange={setQuery} placeholder="Search members"/><div className="max-h-64 overflow-y-auto">
    {visible.map((member) => { const selected=selectedIds.includes(member.id); return <button key={member.id} type="button" onClick={() => void onToggle(member.id,selected)} aria-pressed={selected} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-[var(--surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"><Avatar name={member.name} src={member.avatarUrl} size={26}/><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{member.name}</strong>{(member.role || member.email) && <span className="block truncate text-[10px] text-[var(--muted-foreground)]">{member.role || member.email}</span>}</span>{selected && <Check size={14} className="text-[var(--primary)]"/>}</button> })}
    {!visible.length && <EmptySearch message="No members match your search."/>}
  </div></div>
}

export function TaskLabelPicker({ labels, assignedIds, onAdd, onRemove, onCreate, onUpdate, onDelete }: {
  labels: TaskLabel[]
  assignedIds: string[]
  onAdd: (labelId: string) => unknown
  onRemove: (labelId: string) => unknown
  onCreate: (name: string, color: LabelColor) => unknown
  onUpdate: (labelId: string, patch: { name?: string; color?: LabelColor }) => unknown
  onDelete: (labelId: string) => unknown
}) {
  const [query,setQuery] = useState('')
  const [color,setColor] = useState<LabelColor>('blue')
  const [editing,setEditing] = useState<TaskLabel | null>(null)
  const [editName,setEditName] = useState('')
  const normalized=query.trim().toLowerCase()
  const visible=labels.filter((label) => label.name.toLowerCase().includes(normalized))
  const exact=labels.some((label) => label.name.toLowerCase()===normalized)
  const create = () => { const name=query.trim(); if (!name || exact) return; onCreate(name,color); setQuery('') }
  const beginEdit=(label:TaskLabel) => { setEditing(label); setEditName(label.name); setColor(label.color) }
  const saveEdit=() => { if (!editing || !editName.trim()) return; onUpdate(editing.id,{name:editName.trim(),color}); setEditing(null); setEditName('') }
  if (editing) return <div className="space-y-3"><label className="block text-[11px] font-semibold">Label name<input autoFocus value={editName} maxLength={48} onChange={(event) => setEditName(event.target.value)} onKeyDown={(event) => { if (event.key==='Enter') saveEdit(); if (event.key==='Escape') setEditing(null) }} className="mt-1 h-9 w-full rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2.5 text-xs outline-none focus:border-[var(--primary)]"/></label><ColorPalette value={color} onChange={setColor}/><div className="flex gap-2"><button type="button" onClick={() => setEditing(null)} className="h-8 flex-1 rounded-md border border-[var(--ui-border)] text-xs font-semibold">Cancel</button><button type="button" onClick={saveEdit} disabled={!editName.trim()} className="h-8 flex-1 rounded-md bg-[var(--primary)] text-xs font-semibold text-white disabled:opacity-40">Save</button></div></div>
  return <div className="space-y-2"><SearchField value={query} onChange={setQuery} placeholder="Search or create a label"/><div className="max-h-52 space-y-0.5 overflow-y-auto">
    {visible.map((label) => { const selected=assignedIds.includes(label.id); return <div key={label.id} className="group flex items-center gap-1 rounded-md hover:bg-[var(--surface-muted)]"><button type="button" onClick={() => selected ? onRemove(label.id) : onAdd(label.id)} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"><span className={`truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${LABEL_STYLE[label.color]}`}>{label.name}</span>{selected && <Check size={13} className="ml-auto shrink-0 text-[var(--primary)]"/>}</button><button type="button" onClick={() => beginEdit(label)} aria-label={`Edit ${label.name}`} className="grid h-7 w-7 shrink-0 place-items-center rounded text-[var(--muted-foreground)] opacity-70 hover:bg-[var(--surface)] group-hover:opacity-100"><Pencil size={11}/></button><button type="button" onClick={() => { void confirmDialog({ title: `Delete the label “${label.name}”?`, description: 'It will be removed from every task.' }).then((ok) => { if (ok) onDelete(label.id) }) }} aria-label={`Delete ${label.name}`} className="mr-1 grid h-7 w-7 shrink-0 place-items-center rounded text-[var(--muted-foreground)] opacity-70 hover:bg-red-500/10 hover:text-[var(--danger)] group-hover:opacity-100"><Trash2 size={11}/></button></div> })}
    {!visible.length && !normalized && <EmptySearch message="No labels yet. Create one below."/>}
  </div>{normalized && !exact && <div className="rounded-lg border border-[var(--ui-border)] p-2"><p className="mb-2 text-[10px] text-[var(--muted-foreground)]">Create “{query.trim()}”</p><ColorPalette value={color} onChange={setColor}/><button type="button" onClick={create} className="mt-2 h-8 w-full rounded-md bg-[var(--primary)] text-xs font-semibold text-white">Create and add</button></div>}</div>
}

export function TaskDependencyPicker({ task, tasks, dependencies, onAdd }: {
  task: TaskDetails
  tasks: TaskDetails[]
  dependencies: TaskDependency[]
  onAdd: (targetId: string, relation: DependencyRelation) => void
}) {
  const [query,setQuery]=useState('')
  const [relation,setRelation]=useState<DependencyRelation>('relates_to')
  const visible=useMemo(() => {
    const linked=new Set(dependencies.flatMap((dependency) => [dependency.taskId,dependency.targetTaskId]))
    return tasks.filter((candidate) => candidate.id!==task.id && !linked.has(candidate.id) && `${candidate.key} ${candidate.title}`.toLowerCase().includes(query.trim().toLowerCase()))
  },[dependencies,query,task.id,tasks])
  return <div className="space-y-2"><label className="block text-[10px] font-semibold text-[var(--muted-foreground)]">Relationship<select value={relation} onChange={(event) => setRelation(event.target.value as DependencyRelation)} className="mt-1 h-8 w-full rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2 text-xs text-[var(--foreground)]"><option value="blocks">Blocks</option><option value="blocked_by">Blocked by</option><option value="relates_to">Relates to</option></select></label><SearchField value={query} onChange={setQuery} placeholder="Search by task key or title"/><div className="max-h-52 overflow-y-auto">{visible.map((candidate) => <button key={candidate.id} type="button" onClick={() => onAdd(candidate.id,relation)} className="w-full rounded-md px-2 py-2 text-left hover:bg-[var(--surface-muted)]"><strong className="block text-[10px] text-[var(--primary)]">{candidate.key}</strong><span className="block truncate text-xs">{candidate.title}</span></button>)}{!visible.length && <EmptySearch message={tasks.length <= 1 ? 'No other tasks are available.' : 'No unlinked tasks match your search.'}/>}</div></div>
}

function SearchField({value,onChange,placeholder}:{value:string;onChange:(value:string)=>void;placeholder:string}) {
  return <label className="relative block"><span className="sr-only">{placeholder}</span><Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]"/><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-8 w-full rounded-md border border-[var(--ui-border)] bg-[var(--surface)] pl-8 pr-2 text-xs outline-none focus:border-[var(--primary)]"/></label>
}
function ColorPalette({value,onChange}:{value:LabelColor;onChange:(value:LabelColor)=>void}) { return <div className="flex flex-wrap gap-1.5" aria-label="Label color">{LABEL_COLORS.map((color) => <button key={color} type="button" onClick={() => onChange(color)} aria-label={color} aria-pressed={value===color} className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-[var(--surface)] ${value===color ? 'ring-2 ring-[var(--primary)]' : ''}`} style={{background:LABEL_SWATCH[color]}}/>)}</div> }
function EmptySearch({message}:{message:string}) { return <p className="px-2 py-5 text-center text-[11px] text-[var(--muted-foreground)]">{message}</p> }
