'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { Archive, Check, Clipboard, Flag, ListChecks, MessageSquare, Paperclip, Search, UserPlus, X } from 'lucide-react'
import type { ProjectColumn } from '@/types/database'
import type { TaskDetails, TaskMember, TaskPriority } from '@/types/task'

interface TaskCommandPaletteProps {
  open: boolean
  onOpenChange: (open:boolean) => void
  task: TaskDetails
  columns: ProjectColumn[]
  members: TaskMember[]
  onStatus: (columnId:string) => void
  onPriority: (priority:TaskPriority) => void
  onAssignee: (memberId:string,selected:boolean) => void
  onChecklist: () => void
  onAttachment: () => void
  onComment: () => void
  onCopyLink: () => void
  onArchive: () => void
}

export function TaskCommandPalette(props:TaskCommandPaletteProps) {
  const run=(action:()=>void) => { props.onOpenChange(false); action() }
  return <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-[160] bg-black/40 backdrop-blur-[1px]"/><Dialog.Content className="fixed left-1/2 top-[18%] z-[161] w-[min(92vw,620px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] text-[var(--foreground)] shadow-[0_24px_90px_rgba(0,0,0,.45)] outline-none"><Dialog.Title className="sr-only">Task command palette</Dialog.Title><Command label="Task commands" className="bg-transparent"><div className="flex items-center gap-2 border-b border-[var(--ui-border)] px-4"><Search size={16} className="text-[var(--muted-foreground)]"/><Command.Input autoFocus placeholder="Search task commands…" className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted-foreground)]"/><Dialog.Close aria-label="Close command palette" className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--surface-muted)]"><X size={15}/></Dialog.Close></div><Command.List className="max-h-[min(60vh,520px)] overflow-y-auto p-2"><Command.Empty className="px-4 py-10 text-center text-xs text-[var(--muted-foreground)]">No commands found.</Command.Empty>
      <Group heading="Workflow">{props.columns.map((column) => <Item key={column.id} icon={props.task.columnId===column.id?<Check size={14}/>:<span className="h-2 w-2 rounded-full bg-[var(--primary)]"/>} value={`status ${column.name}`} onSelect={() => run(() => props.onStatus(column.id))}>Change status to {column.name}</Item>)}</Group>
      <Group heading="Priority">{(['urgent','high','medium','low'] as TaskPriority[]).map((priority) => <Item key={priority} icon={<Flag size={14}/>} value={`priority ${priority}`} onSelect={() => run(() => props.onPriority(priority))}>Set priority to <span className="capitalize">{priority}</span></Item>)}</Group>
      <Group heading="Assign">{props.members.slice(0,12).map((member) => { const selected=props.task.assigneeIds.includes(member.id); return <Item key={member.id} icon={selected?<Check size={14}/>:<UserPlus size={14}/>} value={`assignee ${member.name} ${member.email||''}`} onSelect={() => run(() => props.onAssignee(member.id,selected))}>{selected?'Unassign':'Assign'} {member.name}</Item> })}</Group>
      <Group heading="Actions"><Item icon={<ListChecks size={14}/>} value="add checklist" onSelect={() => run(props.onChecklist)}>Add checklist</Item><Item icon={<Paperclip size={14}/>} value="add attachment file" onSelect={() => run(props.onAttachment)}>Add attachment</Item><Item icon={<MessageSquare size={14}/>} value="comment discussion activity" onSelect={() => run(props.onComment)}>Open comment composer</Item><Item icon={<Clipboard size={14}/>} value="copy link url" onSelect={() => run(props.onCopyLink)}>Copy task link</Item><Item icon={<Archive size={14}/>} value="archive task" onSelect={() => run(props.onArchive)} danger>Archive task</Item></Group>
    </Command.List></Command></Dialog.Content></Dialog.Portal></Dialog.Root>
}

function Group({heading,children}:{heading:string;children:React.ReactNode}) { return <Command.Group heading={heading} className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5">{children}</Command.Group> }
function Item({icon,children,value,onSelect,danger=false}:{icon:React.ReactNode;children:React.ReactNode;value:string;onSelect:()=>void;danger?:boolean}) { return <Command.Item value={value} onSelect={onSelect} className={`flex h-9 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-xs font-medium normal-case tracking-normal outline-none aria-selected:bg-[var(--surface-muted)] ${danger?'text-[var(--danger)]':'text-[var(--foreground)]'}`}>{icon}<span className="min-w-0 flex-1 truncate">{children}</span></Command.Item> }
