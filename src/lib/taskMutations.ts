import type { ProjectTask } from '@/types/database'
import { labelBelongsToTask, parseTaskSharedMetadata, scopeTaskSharedMetadata, taskScopedLabelId } from '@/lib/taskMetadata'
import {
  type ActivityEvent,
  type ActivityEventType,
  type Checklist,
  type ChecklistItem,
  type ChecklistProgress,
  type DependencyRelation,
  type LabelColor,
  type TaskAttachment,
  type TaskComment,
  type TaskCover,
  type TaskDependency,
  type TaskDetails,
  type TaskEstimate,
  type TaskLabel,
  type TaskMutationContext,
  type TaskMutationResult,
  type TaskPriority,
  type TaskReminder,
  type TaskStatus,
  type TaskStoreState,
  type TaskSharedMetadata,
} from '@/types/task'

const VALID_STATUSES = new Set<TaskStatus>(['backlog', 'todo', 'in_progress', 'in_review', 'done'])
const VALID_PRIORITIES = new Set<TaskPriority>(['urgent', 'high', 'medium', 'low'])
const VALID_LABEL_COLORS = new Set<LabelColor>(['slate', 'rose', 'orange', 'amber', 'emerald', 'sky', 'blue', 'violet', 'pink'])
const VALID_COVER_COLORS = new Set(['slate', 'indigo', 'blue', 'teal', 'emerald', 'amber', 'rose', 'plum'])
const VALID_COVER_GRADIENTS = new Set(['midnight', 'ocean', 'aurora', 'sunrise', 'berry', 'slate-sky'])
const POINT_ESTIMATES = new Set([1, 2, 3, 5, 8, 13])
const TITLE_LIMIT = 240
const COMMENT_LIMIT = 10_000
let fallbackIdCounter = 0

export class TaskDomainError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'not_found'
      | 'invalid_input'
      | 'permission_denied'
      | 'duplicate'
      | 'dependency_cycle'
      | 'conflict',
  ) {
    super(message)
    this.name = 'TaskDomainError'
  }
}

export type TaskMutation =
  | { type: 'seed_task'; task: TaskDetails }
  | { type: 'hydrate_shared_metadata'; taskId: string; metadata?: TaskSharedMetadata; assigneeIds?: string[] }
  | { type: 'seed_comments'; taskId: string; comments: TaskComment[] }
  | { type: 'rollback_shared_task'; taskId: string; snapshot: TaskDetails; expectedVersion: number; activityId?: string }
  | { type: 'update_title'; taskId: string; title: string }
  | { type: 'update_description'; taskId: string; description: string }
  | { type: 'set_cover'; taskId: string; cover?: TaskCover }
  | { type: 'update_status'; taskId: string; status: TaskStatus; columnId?: string }
  | { type: 'update_priority'; taskId: string; priority: TaskPriority }
  | { type: 'set_dates'; taskId: string; startDate?: string; dueDate?: string; reminder?: TaskReminder }
  | { type: 'set_estimate'; taskId: string; estimate?: TaskEstimate }
  | { type: 'assign_member'; taskId: string; memberId: string }
  | { type: 'unassign_member'; taskId: string; memberId: string }
  | { type: 'create_label'; taskId: string; name: string; color: LabelColor }
  | { type: 'update_label'; taskId: string; labelId: string; patch: { name?: string; color?: LabelColor } }
  | { type: 'delete_label'; taskId: string; labelId: string }
  | { type: 'add_label'; taskId: string; labelId: string }
  | { type: 'remove_label'; taskId: string; labelId: string }
  | { type: 'add_checklist'; taskId: string; title: string }
  | { type: 'rename_checklist'; taskId: string; checklistId: string; title: string }
  | { type: 'delete_checklist'; taskId: string; checklistId: string }
  | { type: 'toggle_checklist_visibility'; taskId: string; checklistId: string }
  | { type: 'reorder_checklists'; taskId: string; orderedIds: string[] }
  | { type: 'add_checklist_item'; taskId: string; checklistId: string; text: string }
  | { type: 'update_checklist_item'; taskId: string; checklistId: string; itemId: string; patch: { text?: string; completed?: boolean; assigneeId?: string | null; dueDate?: string | null } }
  | { type: 'toggle_checklist_item'; taskId: string; checklistId: string; itemId: string }
  | { type: 'delete_checklist_item'; taskId: string; checklistId: string; itemId: string }
  | { type: 'reorder_checklist_items'; taskId: string; checklistId: string; orderedIds: string[] }
  | { type: 'add_comment'; taskId: string; body: string; parentCommentId?: string; mentionIds?: string[]; attachmentIds?: string[]; commentId?: string; authorId?: string; createdAt?: string }
  | { type: 'update_comment'; commentId: string; body: string }
  | { type: 'delete_comment'; commentId: string }
  | { type: 'toggle_reaction'; commentId: string; emoji: string; userId?: string }
  | { type: 'add_dependency'; taskId: string; targetTaskId: string; relation: DependencyRelation }
  | { type: 'remove_dependency'; taskId: string; dependencyId: string }
  | { type: 'add_attachment'; taskId: string; attachment: Omit<TaskAttachment, 'taskId' | 'createdAt'> & { createdAt?: string } }
  | { type: 'remove_attachment'; taskId: string; attachmentId: string }
  | { type: 'toggle_watch'; taskId: string; userId?: string }
  | { type: 'duplicate_task'; taskId: string; newTaskId?: string; title?: string; includeChecklists?: boolean; includeDependencies?: boolean }
  | { type: 'move_task'; taskId: string; boardId: string; projectId: string; columnId: string; status: TaskStatus }
  | { type: 'set_parent'; taskId: string; parentTaskId?: string }
  | { type: 'archive_task'; taskId: string }
  | { type: 'restore_task'; taskId: string }
  | { type: 'delete_task'; taskId: string }
  | { type: 'restore_from_trash'; trashId: string }
  | { type: 'permanently_delete'; trashId: string }

export interface ProjectTaskHydrationOptions {
  status?: TaskStatus
  columnName?: string
  taskKey?: string
  projectId?: string
  now?: string
}

function stableId(kind: Parameters<NonNullable<TaskMutationContext['idFactory']>>[0], context?: TaskMutationContext): string {
  if (context?.idFactory) return context.idFactory(kind)
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${kind}-${crypto.randomUUID()}`
  fallbackIdCounter += 1
  return `${kind}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`
}

function timestamp(context: TaskMutationContext): string {
  const value = context.now?.() ?? new Date().toISOString()
  if (Number.isNaN(Date.parse(value))) throw new TaskDomainError('Mutation timestamp must be a valid ISO date.', 'invalid_input')
  return value
}

function requireTask(state: TaskStoreState, taskId: string): TaskDetails {
  const task = state.tasks[taskId]
  if (!task) throw new TaskDomainError('Task was not found.', 'not_found')
  return task
}

function requireNonEmpty(value: string, field: string, max = TITLE_LIMIT): string {
  const normalized = value.trim()
  if (!normalized) throw new TaskDomainError(`${field} cannot be empty.`, 'invalid_input')
  if (normalized.length > max) throw new TaskDomainError(`${field} cannot exceed ${max} characters.`, 'invalid_input')
  return normalized
}

function dateOnly(value: string | undefined, field: string): string | undefined {
  if (value === undefined || value === '') return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TaskDomainError(`${field} must use YYYY-MM-DD format.`, 'invalid_input')
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new TaskDomainError(`${field} is not a valid calendar date.`, 'invalid_input')
  }
  return value
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function sameArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function event(
  context: TaskMutationContext,
  taskId: string,
  type: ActivityEventType,
  at: string,
  previousValue?: unknown,
  newValue?: unknown,
  metadata?: Record<string, unknown>,
): ActivityEvent {
  return {
    id: stableId('activity', context),
    taskId,
    actorId: context.actorId,
    type,
    timestamp: at,
    previousValue,
    newValue,
    metadata,
  }
}

function commit(
  state: TaskStoreState,
  task: TaskDetails,
  context: TaskMutationContext,
  at: string,
  activity: ActivityEvent,
  changes: Partial<Pick<TaskStoreState, 'tasks' | 'comments' | 'attachments' | 'dependencies' | 'labels' | 'activity' | 'trash'>> = {},
  result: Partial<Pick<TaskMutationResult, 'taskId' | 'entityId'>> = {},
): TaskMutationResult {
  const tasks = changes.tasks ?? state.tasks
  const nextTask = { ...task, updatedAt: at, version: task.version + 1 }
  const nextTasks = { ...tasks, [task.id]: nextTask }
  const activityMap = { ...(changes.activity ?? state.activity), [activity.id]: activity }
  return {
    changed: true,
    taskId: result.taskId ?? task.id,
    entityId: result.entityId,
    activityId: activity.id,
    state: {
      ...state,
      ...changes,
      tasks: nextTasks,
      activity: activityMap,
      revision: state.revision + 1,
      updatedAt: at,
    },
  }
}

function unchanged(state: TaskStoreState, taskId?: string): TaskMutationResult {
  return { state, changed: false, taskId }
}

function findChecklist(task: TaskDetails, checklistId: string): { checklist: Checklist; index: number } {
  const index = task.checklists.findIndex((item) => item.id === checklistId)
  if (index < 0) throw new TaskDomainError('Checklist was not found.', 'not_found')
  return { checklist: task.checklists[index], index }
}

function replaceChecklist(task: TaskDetails, index: number, checklist: Checklist): TaskDetails {
  return { ...task, checklists: task.checklists.map((item, itemIndex) => itemIndex === index ? checklist : item) }
}

function findChecklistItem(checklist: Checklist, itemId: string): { item: ChecklistItem; index: number } {
  const index = checklist.items.findIndex((item) => item.id === itemId)
  if (index < 0) throw new TaskDomainError('Checklist item was not found.', 'not_found')
  return { item: checklist.items[index], index }
}

function assertExactOrder(currentIds: string[], orderedIds: string[], label: string) {
  if (orderedIds.length !== currentIds.length || new Set(orderedIds).size !== orderedIds.length || currentIds.some((id) => !orderedIds.includes(id))) {
    throw new TaskDomainError(`${label} order must contain every existing ID exactly once.`, 'invalid_input')
  }
}

function inferStatus(columnName?: string): TaskStatus {
  const normalized = columnName?.toLowerCase().trim().replace(/[\s-]+/g, '_')
  if (normalized === 'backlog') return 'backlog'
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') return 'done'
  if (normalized === 'review' || normalized === 'in_review') return 'in_review'
  if (normalized === 'in_progress' || normalized === 'doing') return 'in_progress'
  return 'todo'
}

function normalizeSeedDate(value?: string | null): string | undefined {
  if (!value) return undefined
  const candidate = value.slice(0, 10)
  try {
    return dateOnly(candidate, 'Date')
  } catch {
    return undefined
  }
}

/** Convert the existing board entity without regenerating its stable task ID. */
export function taskDetailsFromProjectTask(task: ProjectTask, options: ProjectTaskHydrationOptions = {}): TaskDetails {
  const createdAt = !Number.isNaN(Date.parse(task.created_at)) ? task.created_at : options.now ?? new Date().toISOString()
  const metadata = parseTaskSharedMetadata(task.task_metadata)
  return {
    id: task.id,
    key: options.taskKey ?? `TASK-${task.id.slice(0, 8).toUpperCase()}`,
    projectId: options.projectId ?? task.board_id,
    boardId: task.board_id,
    columnId: task.column_id,
    title: task.title.trim() || 'Untitled task',
    description: task.description ?? '',
    status: options.status ?? inferStatus(options.columnName),
    priority: task.priority,
    assigneeIds: task.assignee_ids?.length ? Array.from(new Set(task.assignee_ids)) : task.assignee_id ? [task.assignee_id] : [],
    // The shared metadata hydration imports label records and their references atomically.
    labelIds: [],
    estimate: typeof task.estimated_hours === 'number' && task.estimated_hours >= 0
      ? { value: task.estimated_hours, unit: 'hours' }
      : undefined,
    startDate: normalizeSeedDate(task.start_date),
    dueDate: normalizeSeedDate(task.due_date),
    dependencyIds: [],
    checklists: metadata?.checklists ?? [],
    attachmentIds: [],
    commentIds: [],
    watcherIds: [],
    archivedAt: task.archived_at ?? undefined,
    createdBy: task.created_by ?? undefined,
    createdAt,
    updatedAt: createdAt,
    version: Math.max(1, task.version ?? 1),
  }
}

function hasBlockingPath(state: TaskStoreState, from: string, to: string): boolean {
  const edges = new Map<string, string[]>()
  Object.values(state.dependencies).forEach((dependency) => {
    if (dependency.relation === 'relates_to') return
    const source = dependency.relation === 'blocks' ? dependency.taskId : dependency.targetTaskId
    const target = dependency.relation === 'blocks' ? dependency.targetTaskId : dependency.taskId
    edges.set(source, [...(edges.get(source) ?? []), target])
  })
  const seen = new Set<string>()
  const stack = [from]
  while (stack.length) {
    const current = stack.pop()!
    if (current === to) return true
    if (seen.has(current)) continue
    seen.add(current)
    stack.push(...(edges.get(current) ?? []))
  }
  return false
}

function dependencyDirection(taskId: string, targetTaskId: string, relation: DependencyRelation): [string, string] | null {
  if (relation === 'relates_to') return null
  return relation === 'blocks' ? [taskId, targetTaskId] : [targetTaskId, taskId]
}

function createsParentCycle(state: TaskStoreState, taskId: string, parentTaskId: string): boolean {
  let current: string | undefined = parentTaskId
  const seen = new Set<string>()
  while (current) {
    if (current === taskId) return true
    if (seen.has(current)) return true
    seen.add(current)
    current = state.tasks[current]?.parentTaskId
  }
  return false
}

export function getChecklistProgress(checklist: Pick<Checklist, 'items'>): ChecklistProgress {
  const total = checklist.items.length
  const completed = checklist.items.filter((item) => item.completed).length
  return { completed, total, percentage: total > 0 ? Math.round((completed / total) * 100) : 0 }
}

export function getTaskChecklistProgress(task: Pick<TaskDetails, 'checklists'>): ChecklistProgress {
  return getChecklistProgress({ items: task.checklists.flatMap((checklist) => checklist.items) })
}

export function applyTaskMutation(state: TaskStoreState, mutation: TaskMutation, context: TaskMutationContext): TaskMutationResult {
  if (!context.actorId.trim()) throw new TaskDomainError('An actor ID is required for task changes.', 'invalid_input')

  if (mutation.type === 'seed_task') {
    const existing=state.tasks[mutation.task.id]
    if (existing) {
      // Supabase remains authoritative for fields shared with the project board.
      // Rich workspace-only data (cover, labels, checklists, relationships,
      // comments, attachments and watchers) stays in the local persistence
      // adapter. Re-seeding therefore acts as a narrow reconciliation step
      // instead of replacing the normalized task record.
      const reconciled:TaskDetails={
        ...existing,
        projectId:mutation.task.projectId,
        boardId:mutation.task.boardId,
        columnId:mutation.task.columnId,
        title:mutation.task.title,
        description:mutation.task.description,
        status:mutation.task.status,
        priority:mutation.task.priority,
        // The existing backend exposes one primary assignee and hour estimates.
        // Preserve richer local-only members/story points while still accepting
        // a changed backend primary assignee or a concrete hour estimate.
        assigneeIds:mutation.task.assigneeIds.length
          ? unique([...mutation.task.assigneeIds,...existing.assigneeIds])
          : existing.assigneeIds,
        estimate:mutation.task.estimate ?? (existing.estimate?.unit==='points'?existing.estimate:undefined),
        startDate:mutation.task.startDate,
        dueDate:mutation.task.dueDate,
        archivedAt:mutation.task.archivedAt,
        createdBy:mutation.task.createdBy,
      }
      const sharedFieldsMatch=
        existing.projectId===reconciled.projectId &&
        existing.boardId===reconciled.boardId &&
        existing.columnId===reconciled.columnId &&
        existing.title===reconciled.title &&
        existing.description===reconciled.description &&
        existing.status===reconciled.status &&
        existing.priority===reconciled.priority &&
        existing.assigneeIds.length===reconciled.assigneeIds.length &&
        existing.assigneeIds.every((id,index) => id===reconciled.assigneeIds[index]) &&
        JSON.stringify(existing.estimate)===JSON.stringify(reconciled.estimate) &&
        existing.startDate===reconciled.startDate &&
        existing.dueDate===reconciled.dueDate &&
        existing.archivedAt===reconciled.archivedAt &&
        existing.createdBy===reconciled.createdBy
      if (sharedFieldsMatch) return unchanged(state, mutation.task.id)
      const at=timestamp(context)
      reconciled.updatedAt=at
      reconciled.version=Math.max(existing.version+1,mutation.task.version)
      return {
        changed:true,
        taskId:mutation.task.id,
        state:{
          ...state,
          tasks:{...state.tasks,[mutation.task.id]:reconciled},
          revision:state.revision+1,
          updatedAt:at,
        },
      }
    }
    const at = timestamp(context)
    return {
      changed: true,
      taskId: mutation.task.id,
      state: {
        ...state,
        tasks: { ...state.tasks, [mutation.task.id]: mutation.task },
        revision: state.revision + 1,
        updatedAt: at,
      },
    }
  }

  if (mutation.type === 'hydrate_shared_metadata') {
    const task = requireTask(state, mutation.taskId)
    const incoming = mutation.metadata ? scopeTaskSharedMetadata(task.id, mutation.metadata) : undefined
    const next = {
      ...task,
      ...(incoming ? { labelIds: incoming.labels.map(label => label.id), checklists: incoming.checklists } : {}),
      ...(mutation.assigneeIds !== undefined ? { assigneeIds: unique(mutation.assigneeIds) } : {}),
    }
    const labels = incoming ? { ...state.labels, ...Object.fromEntries(incoming.labels.map(label => [label.id, label])) } : state.labels
    if (JSON.stringify(task.labelIds) === JSON.stringify(next.labelIds) && JSON.stringify(task.checklists) === JSON.stringify(next.checklists)
      && JSON.stringify(task.assigneeIds) === JSON.stringify(next.assigneeIds)
      && (!incoming || incoming.labels.every(label => JSON.stringify(state.labels[label.id]) === JSON.stringify(label)))) return unchanged(state, task.id)
    const at = timestamp(context)
    return {
      changed: true, taskId: task.id,
      state: { ...state, tasks: { ...state.tasks, [task.id]: { ...next, updatedAt: at, version: task.version + 1 } }, labels, revision: state.revision + 1, updatedAt: at },
    }
  }

  if (mutation.type === 'seed_comments') {
    const task = requireTask(state, mutation.taskId)
    const incoming = mutation.comments.filter((comment) => !state.comments[comment.id])
    if (!incoming.length) return unchanged(state, task.id)
    incoming.forEach((comment) => {
      if (comment.taskId !== task.id || !comment.id.trim() || !comment.authorId.trim()) throw new TaskDomainError('Imported comment metadata is invalid.', 'invalid_input')
      if (!comment.deletedAt && !comment.body.trim()) throw new TaskDomainError('Imported comments cannot be empty.', 'invalid_input')
      if (Number.isNaN(Date.parse(comment.createdAt))) throw new TaskDomainError('Imported comment timestamp is invalid.', 'invalid_input')
      if (comment.parentCommentId && !state.comments[comment.parentCommentId] && !incoming.some((candidate) => candidate.id === comment.parentCommentId)) throw new TaskDomainError('Imported reply parent was not found.', 'not_found')
    })
    const at = timestamp(context)
    const comments = { ...state.comments, ...Object.fromEntries(incoming.map((comment) => [comment.id, comment])) }
    const commentIds = unique([...task.commentIds,...incoming.map((comment) => comment.id)])
    return {
      changed: true,
      taskId: task.id,
      state: {
        ...state,
        tasks: { ...state.tasks, [task.id]: { ...task, commentIds } },
        comments,
        revision: state.revision + 1,
        updatedAt: at,
      },
    }
  }

  if (mutation.type === 'rollback_shared_task') {
    const task=requireTask(state,mutation.taskId)
    if (mutation.snapshot.id!==task.id) throw new TaskDomainError('Rollback snapshot does not match the task.','invalid_input')
    const alreadyRestored=task.projectId===mutation.snapshot.projectId&&task.boardId===mutation.snapshot.boardId&&task.columnId===mutation.snapshot.columnId&&task.title===mutation.snapshot.title&&task.description===mutation.snapshot.description&&task.status===mutation.snapshot.status&&task.priority===mutation.snapshot.priority&&JSON.stringify(task.assigneeIds)===JSON.stringify(mutation.snapshot.assigneeIds)&&JSON.stringify(task.estimate)===JSON.stringify(mutation.snapshot.estimate)&&task.startDate===mutation.snapshot.startDate&&task.dueDate===mutation.snapshot.dueDate&&JSON.stringify(task.reminder)===JSON.stringify(mutation.snapshot.reminder)&&task.archivedAt===mutation.snapshot.archivedAt
    if (task.version!==mutation.expectedVersion&&!alreadyRestored) throw new TaskDomainError('The task changed again before it could be rolled back.','conflict')
    const at=timestamp(context)
    const startDate=dateOnly(mutation.snapshot.startDate,'Start date')
    const dueDate=dateOnly(mutation.snapshot.dueDate,'Due date')
    if (startDate&&dueDate&&dueDate<startDate) throw new TaskDomainError('Due date cannot be before the start date.','invalid_input')
    if (!VALID_STATUSES.has(mutation.snapshot.status)||!VALID_PRIORITIES.has(mutation.snapshot.priority)) throw new TaskDomainError('Rollback snapshot contains invalid workflow data.','invalid_input')
    const restored:TaskDetails={
      ...task,
      projectId:mutation.snapshot.projectId,
      boardId:mutation.snapshot.boardId,
      columnId:mutation.snapshot.columnId,
      title:requireNonEmpty(mutation.snapshot.title,'Task title'),
      description:mutation.snapshot.description,
      status:mutation.snapshot.status,
      priority:mutation.snapshot.priority,
      assigneeIds:unique(mutation.snapshot.assigneeIds),
      estimate:mutation.snapshot.estimate,
      startDate,
      dueDate,
      reminder:mutation.snapshot.reminder,
      archivedAt:mutation.snapshot.archivedAt,
      createdBy:mutation.snapshot.createdBy,
      updatedAt:at,
      version:task.version+1,
    }
    const activity={...state.activity}
    if (mutation.activityId&&activity[mutation.activityId]?.taskId===task.id) delete activity[mutation.activityId]
    return {
      changed:true,
      taskId:task.id,
      state:{...state,tasks:{...state.tasks,[task.id]:restored},activity,revision:state.revision+1,updatedAt:at},
    }
  }

  if (mutation.type === 'restore_from_trash') {
    const entry = state.trash[mutation.trashId]
    if (!entry) throw new TaskDomainError('Trash entry was not found.', 'not_found')
    if (state.tasks[entry.task.id]) throw new TaskDomainError('A task with this ID already exists.', 'conflict')
    const at = timestamp(context)
    const dependencies = entry.dependencies.filter((item) => {
      const otherId = item.taskId === entry.task.id ? item.targetTaskId : item.taskId
      return otherId === entry.task.id || Boolean(state.tasks[otherId])
    })
    const dependencyIds = dependencies.map((item) => item.id)
    const restoredTask = { ...entry.task, dependencyIds, archivedAt: undefined, updatedAt: at, version: entry.task.version + 1 }
    const restoredEvent = event(context, restoredTask.id, 'task_restored', at, { trashId: mutation.trashId }, { restored: true })
    const tasks = { ...state.tasks, [restoredTask.id]: restoredTask }
    for (const dependency of dependencies) {
      const otherId = dependency.taskId === restoredTask.id ? dependency.targetTaskId : dependency.taskId
      const other = tasks[otherId]
      if (other && !other.dependencyIds.includes(dependency.id)) {
        tasks[otherId] = { ...other, dependencyIds: [...other.dependencyIds, dependency.id], updatedAt: at, version: other.version + 1 }
      }
    }
    const trash = { ...state.trash }
    delete trash[mutation.trashId]
    return {
      changed: true,
      taskId: restoredTask.id,
      entityId: mutation.trashId,
      activityId: restoredEvent.id,
      state: {
        ...state,
        tasks,
        comments: { ...state.comments, ...Object.fromEntries(entry.comments.map((item) => [item.id, item])) },
        attachments: { ...state.attachments, ...Object.fromEntries(entry.attachments.map((item) => [item.id, item])) },
        dependencies: { ...state.dependencies, ...Object.fromEntries(dependencies.map((item) => [item.id, item])) },
        activity: { ...state.activity, ...Object.fromEntries(entry.activity.map((item) => [item.id, item])), [restoredEvent.id]: restoredEvent },
        trash,
        revision: state.revision + 1,
        updatedAt: at,
      },
    }
  }

  if (mutation.type === 'permanently_delete') {
    if (!state.trash[mutation.trashId]) throw new TaskDomainError('Trash entry was not found.', 'not_found')
    const trash = { ...state.trash }
    delete trash[mutation.trashId]
    return { changed: true, entityId: mutation.trashId, state: { ...state, trash, revision: state.revision + 1, updatedAt: timestamp(context) } }
  }

  if (mutation.type === 'update_comment' || mutation.type === 'delete_comment' || mutation.type === 'toggle_reaction') {
    const comment = state.comments[mutation.commentId]
    if (!comment) throw new TaskDomainError('Comment was not found.', 'not_found')
    const task = requireTask(state, comment.taskId)
    const at = timestamp(context)

    if (mutation.type === 'update_comment') {
      if (comment.deletedAt) throw new TaskDomainError('Deleted comments cannot be edited.', 'invalid_input')
      if (comment.authorId !== context.actorId && !context.canManageAllComments) throw new TaskDomainError('You can only edit your own comments.', 'permission_denied')
      const body = requireNonEmpty(mutation.body, 'Comment', COMMENT_LIMIT)
      if (body === comment.body) return unchanged(state, task.id)
      const updated = { ...comment, body, updatedAt: at }
      return commit(state, task, context, at, event(context, task.id, 'comment_updated', at, comment.body, body, { commentId: comment.id }), {
        comments: { ...state.comments, [comment.id]: updated },
      }, { entityId: comment.id })
    }

    if (mutation.type === 'delete_comment') {
      if (comment.deletedAt) return unchanged(state, task.id)
      if (comment.authorId !== context.actorId && !context.canManageAllComments) throw new TaskDomainError('You can only delete your own comments.', 'permission_denied')
      const deleted = { ...comment, body: '', reactions: {}, deletedAt: at, updatedAt: at }
      return commit(state, task, context, at, event(context, task.id, 'comment_removed', at, { commentId: comment.id }, { deleted: true }), {
        comments: { ...state.comments, [comment.id]: deleted },
      }, { entityId: comment.id })
    }

    if (comment.deletedAt) throw new TaskDomainError('Deleted comments cannot receive reactions.', 'invalid_input')
    const emoji = requireNonEmpty(mutation.emoji, 'Reaction', 32)
    const userId = mutation.userId?.trim() || context.actorId
    const currentUsers = comment.reactions[emoji] ?? []
    const isRemoving = currentUsers.includes(userId)
    const nextUsers = isRemoving ? currentUsers.filter((id) => id !== userId) : [...currentUsers, userId]
    const reactions = { ...comment.reactions }
    if (nextUsers.length) reactions[emoji] = nextUsers
    else delete reactions[emoji]
    return commit(state, task, context, at, event(context, task.id, isRemoving ? 'reaction_removed' : 'reaction_added', at, undefined, emoji, { commentId: comment.id, userId }), {
      comments: { ...state.comments, [comment.id]: { ...comment, reactions, updatedAt: at } },
    }, { entityId: comment.id })
  }

  const task = requireTask(state, mutation.taskId)
  const at = timestamp(context)

  switch (mutation.type) {
    case 'update_title': {
      const title = requireNonEmpty(mutation.title, 'Task title')
      if (title === task.title) return unchanged(state, task.id)
      return commit(state, { ...task, title }, context, at, event(context, task.id, 'title_changed', at, task.title, title))
    }
    case 'update_description': {
      if (mutation.description === task.description) return unchanged(state, task.id)
      return commit(state, { ...task, description: mutation.description }, context, at, event(context, task.id, 'description_changed', at, task.description, mutation.description))
    }
    case 'set_cover': {
      const cover = mutation.cover
      if (cover?.type === 'color' && !VALID_COVER_COLORS.has(cover.value)) throw new TaskDomainError('Cover color is not supported.', 'invalid_input')
      if (cover?.type === 'gradient' && !VALID_COVER_GRADIENTS.has(cover.value)) throw new TaskDomainError('Cover gradient is not supported.', 'invalid_input')
      if (cover?.type === 'image') {
        if (!cover.value.trim() || cover.value.length > 512) throw new TaskDomainError('Cover image storage key is invalid.', 'invalid_input')
        if (!['image/avif', 'image/jpeg', 'image/png', 'image/webp'].includes(cover.mimeType)) throw new TaskDomainError('Cover image type is not supported.', 'invalid_input')
        if (!Number.isInteger(cover.width) || !Number.isInteger(cover.height) || cover.width <= 0 || cover.height <= 0) throw new TaskDomainError('Cover image dimensions are invalid.', 'invalid_input')
        if (!Number.isFinite(cover.positionY) || cover.positionY < 0 || cover.positionY > 100) throw new TaskDomainError('Cover image position must be between 0 and 100.', 'invalid_input')
      }
      if (JSON.stringify(task.cover) === JSON.stringify(cover)) return unchanged(state, task.id)
      const action = cover ? (task.cover ? 'replaced' : 'added') : 'removed'
      return commit(
        state,
        { ...task, cover },
        context,
        at,
        event(context, task.id, 'cover_changed', at, task.cover, cover, {
          action,
          previousType: task.cover?.type ?? 'none',
          nextType: cover?.type ?? 'none',
        }),
      )
    }
    case 'update_status': {
      if (!VALID_STATUSES.has(mutation.status)) throw new TaskDomainError('Unsupported task status.', 'invalid_input')
      const columnId = mutation.columnId ?? task.columnId
      if (task.status === mutation.status && task.columnId === columnId) return unchanged(state, task.id)
      return commit(state, { ...task, status: mutation.status, columnId }, context, at, event(context, task.id, 'status_changed', at, task.status, mutation.status, { previousColumnId: task.columnId, columnId }))
    }
    case 'update_priority': {
      if (!VALID_PRIORITIES.has(mutation.priority)) throw new TaskDomainError('Unsupported task priority.', 'invalid_input')
      if (task.priority === mutation.priority) return unchanged(state, task.id)
      return commit(state, { ...task, priority: mutation.priority }, context, at, event(context, task.id, 'priority_changed', at, task.priority, mutation.priority))
    }
    case 'set_dates': {
      const startDate = dateOnly(mutation.startDate, 'Start date')
      const dueDate = dateOnly(mutation.dueDate, 'Due date')
      if (startDate && dueDate && dueDate < startDate) throw new TaskDomainError('Due date cannot be before the start date.', 'invalid_input')
      if (mutation.reminder && (!Number.isInteger(mutation.reminder.offsetMinutes) || mutation.reminder.offsetMinutes < 0)) {
        throw new TaskDomainError('Reminder offset must be a non-negative number of minutes.', 'invalid_input')
      }
      const previous = { startDate: task.startDate, dueDate: task.dueDate, reminder: task.reminder }
      const next = { startDate, dueDate, reminder: dueDate ? mutation.reminder : undefined }
      if (JSON.stringify(previous) === JSON.stringify(next)) return unchanged(state, task.id)
      return commit(state, { ...task, ...next }, context, at, event(context, task.id, 'dates_changed', at, previous, next))
    }
    case 'set_estimate': {
      const estimate = mutation.estimate
      if (estimate) {
        if (!Number.isFinite(estimate.value) || estimate.value < 0) throw new TaskDomainError('Estimate cannot be negative.', 'invalid_input')
        if (estimate.unit === 'points' && !POINT_ESTIMATES.has(estimate.value)) throw new TaskDomainError('Story points must be 1, 2, 3, 5, 8, or 13.', 'invalid_input')
        if (estimate.unit === 'hours' && estimate.value > 10_000) throw new TaskDomainError('Hour estimate is too large.', 'invalid_input')
      }
      if (JSON.stringify(task.estimate) === JSON.stringify(estimate)) return unchanged(state, task.id)
      return commit(state, { ...task, estimate }, context, at, event(context, task.id, 'estimate_changed', at, task.estimate, estimate))
    }
    case 'assign_member': {
      const memberId = requireNonEmpty(mutation.memberId, 'Member ID')
      if (task.assigneeIds.includes(memberId)) return unchanged(state, task.id)
      return commit(state, { ...task, assigneeIds: [...task.assigneeIds, memberId] }, context, at, event(context, task.id, 'assignee_added', at, undefined, memberId))
    }
    case 'unassign_member': {
      if (!task.assigneeIds.includes(mutation.memberId)) return unchanged(state, task.id)
      return commit(state, { ...task, assigneeIds: task.assigneeIds.filter((id) => id !== mutation.memberId) }, context, at, event(context, task.id, 'assignee_removed', at, mutation.memberId, undefined))
    }
    case 'create_label': {
      const name = requireNonEmpty(mutation.name, 'Label name', 80)
      if (!VALID_LABEL_COLORS.has(mutation.color)) throw new TaskDomainError('Unsupported label color.', 'invalid_input')
      if (Object.values(state.labels).some(label => (task.labelIds.includes(label.id) || labelBelongsToTask(task.id, label.id)) && label.name.toLowerCase() === name.toLowerCase())) throw new TaskDomainError('A label with this name already exists.', 'duplicate')
      const label: TaskLabel = { id: taskScopedLabelId(task.id, stableId('label', context)), name, color: mutation.color, createdAt: at, updatedAt: at }
      return commit(state, { ...task, labelIds: [...task.labelIds, label.id] }, context, at, event(context, task.id, 'label_created', at, undefined, label, { labelId: label.id }), {
        labels: { ...state.labels, [label.id]: label },
      }, { entityId: label.id })
    }
    case 'update_label': {
      const label = state.labels[mutation.labelId]
      if (!label) throw new TaskDomainError('Label was not found.', 'not_found')
      if (!task.labelIds.includes(label.id) && !labelBelongsToTask(task.id, label.id)) throw new TaskDomainError('This label belongs to another task.', 'permission_denied')
      const scopedId = taskScopedLabelId(task.id, label.id)
      const name = mutation.patch.name === undefined ? label.name : requireNonEmpty(mutation.patch.name, 'Label name', 80)
      const color = mutation.patch.color ?? label.color
      if (!VALID_LABEL_COLORS.has(color)) throw new TaskDomainError('Unsupported label color.', 'invalid_input')
      if (Object.values(state.labels).some(item => item.id !== label.id && item.id !== scopedId && (task.labelIds.includes(item.id) || labelBelongsToTask(task.id, item.id)) && item.name.toLowerCase() === name.toLowerCase())) throw new TaskDomainError('A label with this name already exists.', 'duplicate')
      if (name === label.name && color === label.color) return unchanged(state, task.id)
      const updated = { ...label, id: scopedId, name, color, updatedAt: at }
      const next = { ...task, labelIds: task.labelIds.map(id => id === label.id ? scopedId : id) }
      return commit(state, next, context, at, event(context, task.id, 'label_updated', at, label, updated, { labelId: scopedId }), {
        labels: { ...state.labels, [scopedId]: updated },
      }, { entityId: scopedId })
    }
    case 'delete_label': {
      const label = state.labels[mutation.labelId]
      if (!label) throw new TaskDomainError('Label was not found.', 'not_found')
      if (!task.labelIds.includes(label.id) && !labelBelongsToTask(task.id, label.id)) throw new TaskDomainError('This label belongs to another task.', 'permission_denied')
      const labels = { ...state.labels }
      if (!Object.values(state.tasks).some(item => item.id !== task.id && item.labelIds.includes(label.id))) delete labels[label.id]
      return commit(state, { ...task, labelIds: task.labelIds.filter(id => id !== label.id) }, context, at, event(context, task.id, 'label_deleted', at, label, undefined, { labelId: label.id }), { labels }, { entityId: label.id })
    }
    case 'add_label': {
      const label = state.labels[mutation.labelId]
      if (!label) throw new TaskDomainError('Label was not found.', 'not_found')
      if (task.labelIds.some(id => state.labels[id]?.name.toLowerCase() === label.name.toLowerCase())) return unchanged(state, task.id)
      let scopedId = taskScopedLabelId(task.id, label.id)
      if (state.labels[scopedId] && state.labels[scopedId].name.toLowerCase() !== label.name.toLowerCase()) scopedId = taskScopedLabelId(task.id, stableId('label', context))
      return commit(state, { ...task, labelIds: [...task.labelIds, scopedId] }, context, at, event(context, task.id, 'label_added', at, undefined, scopedId), {
        labels: { ...state.labels, [scopedId]: { ...label, id: scopedId } },
      })
    }
    case 'remove_label': {
      if (!task.labelIds.includes(mutation.labelId)) return unchanged(state, task.id)
      return commit(state, { ...task, labelIds: task.labelIds.filter((id) => id !== mutation.labelId) }, context, at, event(context, task.id, 'label_removed', at, mutation.labelId, undefined))
    }
    case 'add_checklist': {
      const title = requireNonEmpty(mutation.title, 'Checklist title', 160)
      const checklist: Checklist = { id: stableId('checklist', context), title, items: [], hideCompleted: false, order: task.checklists.length, createdAt: at, updatedAt: at }
      return commit(state, { ...task, checklists: [...task.checklists, checklist] }, context, at, event(context, task.id, 'checklist_created', at, undefined, title, { checklistId: checklist.id }), {}, { entityId: checklist.id })
    }
    case 'rename_checklist': {
      const { checklist, index } = findChecklist(task, mutation.checklistId)
      const title = requireNonEmpty(mutation.title, 'Checklist title', 160)
      if (title === checklist.title) return unchanged(state, task.id)
      const next = { ...checklist, title, updatedAt: at }
      return commit(state, replaceChecklist(task, index, next), context, at, event(context, task.id, 'checklist_renamed', at, checklist.title, title, { checklistId: checklist.id }))
    }
    case 'delete_checklist': {
      const { checklist } = findChecklist(task, mutation.checklistId)
      const checklists = task.checklists.filter((item) => item.id !== checklist.id).map((item, index) => ({ ...item, order: index }))
      return commit(state, { ...task, checklists }, context, at, event(context, task.id, 'checklist_removed', at, checklist.title, undefined, { checklistId: checklist.id }))
    }
    case 'toggle_checklist_visibility': {
      const { checklist, index } = findChecklist(task, mutation.checklistId)
      const next = { ...checklist, hideCompleted: !checklist.hideCompleted, updatedAt: at }
      return commit(state, replaceChecklist(task, index, next), context, at, event(context, task.id, 'checklist_visibility_changed', at, checklist.hideCompleted, next.hideCompleted, { checklistId: checklist.id }))
    }
    case 'reorder_checklists': {
      const current = task.checklists.map((item) => item.id)
      assertExactOrder(current, mutation.orderedIds, 'Checklist')
      if (sameArray(current, mutation.orderedIds)) return unchanged(state, task.id)
      const map = new Map(task.checklists.map((item) => [item.id, item]))
      const checklists = mutation.orderedIds.map((id, order) => ({ ...map.get(id)!, order, updatedAt: at }))
      return commit(state, { ...task, checklists }, context, at, event(context, task.id, 'checklist_reordered', at, current, mutation.orderedIds))
    }
    case 'add_checklist_item': {
      const { checklist, index } = findChecklist(task, mutation.checklistId)
      const text = requireNonEmpty(mutation.text, 'Checklist item', 500)
      const item: ChecklistItem = { id: stableId('item', context), text, completed: false, order: checklist.items.length, createdAt: at, updatedAt: at }
      const next = { ...checklist, items: [...checklist.items, item], updatedAt: at }
      return commit(state, replaceChecklist(task, index, next), context, at, event(context, task.id, 'checklist_item_created', at, undefined, text, { checklistId: checklist.id, itemId: item.id }), {}, { entityId: item.id })
    }
    case 'update_checklist_item': {
      const { checklist, index: checklistIndex } = findChecklist(task, mutation.checklistId)
      const { item, index: itemIndex } = findChecklistItem(checklist, mutation.itemId)
      const text = mutation.patch.text === undefined ? item.text : requireNonEmpty(mutation.patch.text, 'Checklist item', 500)
      const dueDate = mutation.patch.dueDate === undefined ? item.dueDate : dateOnly(mutation.patch.dueDate ?? undefined, 'Item due date')
      const assigneeId = mutation.patch.assigneeId === undefined ? item.assigneeId : mutation.patch.assigneeId || undefined
      const completed = mutation.patch.completed ?? item.completed
      const next: ChecklistItem = { ...item, text, dueDate, assigneeId, completed, updatedAt: at }
      if (JSON.stringify(item) === JSON.stringify(next)) return unchanged(state, task.id)
      const items = checklist.items.map((entry, entryIndex) => entryIndex === itemIndex ? next : entry)
      const nextChecklist = { ...checklist, items, updatedAt: at }
      const type: ActivityEventType = completed !== item.completed ? 'checklist_item_completed' : 'checklist_item_updated'
      return commit(state, replaceChecklist(task, checklistIndex, nextChecklist), context, at, event(context, task.id, type, at, item, next, { checklistId: checklist.id, itemId: item.id }))
    }
    case 'toggle_checklist_item': {
      return applyTaskMutation(state, { type: 'update_checklist_item', taskId: task.id, checklistId: mutation.checklistId, itemId: mutation.itemId, patch: { completed: !findChecklistItem(findChecklist(task, mutation.checklistId).checklist, mutation.itemId).item.completed } }, context)
    }
    case 'delete_checklist_item': {
      const { checklist, index } = findChecklist(task, mutation.checklistId)
      const { item } = findChecklistItem(checklist, mutation.itemId)
      const items = checklist.items.filter((entry) => entry.id !== item.id).map((entry, order) => ({ ...entry, order }))
      const next = { ...checklist, items, updatedAt: at }
      return commit(state, replaceChecklist(task, index, next), context, at, event(context, task.id, 'checklist_item_removed', at, item.text, undefined, { checklistId: checklist.id, itemId: item.id }))
    }
    case 'reorder_checklist_items': {
      const { checklist, index } = findChecklist(task, mutation.checklistId)
      const current = checklist.items.map((item) => item.id)
      assertExactOrder(current, mutation.orderedIds, 'Checklist item')
      if (sameArray(current, mutation.orderedIds)) return unchanged(state, task.id)
      const map = new Map(checklist.items.map((item) => [item.id, item]))
      const items = mutation.orderedIds.map((id, order) => ({ ...map.get(id)!, order, updatedAt: at }))
      const next = { ...checklist, items, updatedAt: at }
      return commit(state, replaceChecklist(task, index, next), context, at, event(context, task.id, 'checklist_item_reordered', at, current, mutation.orderedIds, { checklistId: checklist.id }))
    }
    case 'add_comment': {
      const body = requireNonEmpty(mutation.body, 'Comment', COMMENT_LIMIT)
      if (mutation.parentCommentId) {
        const parent = state.comments[mutation.parentCommentId]
        if (!parent || parent.taskId !== task.id || parent.parentCommentId) throw new TaskDomainError('Replies can only target a top-level comment on this task.', 'invalid_input')
      }
      const attachmentIds = unique(mutation.attachmentIds ?? [])
      if (attachmentIds.some((id) => state.attachments[id]?.taskId !== task.id)) {
        throw new TaskDomainError('Comment attachments must already belong to this task.', 'invalid_input')
      }
      const commentId = mutation.commentId?.trim() || stableId('comment', context)
      if (state.comments[commentId]) return unchanged(state, task.id)
      const createdAt = mutation.createdAt ?? at
      if (Number.isNaN(Date.parse(createdAt))) throw new TaskDomainError('Comment timestamp is invalid.', 'invalid_input')
      const authorId = mutation.authorId?.trim() || context.actorId
      const comment: TaskComment = {
        id: commentId, taskId: task.id, authorId,
        parentCommentId: mutation.parentCommentId, body,
        mentionIds: unique(mutation.mentionIds ?? []), attachmentIds,
        reactions: {}, createdAt,
      }
      return commit(state, { ...task, commentIds: [...task.commentIds, comment.id] }, context, at, event(context, task.id, 'comment_added', at, undefined, { commentId: comment.id, parentCommentId: comment.parentCommentId }), {
        comments: { ...state.comments, [comment.id]: comment },
      }, { entityId: comment.id })
    }
    case 'add_dependency': {
      requireTask(state, mutation.targetTaskId)
      if (mutation.targetTaskId === task.id) throw new TaskDomainError('A task cannot depend on itself.', 'invalid_input')
      const direction = dependencyDirection(task.id, mutation.targetTaskId, mutation.relation)
      const duplicate = Object.values(state.dependencies).some((item) => {
        if (mutation.relation === 'relates_to') return item.relation === 'relates_to' && ((item.taskId === task.id && item.targetTaskId === mutation.targetTaskId) || (item.taskId === mutation.targetTaskId && item.targetTaskId === task.id))
        const itemDirection = dependencyDirection(item.taskId, item.targetTaskId, item.relation)
        return Boolean(direction && itemDirection && direction[0] === itemDirection[0] && direction[1] === itemDirection[1])
      })
      if (duplicate) throw new TaskDomainError('This dependency already exists.', 'duplicate')
      if (direction && hasBlockingPath(state, direction[1], direction[0])) throw new TaskDomainError('This dependency would create a blocking cycle.', 'dependency_cycle')
      const dependency: TaskDependency = { id: stableId('dependency', context), taskId: task.id, targetTaskId: mutation.targetTaskId, relation: mutation.relation, createdBy: context.actorId, createdAt: at }
      const target = state.tasks[mutation.targetTaskId]
      const tasks = {
        ...state.tasks,
        [target.id]: { ...target, dependencyIds: [...target.dependencyIds, dependency.id], updatedAt: at, version: target.version + 1 },
      }
      return commit(state, { ...task, dependencyIds: [...task.dependencyIds, dependency.id] }, context, at, event(context, task.id, 'dependency_added', at, undefined, { targetTaskId: target.id, relation: mutation.relation }, { dependencyId: dependency.id }), {
        tasks,
        dependencies: { ...state.dependencies, [dependency.id]: dependency },
      }, { entityId: dependency.id })
    }
    case 'remove_dependency': {
      const dependency = state.dependencies[mutation.dependencyId]
      if (!dependency || (dependency.taskId !== task.id && dependency.targetTaskId !== task.id)) throw new TaskDomainError('Dependency was not found for this task.', 'not_found')
      const otherId = dependency.taskId === task.id ? dependency.targetTaskId : dependency.taskId
      const other = state.tasks[otherId]
      const tasks = { ...state.tasks }
      if (other) tasks[otherId] = { ...other, dependencyIds: other.dependencyIds.filter((id) => id !== dependency.id), updatedAt: at, version: other.version + 1 }
      const dependencies = { ...state.dependencies }
      delete dependencies[dependency.id]
      return commit(state, { ...task, dependencyIds: task.dependencyIds.filter((id) => id !== dependency.id) }, context, at, event(context, task.id, 'dependency_removed', at, dependency, undefined, { dependencyId: dependency.id }), { tasks, dependencies }, { entityId: dependency.id })
    }
    case 'add_attachment': {
      const attachmentId = requireNonEmpty(mutation.attachment.id, 'Attachment ID')
      if (state.attachments[attachmentId]) throw new TaskDomainError('This attachment already exists.', 'duplicate')
      if (!mutation.attachment.storageKey.trim() || !mutation.attachment.name.trim() || mutation.attachment.sizeBytes < 0) throw new TaskDomainError('Attachment metadata is invalid.', 'invalid_input')
      const attachment: TaskAttachment = { ...mutation.attachment, id: attachmentId, taskId: task.id, createdAt: mutation.attachment.createdAt ?? at }
      return commit(state, { ...task, attachmentIds: [...task.attachmentIds, attachment.id] }, context, at, event(context, task.id, 'attachment_added', at, undefined, attachment.name, { attachmentId: attachment.id }), {
        attachments: { ...state.attachments, [attachment.id]: attachment },
      }, { entityId: attachment.id })
    }
    case 'remove_attachment': {
      const attachment = state.attachments[mutation.attachmentId]
      if (!attachment || attachment.taskId !== task.id) throw new TaskDomainError('Attachment was not found for this task.', 'not_found')
      const attachments = { ...state.attachments }
      delete attachments[attachment.id]
      const comments = Object.fromEntries(Object.values(state.comments).map((comment) => [comment.id, comment.attachmentIds.includes(attachment.id)
        ? { ...comment, attachmentIds: comment.attachmentIds.filter((id) => id !== attachment.id), updatedAt: at }
        : comment]))
      return commit(state, { ...task, attachmentIds: task.attachmentIds.filter((id) => id !== attachment.id) }, context, at, event(context, task.id, 'attachment_removed', at, attachment.name, undefined, { attachmentId: attachment.id }), { attachments, comments }, { entityId: attachment.id })
    }
    case 'toggle_watch': {
      const userId = mutation.userId?.trim() || context.actorId
      const watching = task.watcherIds.includes(userId)
      const watcherIds = watching ? task.watcherIds.filter((id) => id !== userId) : [...task.watcherIds, userId]
      return commit(state, { ...task, watcherIds }, context, at, event(context, task.id, watching ? 'watch_stopped' : 'watch_started', at, watching, !watching, { userId }))
    }
    case 'duplicate_task': {
      const newTaskId = mutation.newTaskId?.trim() || stableId('task', context)
      if (!newTaskId) throw new TaskDomainError('Duplicate task ID is required.', 'invalid_input')
      if (state.tasks[newTaskId]) throw new TaskDomainError('A task with the duplicate ID already exists.', 'conflict')
      const checklistCopies = mutation.includeChecklists === false ? [] : task.checklists.map((checklist, order) => ({
        ...checklist,
        id: stableId('checklist', context),
        order,
        createdAt: at,
        updatedAt: at,
        items: checklist.items.map((item, itemOrder) => ({ ...item, id: stableId('item', context), order: itemOrder, createdAt: at, updatedAt: at })),
      }))
      const duplicate: TaskDetails = {
        ...task,
        id: newTaskId,
        key: `${task.key}-COPY-${newTaskId.slice(-4).toUpperCase()}`,
        title: mutation.title ? requireNonEmpty(mutation.title, 'Task title') : `${task.title} (copy)`,
        checklists: checklistCopies,
        dependencyIds: [],
        attachmentIds: [],
        commentIds: [],
        watcherIds: [],
        cover: task.cover?.type === 'image' ? undefined : task.cover,
        archivedAt: undefined,
        createdBy: context.actorId,
        createdAt: at,
        updatedAt: at,
        version: 1,
      }
      let dependencies = state.dependencies
      const tasks: Record<string, TaskDetails> = { ...state.tasks, [duplicate.id]: duplicate }
      if (mutation.includeDependencies) {
        dependencies = { ...state.dependencies }
        for (const dependencyId of task.dependencyIds) {
          const source = state.dependencies[dependencyId]
          if (!source) continue
          const copied: TaskDependency = {
            ...source,
            id: stableId('dependency', context),
            taskId: source.taskId === task.id ? duplicate.id : source.taskId,
            targetTaskId: source.targetTaskId === task.id ? duplicate.id : source.targetTaskId,
            createdBy: context.actorId,
            createdAt: at,
          }
          dependencies[copied.id] = copied
          duplicate.dependencyIds.push(copied.id)
          const otherId = copied.taskId === duplicate.id ? copied.targetTaskId : copied.taskId
          const other = tasks[otherId]
          if (other) tasks[otherId] = { ...other, dependencyIds: [...other.dependencyIds, copied.id], updatedAt: at, version: other.version + 1 }
        }
      }
      const duplicatedEvent = event(context, task.id, 'task_duplicated', at, undefined, { duplicateTaskId: duplicate.id })
      return {
        changed: true,
        taskId: duplicate.id,
        entityId: duplicate.id,
        activityId: duplicatedEvent.id,
        state: {
          ...state,
          tasks,
          dependencies,
          activity: { ...state.activity, [duplicatedEvent.id]: duplicatedEvent },
          revision: state.revision + 1,
          updatedAt: at,
        },
      }
    }
    case 'move_task': {
      const boardId = requireNonEmpty(mutation.boardId, 'Board ID')
      const projectId = requireNonEmpty(mutation.projectId, 'Project ID')
      const columnId = requireNonEmpty(mutation.columnId, 'Column ID')
      if (!VALID_STATUSES.has(mutation.status)) throw new TaskDomainError('Task status is invalid.', 'invalid_input')
      if (task.boardId === boardId && task.projectId === projectId && task.columnId === columnId && task.status === mutation.status) return unchanged(state, task.id)
      const previous = { boardId:task.boardId,projectId:task.projectId,columnId:task.columnId,status:task.status }
      const next = { boardId,projectId,columnId,status:mutation.status }
      return commit(state,{...task,...next},context,at,event(context,task.id,'task_moved',at,previous,next))
    }
    case 'set_parent': {
      const parentTaskId = mutation.parentTaskId?.trim() || undefined
      if (parentTaskId === task.parentTaskId) return unchanged(state,task.id)
      if (parentTaskId) {
        requireTask(state,parentTaskId)
        if (parentTaskId === task.id) throw new TaskDomainError('A task cannot be its own parent.', 'invalid_input')
        if (createsParentCycle(state,task.id,parentTaskId)) throw new TaskDomainError('This parent would create a circular task hierarchy.', 'dependency_cycle')
      }
      return commit(state,{...task,parentTaskId},context,at,event(context,task.id,'parent_changed',at,task.parentTaskId,parentTaskId))
    }
    case 'archive_task': {
      if (task.archivedAt) return unchanged(state, task.id)
      return commit(state, { ...task, archivedAt: at }, context, at, event(context, task.id, 'task_archived', at, undefined, at))
    }
    case 'restore_task': {
      if (!task.archivedAt) return unchanged(state, task.id)
      return commit(state, { ...task, archivedAt: undefined }, context, at, event(context, task.id, 'task_restored', at, task.archivedAt, undefined))
    }
    case 'delete_task': {
      const deletionEvent = event(context, task.id, 'task_deleted', at, undefined, { recoverable: true })
      const relatedComments = Object.values(state.comments).filter((item) => item.taskId === task.id)
      const relatedAttachments = Object.values(state.attachments).filter((item) => item.taskId === task.id)
      const relatedDependencies = Object.values(state.dependencies).filter((item) => item.taskId === task.id || item.targetTaskId === task.id)
      const relatedActivity = [...Object.values(state.activity).filter((item) => item.taskId === task.id), deletionEvent]
      const trashId = stableId('trash', context)
      const trashEntry = { id: trashId, task, comments: relatedComments, attachments: relatedAttachments, dependencies: relatedDependencies, activity: relatedActivity, deletedAt: at, deletedBy: context.actorId }
      const tasks = { ...state.tasks }
      delete tasks[task.id]
      for (const dependency of relatedDependencies) {
        const otherId = dependency.taskId === task.id ? dependency.targetTaskId : dependency.taskId
        const other = tasks[otherId]
        if (other) tasks[otherId] = { ...other, dependencyIds: other.dependencyIds.filter((id) => id !== dependency.id), updatedAt: at, version: other.version + 1 }
      }
      const comments = { ...state.comments }
      relatedComments.forEach((item) => delete comments[item.id])
      const attachments = { ...state.attachments }
      relatedAttachments.forEach((item) => delete attachments[item.id])
      const dependencies = { ...state.dependencies }
      relatedDependencies.forEach((item) => delete dependencies[item.id])
      const activity = { ...state.activity }
      relatedActivity.forEach((item) => delete activity[item.id])
      return {
        changed: true,
        taskId: task.id,
        entityId: trashId,
        activityId: deletionEvent.id,
        state: {
          ...state, tasks, comments, attachments, dependencies, activity,
          trash: { ...state.trash, [trashId]: trashEntry },
          revision: state.revision + 1,
          updatedAt: at,
        },
      }
    }
  }
}

/** Small typed action creators keep components free of mutation-shape knowledge. */
export const taskActions = {
  updateTitle: (taskId: string, title: string): TaskMutation => ({ type: 'update_title', taskId, title }),
  updateDescription: (taskId: string, description: string): TaskMutation => ({ type: 'update_description', taskId, description }),
  updateStatus: (taskId: string, status: TaskStatus, columnId?: string): TaskMutation => ({ type: 'update_status', taskId, status, columnId }),
  updatePriority: (taskId: string, priority: TaskPriority): TaskMutation => ({ type: 'update_priority', taskId, priority }),
  setDates: (taskId: string, dates: { startDate?: string; dueDate?: string; reminder?: TaskReminder }): TaskMutation => ({ type: 'set_dates', taskId, ...dates }),
  setEstimate: (taskId: string, estimate?: TaskEstimate): TaskMutation => ({ type: 'set_estimate', taskId, estimate }),
  assignMember: (taskId: string, memberId: string): TaskMutation => ({ type: 'assign_member', taskId, memberId }),
  unassignMember: (taskId: string, memberId: string): TaskMutation => ({ type: 'unassign_member', taskId, memberId }),
  addLabel: (taskId: string, labelId: string): TaskMutation => ({ type: 'add_label', taskId, labelId }),
  removeLabel: (taskId: string, labelId: string): TaskMutation => ({ type: 'remove_label', taskId, labelId }),
  addChecklist: (taskId: string, title: string): TaskMutation => ({ type: 'add_checklist', taskId, title }),
  addChecklistItem: (taskId: string, checklistId: string, text: string): TaskMutation => ({ type: 'add_checklist_item', taskId, checklistId, text }),
  addComment: (taskId: string, body: string, parentCommentId?: string): TaskMutation => ({ type: 'add_comment', taskId, body, parentCommentId }),
  toggleReaction: (commentId: string, emoji: string, userId?: string): TaskMutation => ({ type: 'toggle_reaction', commentId, emoji, userId }),
  addDependency: (taskId: string, targetTaskId: string, relation: DependencyRelation): TaskMutation => ({ type: 'add_dependency', taskId, targetTaskId, relation }),
  toggleWatch: (taskId: string, userId?: string): TaskMutation => ({ type: 'toggle_watch', taskId, userId }),
  duplicateTask: (taskId: string): TaskMutation => ({ type: 'duplicate_task', taskId }),
  archiveTask: (taskId: string): TaskMutation => ({ type: 'archive_task', taskId }),
  restoreTask: (taskId: string): TaskMutation => ({ type: 'restore_task', taskId }),
  deleteTask: (taskId: string): TaskMutation => ({ type: 'delete_task', taskId }),
}
