'use client'

import { forwardRef, useState, type ButtonHTMLAttributes } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { CalendarDays, ChevronDown, Clock3, Flag, ListChecks, MoreHorizontal, Paperclip, Tags, Users, X, Zap } from 'lucide-react'
import { TaskAssigneePicker, TaskDependencyPicker, TaskLabelPicker } from './TaskPickers'
import type { DependencyRelation, LabelColor, TaskDependency, TaskDetails, TaskEstimate, TaskLabel, TaskMember, TaskPriority, TaskReminder } from '@/types/task'

const PRIORITIES: Record<TaskPriority,{label:string;color:string}> = {
  urgent:{label:'Urgent',color:'#E11D48'}, high:{label:'High',color:'#EA580C'},
  medium:{label:'Medium',color:'#D97706'}, low:{label:'Low',color:'#0284C7'},
}

export interface TaskQuickActionsProps {
  task: TaskDetails
  members: TaskMember[]
  labels: TaskLabel[]
  allLabels: TaskLabel[]
  allTasks: TaskDetails[]
  dependencies: TaskDependency[]
  onAssignee: (memberId: string, selected: boolean) => void | Promise<void>
  onCreateLabel: (name: string, color: LabelColor) => unknown
  onAddLabel: (labelId: string) => unknown
  onRemoveLabel: (labelId: string) => unknown
  onUpdateLabel: (labelId: string, patch: { name?: string; color?: LabelColor }) => unknown
  onDeleteLabel: (labelId: string) => unknown
  onDates: (start: string, due: string, reminder?: TaskReminder) => void | Promise<unknown>
  onPriority: (priority: TaskPriority) => void
  onEstimate: (estimate?: TaskEstimate) => unknown
  onChecklist: () => void
  onAttachment: () => void
  onDependency: (targetId: string, relation: DependencyRelation) => void
}

export function TaskQuickActions(props: TaskQuickActionsProps) {
  const { task,members,labels,allLabels,allTasks,dependencies }=props
  return <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
    <Popover.Root><Popover.Trigger asChild><QuickButton icon={<Users size={14}/>} label={task.assigneeIds.length ? `${task.assigneeIds.length} assigned` : 'Assignees'}/></Popover.Trigger><Panel title="Assignees"><TaskAssigneePicker members={members} selectedIds={task.assigneeIds} onToggle={props.onAssignee}/></Panel></Popover.Root>
    <Popover.Root><Popover.Trigger asChild><QuickButton icon={<Tags size={14}/>} label={labels.length ? `${labels.length} labels` : 'Labels'}/></Popover.Trigger><Panel title="Labels"><TaskLabelPicker labels={allLabels} assignedIds={task.labelIds} onAdd={props.onAddLabel} onRemove={props.onRemoveLabel} onCreate={props.onCreateLabel} onUpdate={props.onUpdateLabel} onDelete={props.onDeleteLabel}/></Panel></Popover.Root>
    <Popover.Root><Popover.Trigger asChild><QuickButton icon={<CalendarDays size={14}/>} label="Dates"/></Popover.Trigger><Panel title="Schedule"><DateEditor start={task.startDate || ''} due={task.dueDate || ''} reminder={task.reminder} onSave={props.onDates}/></Panel></Popover.Root>
    <Popover.Root><Popover.Trigger asChild><QuickButton icon={<Flag size={14}/>} label={PRIORITIES[task.priority].label}/></Popover.Trigger><Panel title="Priority"><PriorityPicker value={task.priority} onChange={props.onPriority}/></Panel></Popover.Root>

    <span className="hidden gap-2 sm:contents">
      <Popover.Root><Popover.Trigger asChild><QuickButton icon={<Clock3 size={14}/>} label={task.estimate ? `${task.estimate.value} ${task.estimate.unit}` : 'Estimate'}/></Popover.Trigger><Panel title="Estimate"><EstimateEditor estimate={task.estimate} onSave={props.onEstimate}/></Panel></Popover.Root>
      <QuickButton icon={<ListChecks size={14}/>} label="Checklist" onClick={props.onChecklist}/>
      <QuickButton icon={<Paperclip size={14}/>} label="Attachment" onClick={props.onAttachment}/>
      <Popover.Root><Popover.Trigger asChild><QuickButton icon={<Zap size={14}/>} label="Dependency"/></Popover.Trigger><Panel title="Link work"><TaskDependencyPicker task={task} tasks={allTasks} dependencies={dependencies} onAdd={props.onDependency}/></Panel></Popover.Root>
    </span>

    <Popover.Root><Popover.Trigger asChild><QuickButton className="sm:hidden" icon={<MoreHorizontal size={14}/>} label="More"/></Popover.Trigger><Panel title="More task actions"><MobileMore {...props}/></Panel></Popover.Root>
  </div>
}

function MobileMore(props: TaskQuickActionsProps) {
  const [section,setSection]=useState<'menu'|'estimate'|'dependency'>('menu')
  if (section==='estimate') return <><Back onClick={() => setSection('menu')}/><EstimateEditor estimate={props.task.estimate} onSave={props.onEstimate}/></>
  if (section==='dependency') return <><Back onClick={() => setSection('menu')}/><TaskDependencyPicker task={props.task} tasks={props.allTasks} dependencies={props.dependencies} onAdd={props.onDependency}/></>
  return <div className="space-y-1"><ActionRow icon={<Clock3 size={14}/>} label="Set estimate" onClick={() => setSection('estimate')}/><ActionRow icon={<ListChecks size={14}/>} label="Add checklist" onClick={props.onChecklist}/><ActionRow icon={<Paperclip size={14}/>} label="Open attachments" onClick={props.onAttachment}/><ActionRow icon={<Zap size={14}/>} label="Add dependency" onClick={() => setSection('dependency')}/></div>
}

function PriorityPicker({value,onChange}:{value:TaskPriority;onChange:(priority:TaskPriority)=>void}) { return <div>{(Object.keys(PRIORITIES) as TaskPriority[]).map((priority) => <button key={priority} type="button" onClick={() => onChange(priority)} aria-pressed={value===priority} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-[var(--surface-muted)]"><span className="h-2 w-2 rounded-full" style={{background:PRIORITIES[priority].color}}/>{PRIORITIES[priority].label}{value===priority && <span className="ml-auto text-[var(--primary)]">✓</span>}</button>)}</div> }

function DateEditor({start,due,reminder,onSave}:{start:string;due:string;reminder?:TaskReminder;onSave:(start:string,due:string,reminder?:TaskReminder)=>void|Promise<unknown>}) {
  const [startDate,setStart]=useState(start)
  const [dueDate,setDue]=useState(due)
  const [offset,setOffset]=useState(reminder?.offsetMinutes ?? 1440)
  const invalid=Boolean(startDate && dueDate && dueDate < startDate)
  return <div className="space-y-3"><label className="block text-[11px] font-semibold">Start<input type="date" value={startDate} onChange={(event) => setStart(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2 text-xs"/></label><label className="block text-[11px] font-semibold">Due<input type="date" value={dueDate} min={startDate} onChange={(event) => setDue(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2 text-xs"/></label>{invalid && <p role="alert" className="text-[10px] text-[var(--danger)]">Due date cannot be before the start date.</p>}<label className="block text-[11px] font-semibold">Reminder<select value={offset} onChange={(event) => setOffset(Number(event.target.value))} className="mt-1 h-9 w-full rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2 text-xs"><option value={0}>At due time</option><option value={60}>1 hour before</option><option value={1440}>1 day before</option><option value={4320}>3 days before</option></select></label><p className="text-[10px] text-[var(--muted-foreground)]">Saved locally. Delivery requires a notification scheduler.</p><div className="flex gap-2"><button type="button" onClick={() => { setStart(''); setDue(''); void onSave('','',undefined) }} className="h-8 flex-1 rounded-md border border-[var(--ui-border)] text-xs font-semibold">Clear</button><button type="button" disabled={invalid} onClick={() => void onSave(startDate,dueDate,{enabled:!!dueDate,offsetMinutes:offset})} className="h-8 flex-1 rounded-md bg-[var(--primary)] text-xs font-semibold text-white disabled:opacity-40">Save</button></div></div>
}

function EstimateEditor({estimate,onSave}:{estimate?:TaskEstimate;onSave:(estimate?:TaskEstimate)=>unknown}) {
  const [unit,setUnit]=useState<'points'|'hours'>(estimate?.unit || 'points')
  const [value,setValue]=useState(estimate?.value || 1)
  const valid=unit==='hours' ? Number.isFinite(value) && value>0 && value<=1000 : [1,2,3,5,8,13].includes(value)
  return <div><div className="mb-2 grid grid-cols-2 rounded-md bg-[var(--surface-muted)] p-1">{(['points','hours'] as const).map((item) => <button key={item} type="button" onClick={() => { setUnit(item); setValue(item==='points'?1:estimate?.value||1) }} className={`h-7 rounded text-[10px] font-semibold capitalize ${unit===item ? 'bg-[var(--surface)] shadow-sm' : ''}`}>{item}</button>)}</div>{unit==='points' ? <div className="grid grid-cols-6 gap-1">{[1,2,3,5,8,13].map((point) => <button key={point} type="button" onClick={() => setValue(point)} aria-pressed={value===point} className={`h-8 rounded border text-xs font-semibold ${value===point ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--ui-border)]'}`}>{point}</button>)}</div> : <input aria-label="Estimated hours" type="number" min={0.25} max={1000} step={0.25} value={value} onChange={(event) => setValue(Number(event.target.value))} className="h-9 w-full rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2 text-xs"/>}<div className="mt-3 flex gap-2"><button type="button" onClick={() => onSave(undefined)} className="h-8 flex-1 rounded-md border border-[var(--ui-border)] text-xs">Clear</button><button type="button" disabled={!valid} onClick={() => onSave({value,unit})} className="h-8 flex-1 rounded-md bg-[var(--primary)] text-xs font-semibold text-white disabled:opacity-40">Save</button></div></div>
}

const QuickButton=forwardRef<HTMLButtonElement,{icon:React.ReactNode;label:string}&ButtonHTMLAttributes<HTMLButtonElement>>(function QuickButton({icon,label,className='',...buttonProps},ref) { return <button ref={ref} type="button" {...buttonProps} className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] px-2.5 text-[11px] font-semibold text-[var(--muted-foreground)] transition hover:border-[var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] ${className}`}>{icon}{label}</button> })
function Panel({title,children}:{title:string;children:React.ReactNode}) { return <Popover.Portal><Popover.Content sideOffset={6} align="start" collisionPadding={12} className="z-[140] w-72 rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-2xl"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold">{title}</h3><Popover.Close className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--surface-muted)]" aria-label={`Close ${title}`}><X size={12}/></Popover.Close></div>{children}<Popover.Arrow className="fill-[var(--surface)]"/></Popover.Content></Popover.Portal> }
function ActionRow({icon,label,onClick}:{icon:React.ReactNode;label:string;onClick:()=>void}) { return <button type="button" onClick={onClick} className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-xs font-semibold hover:bg-[var(--surface-muted)]">{icon}{label}<ChevronDown size={12} className="ml-auto -rotate-90"/></button> }
function Back({onClick}:{onClick:()=>void}) { return <button type="button" onClick={onClick} className="mb-2 text-[10px] font-semibold text-[var(--primary)]">← All actions</button> }
