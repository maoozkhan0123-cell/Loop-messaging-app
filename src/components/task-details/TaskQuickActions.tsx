'use client'

import { forwardRef, useState, type ButtonHTMLAttributes } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Plus, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { DateField, LABEL_STYLE } from './TaskProperties'
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
  /** Rendered as the first row, e.g. the status menu. */
  status?: React.ReactNode
}

/** The task's properties card. Every value is clickable and opens its editor in a popover. */
export function TaskQuickActions(props: TaskQuickActionsProps) {
  const { task,members,labels,allLabels,allTasks,dependencies }=props
  const assignees=members.filter((member) => task.assigneeIds.includes(member.id))
  const linked=dependencies.filter((dependency) => dependency.taskId===task.id || dependency.targetTaskId===task.id).length
  return <section className="rounded-xl border border-[var(--ui-border)] bg-[var(--surface-raised)] p-3">
    <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]">Properties</h2>
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {props.status && <Row label="Status">{props.status}</Row>}
      <Row label="Assignees">
        <Popover.Root><Popover.Trigger asChild><ValueButton aria-label="Assignees">{assignees.length?<span className="flex -space-x-1">{assignees.map((member) => <span key={member.id} title={member.name} className="rounded-full ring-2 ring-[var(--surface-raised)]"><Avatar name={member.name} src={member.avatarUrl} size={24}/></span>)}</span>:<AddText>Assign</AddText>}</ValueButton></Popover.Trigger><Panel title="Assignees"><TaskAssigneePicker members={members} selectedIds={task.assigneeIds} onToggle={props.onAssignee}/></Panel></Popover.Root>
      </Row>
      <Row label="Priority">
        <Popover.Root><Popover.Trigger asChild><ValueButton><span className="h-2 w-2 rounded-full" style={{background:PRIORITIES[task.priority].color}}/><span className="text-xs">{PRIORITIES[task.priority].label}</span></ValueButton></Popover.Trigger><Panel title="Priority"><PriorityPicker value={task.priority} onChange={props.onPriority}/></Panel></Popover.Root>
      </Row>
      <Row label="Labels">
        <Popover.Root><Popover.Trigger asChild><ValueButton aria-label="Labels">{labels.length?<span className="flex flex-wrap gap-1">{labels.map((label) => <span key={label.id} className={`max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${LABEL_STYLE[label.color]}`}>{label.name}</span>)}</span>:<AddText>Add label</AddText>}</ValueButton></Popover.Trigger><Panel title="Labels"><TaskLabelPicker labels={allLabels} assignedIds={task.labelIds} onAdd={props.onAddLabel} onRemove={props.onRemoveLabel} onCreate={props.onCreateLabel} onUpdate={props.onUpdateLabel} onDelete={props.onDeleteLabel}/></Panel></Popover.Root>
      </Row>
      <Row label="Start"><DateField label="Start date" value={task.startDate} max={task.dueDate} onChange={(value) => void props.onDates(value,task.dueDate||'',task.reminder)}/></Row>
      <Row label="Due"><DateField label="Due date" value={task.dueDate} min={task.startDate} smart onChange={(value) => void props.onDates(task.startDate||'',value,task.reminder)}/></Row>
      <Row label="Estimate">
        <Popover.Root><Popover.Trigger asChild><ValueButton aria-label="Estimate">{task.estimate?<span className="text-xs">{task.estimate.value} {task.estimate.unit}</span>:<AddText>Set estimate</AddText>}</ValueButton></Popover.Trigger><Panel title="Estimate"><EstimateEditor estimate={task.estimate} onSave={props.onEstimate}/></Panel></Popover.Root>
      </Row>
      <Row label="Linked work">
        <Popover.Root><Popover.Trigger asChild><ValueButton aria-label="Linked work">{linked?<span className="text-xs">{linked} linked {linked===1?'task':'tasks'}</span>:<AddText>Link a task</AddText>}</ValueButton></Popover.Trigger><Panel title="Link work"><TaskDependencyPicker task={task} tasks={allTasks} dependencies={dependencies} onAdd={props.onDependency}/></Panel></Popover.Root>
      </Row>
    </dl>
  </section>
}

function Row({label,children}:{label:string;children:React.ReactNode}) { return <div className="grid min-h-9 grid-cols-[82px_minmax(0,1fr)] items-center gap-2"><dt className="text-[11px] text-[var(--muted-foreground)]">{label}</dt><dd className="min-w-0">{children}</dd></div> }
function AddText({children}:{children:React.ReactNode}) { return <span className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]"><Plus size={12}/>{children}</span> }
const ValueButton=forwardRef<HTMLButtonElement,ButtonHTMLAttributes<HTMLButtonElement>>(function ValueButton({className='',children,...buttonProps},ref) { return <button ref={ref} type="button" {...buttonProps} className={`-mx-1.5 flex min-h-7 max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left transition hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${className}`}>{children}</button> })

function PriorityPicker({value,onChange}:{value:TaskPriority;onChange:(priority:TaskPriority)=>void}) { return <div>{(Object.keys(PRIORITIES) as TaskPriority[]).map((priority) => <button key={priority} type="button" onClick={() => onChange(priority)} aria-pressed={value===priority} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-[var(--surface-muted)]"><span className="h-2 w-2 rounded-full" style={{background:PRIORITIES[priority].color}}/>{PRIORITIES[priority].label}{value===priority && <span className="ml-auto text-[var(--primary)]">✓</span>}</button>)}</div> }

function EstimateEditor({estimate,onSave}:{estimate?:TaskEstimate;onSave:(estimate?:TaskEstimate)=>unknown}) {
  const [unit,setUnit]=useState<'points'|'hours'>(estimate?.unit || 'points')
  const [value,setValue]=useState(estimate?.value || 1)
  const valid=unit==='hours' ? Number.isFinite(value) && value>0 && value<=1000 : [1,2,3,5,8,13].includes(value)
  return <div><div className="mb-2 grid grid-cols-2 rounded-md bg-[var(--surface-muted)] p-1">{(['points','hours'] as const).map((item) => <button key={item} type="button" onClick={() => { setUnit(item); setValue(item==='points'?1:estimate?.value||1) }} className={`h-7 rounded text-[10px] font-semibold capitalize ${unit===item ? 'bg-[var(--surface)] shadow-sm' : ''}`}>{item}</button>)}</div>{unit==='points' ? <div className="grid grid-cols-6 gap-1">{[1,2,3,5,8,13].map((point) => <button key={point} type="button" onClick={() => setValue(point)} aria-pressed={value===point} className={`h-8 rounded border text-xs font-semibold ${value===point ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--ui-border)]'}`}>{point}</button>)}</div> : <input aria-label="Estimated hours" type="number" min={0.25} max={1000} step={0.25} value={value} onChange={(event) => setValue(Number(event.target.value))} className="h-9 w-full rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2 text-xs"/>}<div className="mt-3 flex gap-2"><button type="button" onClick={() => onSave(undefined)} className="h-8 flex-1 rounded-md border border-[var(--ui-border)] text-xs">Clear</button><button type="button" disabled={!valid} onClick={() => onSave({value,unit})} className="h-8 flex-1 rounded-md bg-[var(--primary)] text-xs font-semibold text-white disabled:opacity-40">Save</button></div></div>
}

function Panel({title,children}:{title:string;children:React.ReactNode}) { return <Popover.Portal><Popover.Content sideOffset={6} align="start" collisionPadding={12} className="z-[140] w-72 rounded-xl border border-[var(--ui-border)] bg-[var(--surface)] p-3 text-[var(--foreground)] shadow-2xl"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold">{title}</h3><Popover.Close className="grid h-6 w-6 place-items-center rounded hover:bg-[var(--surface-muted)]" aria-label={`Close ${title}`}><X size={12}/></Popover.Close></div>{children}<Popover.Arrow className="fill-[var(--surface)]"/></Popover.Content></Popover.Portal> }
