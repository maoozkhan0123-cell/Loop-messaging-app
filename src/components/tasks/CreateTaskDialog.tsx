'use client'

import { cloneElement, useId, useRef, useState, type FormEvent, type ReactElement } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { CalendarDays, Check, ClipboardList, ListChecks, Loader2, Plus, Search, Tag, Trash2, UserPlus, X } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toaster'
import type { CreateDashboardTaskInput } from '@/hooks/useDashboard'
import { calendarDayKey } from '@/lib/calendar'
import type { Profile, ProjectBoard, ProjectColumn, TaskPriority } from '@/types/database'

export type CreateTaskDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDate?: Date
  boards: ProjectBoard[]
  columns: ProjectColumn[]
  profiles: Profile[]
  meId?: string
  creating?: boolean
  onCreate: (input: CreateDashboardTaskInput) => Promise<unknown>
  defaultBoardId?: string
  defaultColumnId?: string
  availableLabels?: string[]
}

type ChecklistDraft = { id: number; label: string; completed: boolean }

export function CreateTaskDialog(props: CreateTaskDialogProps) {
  return (
    <Dialog.Root open={props.open} onOpenChange={props.onOpenChange}>
      {props.open && <TaskForm {...props} />}
    </Dialog.Root>
  )
}

function TaskForm({ onOpenChange, selectedDate, boards, columns, profiles, meId, creating = false, onCreate, defaultBoardId, defaultColumnId, availableLabels = [] }: CreateTaskDialogProps) {
  const { toast } = useToast()
  const errorId = useId()
  const [boardId, setBoardId] = useState(defaultBoardId ?? boards[0]?.id ?? '')
  const [columnId, setColumnId] = useState(defaultColumnId ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState(() => calendarDayKey(selectedDate ?? new Date()))
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() => profiles.some((profile) => profile.id === meId) ? [meId!] : [])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const [labels, setLabels] = useState<string[]>([])
  const [labelDraft, setLabelDraft] = useState('')
  const [checklist, setChecklist] = useState<ChecklistDraft[]>([])
  const [checklistDraft, setChecklistDraft] = useState('')
  const nextChecklistId = useRef(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const busy = creating || submitting
  const selectedBoard = boards.find((board) => board.id === boardId) ?? boards[0]
  const boardColumns = columns.filter((column) => column.board_id === selectedBoard?.id).sort((a, b) => a.position - b.position)
  const selectedColumn = boardColumns.find((column) => column.id === columnId) ?? boardColumns[0]
  const selectedMembers = assigneeIds.flatMap((id) => profiles.filter((profile) => profile.id === id))
  const visibleMembers = profiles.filter((profile) => `${profile.display_name} ${profile.email} ${profile.job_title ?? ''}`.toLowerCase().includes(memberQuery.trim().toLowerCase()))
  const completedItems = checklist.filter((item) => item.completed).length
  const progress = checklist.length ? Math.round(completedItems / checklist.length * 100) : 0
  const suggestedLabels = Array.from(new Set(availableLabels.map((label) => label.trim()).filter(Boolean))).filter((label) => !labels.some((selected) => selected.toLowerCase() === label.toLowerCase()) && label.toLowerCase().includes(labelDraft.trim().toLowerCase())).slice(0, 8)

  const toggleAssignee = (id: string) => setAssigneeIds((current) => current.includes(id) ? current.filter((selected) => selected !== id) : [...current, id])
  const addLabel = (value = labelDraft) => {
    const label = value.trim()
    if (!label) return
    setLabels((current) => current.some((item) => item.toLowerCase() === label.toLowerCase()) ? current : [...current, label])
    setLabelDraft('')
  }
  const addChecklistItem = () => {
    if (!checklistDraft.trim()) return
    const item = { id: nextChecklistId.current++, label: checklistDraft.trim(), completed: false }
    setChecklist((current) => [...current, item])
    setChecklistDraft('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setError(null)
    if (!title.trim() || !selectedBoard || !selectedColumn) {
      setError('Enter a task title and select a project with a status.')
      return
    }
    if (startDate && dueDate && startDate > dueDate) {
      setError('Due date must be on or after the start date.')
      return
    }
    if (checklist.some((item) => !item.label.trim())) {
      setError('Give each checklist item a name or remove the empty item.')
      return
    }
    const submittedLabels = [...labels]
    if (labelDraft.trim() && !submittedLabels.some((label) => label.toLowerCase() === labelDraft.trim().toLowerCase())) submittedLabels.push(labelDraft.trim())
    const checklistItems = checklist.map((item) => ({ label: item.label.trim(), completed: item.completed }))
    if (checklistDraft.trim()) checklistItems.push({ label: checklistDraft.trim(), completed: false })
    const input: CreateDashboardTaskInput = {
      boardId: selectedBoard.id,
      columnId: selectedColumn.id,
      title: title.trim(),
      description: description.trim(),
      priority,
      assigneeIds,
      assigneeId: assigneeIds[0],
      startDate: startDate || null,
      dueDate: dueDate || null,
      labels: submittedLabels,
      checklistItems,
    }
    setSubmitting(true)
    try {
      await onCreate(input)
      onOpenChange(false)
      toast({ title: 'Task created', description: assigneeIds.length ? `Assigned to ${assigneeIds.length} member${assigneeIds.length === 1 ? '' : 's'} in ${selectedBoard.name}.` : `Saved to ${selectedBoard.name}.`, type: 'success' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The task could not be created. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[120] bg-black/50 backdrop-blur-[2px]" />
      <Dialog.Content
        className="fixed left-1/2 top-1/2 z-[121] flex max-h-[calc(100dvh-24px)] w-[min(880px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[var(--ui-border)] bg-[var(--surface)] text-[var(--foreground)] shadow-2xl outline-none"
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }}
        onInteractOutside={(event) => { if (busy) event.preventDefault() }}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-[var(--ui-border)] px-5 py-4 sm:px-6">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><ClipboardList size={20} /></span>
          <div className="min-w-0 flex-1">
            <Dialog.Title className="text-lg font-semibold">New task</Dialog.Title>
            <Dialog.Description className="mt-0.5 text-xs leading-relaxed text-[var(--muted-foreground)]">Define the work, choose your team, and plan the details.</Dialog.Description>
          </div>
          <Dialog.Close disabled={busy} aria-label="Close task form" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-40"><X size={18} /></Dialog.Close>
        </header>

        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col" aria-busy={busy}>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <fieldset disabled={busy} className="grid min-w-0 gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_240px]">
              <legend className="sr-only">Task details</legend>
              <div className="min-w-0 space-y-6">
                <Field label="Task title"><input autoFocus required maxLength={240} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What needs to be done?" className="member-input" /></Field>
                <Field label="Description"><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Add context, requirements, or a useful link…" rows={3} className="member-input min-h-24 resize-y py-2.5" /></Field>

                <section aria-labelledby="create-task-assignees">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 id="create-task-assignees" className="flex items-center gap-2 text-xs font-semibold"><UserPlus size={15} className="text-[var(--muted-foreground)]" />Assignees <span className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">{assigneeIds.length}</span></h3><button type="button" onClick={() => setAssigneeIds([])} disabled={!assigneeIds.length} className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:hidden">Clear all</button></div>
                  <div className="flex flex-wrap gap-2">
                    {selectedMembers.map((member) => <span key={member.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--ui-border)] bg-[var(--surface-muted)] py-1 pl-1 pr-1.5"><Avatar name={member.display_name} src={member.avatar_url} size={22} /><span className="truncate text-xs font-medium">{member.display_name}</span><button type="button" aria-label={`Remove ${member.display_name} from assignees`} onClick={() => toggleAssignee(member.id)} className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] hover:bg-[var(--surface)]"><X size={12} /></button></span>)}
                    <button type="button" aria-expanded={pickerOpen} onClick={() => setPickerOpen((current) => !current)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-[var(--ui-border)] px-3 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]"><Plus size={13} />Choose assignees</button>
                  </div>
                  {!assigneeIds.length && <p className="mt-2 text-[11px] text-[var(--muted-foreground)]">Unassigned. You can choose more than one person.</p>}
                  {pickerOpen && <div className="mt-3 overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--surface)]">
                    <label className="relative block border-b border-[var(--ui-border)]"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" /><input aria-label="Search assignees" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault() }} placeholder="Search by name or email" className="h-10 w-full min-w-0 bg-transparent pl-9 pr-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]" /></label>
                    <div className="max-h-44 overflow-y-auto p-1" aria-label="Available assignees">{visibleMembers.map((member) => { const selected = assigneeIds.includes(member.id); return <button key={member.id} type="button" role="checkbox" aria-checked={selected} aria-label={`Assign ${member.display_name}`} onClick={() => toggleAssignee(member.id)} className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${selected ? 'bg-[var(--primary-soft)]' : 'hover:bg-[var(--surface-muted)]'}`}><Avatar name={member.display_name} src={member.avatar_url} size={28} /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{member.display_name}{member.id === meId && <span className="text-[var(--muted-foreground)]"> (you)</span>}</span><span className="block truncate text-[10px] text-[var(--muted-foreground)]">{member.email}</span></span><span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${selected ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--ui-border)]'}`}>{selected && <Check size={11} />}</span></button> })}{!visibleMembers.length && <p className="px-3 py-6 text-center text-xs text-[var(--muted-foreground)]">{profiles.length ? 'No people match your search.' : 'No team members are available.'}</p>}</div>
                  </div>}
                </section>

                <section aria-labelledby="create-task-checklist">
                  <div className="mb-2 flex items-center justify-between gap-2"><h3 id="create-task-checklist" className="flex items-center gap-2 text-xs font-semibold"><ListChecks size={15} className="text-[var(--muted-foreground)]" />Checklist</h3>{checklist.length > 0 && <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">{completedItems}/{checklist.length} completed</span>}</div>
                  {checklist.length > 0 && <div role="progressbar" aria-label="Checklist progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="mb-3 h-1.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div style={{ width: `${progress}%` }} className="h-full rounded-full bg-[var(--primary)] transition-[width]" /></div>}
                  <div className="space-y-2">{checklist.map((item, index) => <div key={item.id} className="flex items-center gap-2 rounded-lg border border-[var(--ui-border)] bg-[var(--surface)] p-2"><input type="checkbox" checked={item.completed} aria-label={`Complete checklist item ${index + 1}`} onChange={(event) => setChecklist((current) => current.map((row) => row.id === item.id ? { ...row, completed: event.target.checked } : row))} className="h-4 w-4 shrink-0 accent-[var(--primary)]" /><input aria-label={`Checklist item ${index + 1}`} value={item.label} maxLength={240} onChange={(event) => setChecklist((current) => current.map((row) => row.id === item.id ? { ...row, label: event.target.value } : row))} className={`min-w-0 flex-1 bg-transparent text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${item.completed ? 'text-[var(--muted-foreground)] line-through' : ''}`} /><button type="button" aria-label={`Remove checklist item ${index + 1}`} onClick={() => setChecklist((current) => current.filter((row) => row.id !== item.id))} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--muted-foreground)] hover:bg-red-500/10 hover:text-[var(--danger)]"><Trash2 size={13} /></button></div>)}</div>
                  <div className="mt-2 flex gap-2"><input aria-label="New checklist item" value={checklistDraft} maxLength={240} onChange={(event) => setChecklistDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addChecklistItem() } }} placeholder="Add a step…" className="member-input min-w-0 flex-1" /><button type="button" aria-label="Add checklist item" disabled={!checklistDraft.trim()} onClick={addChecklistItem} className="grid w-10 shrink-0 place-items-center rounded-lg border border-[var(--ui-border)] text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:opacity-40"><Plus size={16} /></button></div>
                </section>
              </div>

              <div className="min-w-0 space-y-5 rounded-xl border border-[var(--ui-border)] bg-[var(--surface-muted)] p-4">
                <Field label="Project"><select value={selectedBoard?.id ?? ''} disabled={!boards.length} onChange={(event) => { setBoardId(event.target.value); setColumnId('') }} className="member-input"><option value="" disabled>Select project</option>{boards.map((board) => <option key={board.id} value={board.id}>{board.name}</option>)}</select></Field>
                <Field label="Status"><select value={selectedColumn?.id ?? ''} disabled={!boardColumns.length} onChange={(event) => setColumnId(event.target.value)} className="member-input"><option value="" disabled>Select status</option>{boardColumns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}</select></Field>
                {(!boards.length || !boardColumns.length) && <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{!boards.length ? 'Create a project in Projects before adding a task.' : 'This project has no statuses. Add a status in Projects first.'}</p>}
                <Field label="Priority"><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className="member-input"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
                <div className="space-y-3 border-t border-[var(--ui-border)] pt-4"><h3 className="flex items-center gap-2 text-xs font-semibold"><CalendarDays size={14} className="text-[var(--muted-foreground)]" />Dates <span className="ml-auto text-[10px] font-normal text-[var(--muted-foreground)]">Optional</span></h3><Field label="Start date"><input type="date" value={startDate} max={dueDate || undefined} onChange={(event) => setStartDate(event.target.value)} className="member-input min-w-0" /></Field><Field label="Due date"><input type="date" value={dueDate} min={startDate || undefined} onChange={(event) => setDueDate(event.target.value)} className="member-input min-w-0" /></Field>{dueDate && <button type="button" onClick={() => setDueDate('')} className="text-[11px] text-[var(--muted-foreground)] hover:text-[var(--foreground)]">Clear due date</button>}</div>
                <section aria-labelledby="create-task-labels" className="border-t border-[var(--ui-border)] pt-4">
                  <h3 id="create-task-labels" className="mb-2 flex items-center gap-2 text-xs font-semibold"><Tag size={14} className="text-[var(--muted-foreground)]" />Labels</h3>
                  {labels.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{labels.map((label) => <span key={label.toLowerCase()} className="inline-flex max-w-full items-center gap-1 rounded-md bg-[var(--primary-soft)] px-2 py-1 text-[11px] font-medium text-[var(--primary)]"><span className="truncate">{label}</span><button type="button" aria-label={`Remove label ${label}`} onClick={() => setLabels((current) => current.filter((item) => item !== label))} className="grid h-4 w-4 shrink-0 place-items-center rounded hover:bg-[var(--surface)]"><X size={11} /></button></span>)}</div>}
                  <div className="flex gap-1.5"><input aria-label="Add a label" value={labelDraft} maxLength={48} onChange={(event) => setLabelDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addLabel() } }} placeholder="e.g. Design" className="member-input min-w-0 flex-1" /><button type="button" aria-label="Add label" disabled={!labelDraft.trim()} onClick={() => addLabel()} className="grid w-9 shrink-0 place-items-center rounded-lg border border-[var(--ui-border)] text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:opacity-40"><Plus size={14} /></button></div>
                  {suggestedLabels.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Suggested labels">{suggestedLabels.map((label) => <button key={label} type="button" onClick={() => addLabel(label)} className="max-w-full truncate rounded-md border border-[var(--ui-border)] bg-[var(--surface)] px-2 py-1 text-[10px] text-[var(--muted-foreground)] hover:text-[var(--primary)]">{label}</button>)}</div>}
                </section>
              </div>
            </fieldset>
          </div>
          <footer className="shrink-0 border-t border-[var(--ui-border)] bg-[var(--surface)] px-5 py-4 sm:px-6">
            {error && <p id={errorId} role="alert" className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-[var(--danger)]">{error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="flex items-center gap-1.5 text-[11px] text-[var(--muted-foreground)]"><ClipboardList size={13} />{selectedBoard ? `Creating in ${selectedBoard.name}` : 'Choose a project to get started'}</p><div className="flex gap-2"><Dialog.Close disabled={busy} className="h-10 rounded-lg border border-[var(--ui-border)] px-4 text-xs font-semibold hover:bg-[var(--surface-muted)] disabled:opacity-40">Cancel</Dialog.Close><button type="submit" disabled={busy || !selectedBoard || !selectedColumn} aria-describedby={error ? errorId : undefined} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-5 text-xs font-semibold text-white hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}{busy ? 'Creating…' : 'Create task'}</button></div></div>
          </footer>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  )
}

function Field({ label, children }: { label: string; children: ReactElement<{ id?: string }> }) {
  const generatedId = useId()
  const id = children.props.id ?? generatedId
  return <div className="min-w-0 text-xs font-semibold text-[var(--foreground)]"><label htmlFor={id} className="block">{label}</label><div className="mt-1.5">{cloneElement(children, { id })}</div></div>
}
