import {
  TASK_STORE_SCHEMA_VERSION,
  TASK_UI_SCHEMA_VERSION,
  type ActivityEvent,
  type Checklist,
  type ChecklistItem,
  type TaskAttachment,
  type TaskComment,
  type TaskDependency,
  type TaskDetails,
  type TaskLabel,
  type TaskPersistenceIssue,
  type TaskStoreState,
  type TaskTrashEntry,
  type TaskUiPreferences,
} from '@/types/task'

export const TASK_STORAGE_KEY = 'workspace:tasks:v2'
export const TASK_UI_PREFERENCES_KEY = 'workspace:task-ui:v1'

export interface TaskStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

export interface TaskLoadResult<T> {
  data: T
  source: 'empty' | 'storage' | 'migrated' | 'recovered'
  issue?: TaskPersistenceIssue
}

export type TaskSaveResult =
  | { ok: true; revision: number }
  | { ok: false; issue: TaskPersistenceIssue }

const TASK_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'in_review', 'done'])
const TASK_PRIORITIES = new Set(['urgent', 'high', 'medium', 'low'])
const LABEL_COLORS = new Set(['slate', 'rose', 'orange', 'amber', 'emerald', 'sky', 'blue', 'violet', 'pink'])
const DEPENDENCY_RELATIONS = new Set(['blocks', 'blocked_by', 'relates_to'])
const ACTIVITY_FILTERS = new Set(['all', 'comments', 'history'])
const COVER_COLORS = new Set(['slate', 'indigo', 'blue', 'teal', 'emerald', 'amber', 'rose', 'plum'])
const COVER_GRADIENTS = new Set(['midnight', 'ocean', 'aurora', 'sunrise', 'berry', 'slate-sky'])
const COVER_IMAGE_TYPES = new Set(['image/avif', 'image/jpeg', 'image/png', 'image/webp'])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isString = (value: unknown): value is string => typeof value === 'string'
const isOptionalString = (value: unknown) => value === undefined || isString(value)
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString)
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isNonNegativeInteger = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0
const hasUniqueValues = (values: string[]) => new Set(values).size === values.length

function isIsoTimestamp(value: unknown): value is string {
  return isString(value) && value.length > 0 && !Number.isNaN(Date.parse(value))
}

function isDateOnly(value: unknown): value is string {
  if (!isString(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function isOptionalDateOnly(value: unknown) {
  return value === undefined || isDateOnly(value)
}

function valuesOf<T>(record: Record<string, T>): T[] {
  return Object.values(record)
}

function recordById<T extends { id: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((item) => [item.id, item]))
}

export function createEmptyTaskStore(now = new Date().toISOString()): TaskStoreState {
  return {
    schemaVersion: TASK_STORE_SCHEMA_VERSION,
    revision: 0,
    updatedAt: now,
    tasks: {},
    comments: {},
    attachments: {},
    dependencies: {},
    labels: {},
    activity: {},
    trash: {},
  }
}

export function createDefaultTaskUiPreferences(now = new Date().toISOString()): TaskUiPreferences {
  return {
    schemaVersion: TASK_UI_SCHEMA_VERSION,
    revision: 0,
    activityFilter: 'all',
    isFullscreen: false,
    detailsPanel: 'details',
    updatedAt: now,
  }
}

function validateChecklistItem(value: unknown): value is ChecklistItem {
  if (!isRecord(value)) return false
  return (
    isString(value.id) && value.id.length > 0 &&
    isString(value.text) && value.text.trim().length > 0 &&
    typeof value.completed === 'boolean' &&
    isOptionalString(value.assigneeId) &&
    isOptionalDateOnly(value.dueDate) &&
    isNonNegativeInteger(value.order) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt)
  )
}

function validateChecklist(value: unknown): value is Checklist {
  if (!isRecord(value) || !Array.isArray(value.items)) return false
  const items = value.items
  return (
    isString(value.id) && value.id.length > 0 &&
    isString(value.title) && value.title.trim().length > 0 &&
    typeof value.hideCompleted === 'boolean' &&
    isNonNegativeInteger(value.order) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    items.every(validateChecklistItem) &&
    hasUniqueValues(items.map((item) => item.id)) &&
    hasUniqueValues(items.map((item) => String(item.order)))
  )
}

function validateTask(value: unknown): value is TaskDetails {
  if (!isRecord(value) || !Array.isArray(value.checklists)) return false
  const estimate = value.estimate
  const reminder = value.reminder
  const cover = value.cover
  return (
    isString(value.id) && value.id.length > 0 &&
    isString(value.key) && value.key.length > 0 &&
    isString(value.projectId) &&
    isString(value.boardId) && value.boardId.length > 0 &&
    isString(value.columnId) &&
    isOptionalString(value.sprintId) &&
    isOptionalString(value.parentTaskId) &&
    isString(value.title) && value.title.trim().length > 0 && value.title.length <= 240 &&
    isString(value.description) &&
    isString(value.status) && TASK_STATUSES.has(value.status) &&
    isString(value.priority) && TASK_PRIORITIES.has(value.priority) &&
    isStringArray(value.assigneeIds) && hasUniqueValues(value.assigneeIds) &&
    isStringArray(value.labelIds) && hasUniqueValues(value.labelIds) &&
    (estimate === undefined || (isRecord(estimate) && isFiniteNumber(estimate.value) && estimate.value >= 0 && (estimate.unit === 'points' || estimate.unit === 'hours'))) &&
    isOptionalDateOnly(value.startDate) &&
    isOptionalDateOnly(value.dueDate) &&
    (reminder === undefined || (isRecord(reminder) && isNonNegativeInteger(reminder.offsetMinutes) && typeof reminder.enabled === 'boolean')) &&
    isStringArray(value.dependencyIds) && hasUniqueValues(value.dependencyIds) &&
    value.checklists.every(validateChecklist) &&
    hasUniqueValues(value.checklists.map((checklist) => checklist.id)) &&
    hasUniqueValues(value.checklists.map((checklist) => String(checklist.order))) &&
    isStringArray(value.attachmentIds) && hasUniqueValues(value.attachmentIds) &&
    isStringArray(value.commentIds) && hasUniqueValues(value.commentIds) &&
    (cover === undefined || (
      isRecord(cover) && isString(cover.value) && (
        (cover.type === 'color' && COVER_COLORS.has(cover.value)) ||
        (cover.type === 'gradient' && COVER_GRADIENTS.has(cover.value)) ||
        (
          cover.type === 'image' && cover.value.length > 0 && cover.value.length <= 512 &&
          isString(cover.mimeType) && COVER_IMAGE_TYPES.has(cover.mimeType) &&
          isNonNegativeInteger(cover.width) && cover.width > 0 &&
          isNonNegativeInteger(cover.height) && cover.height > 0 &&
          isFiniteNumber(cover.positionY) && cover.positionY >= 0 && cover.positionY <= 100
        )
      )
    )) &&
    isStringArray(value.watcherIds) && hasUniqueValues(value.watcherIds) &&
    (value.archivedAt === undefined || isIsoTimestamp(value.archivedAt)) &&
    isOptionalString(value.createdBy) &&
    isIsoTimestamp(value.createdAt) &&
    isIsoTimestamp(value.updatedAt) &&
    Number.isInteger(value.version) && Number(value.version) >= 1
  )
}

function validateComment(value: unknown): value is TaskComment {
  if (!isRecord(value) || !isRecord(value.reactions)) return false
  const reactionsValid = Object.values(value.reactions).every(
    (ids) => isStringArray(ids) && hasUniqueValues(ids),
  )
  return (
    isString(value.id) && isString(value.taskId) && isString(value.authorId) &&
    isOptionalString(value.parentCommentId) && isString(value.body) &&
    isStringArray(value.mentionIds) && isStringArray(value.attachmentIds) &&
    reactionsValid && isIsoTimestamp(value.createdAt) &&
    (value.updatedAt === undefined || isIsoTimestamp(value.updatedAt)) &&
    (value.deletedAt === undefined || isIsoTimestamp(value.deletedAt))
  )
}

function validateAttachment(value: unknown): value is TaskAttachment {
  return isRecord(value) && isString(value.id) && isString(value.taskId) && isString(value.name) &&
    isString(value.mimeType) && isNonNegativeInteger(value.sizeBytes) && isString(value.storageKey) &&
    isString(value.uploadedBy) && isIsoTimestamp(value.createdAt)
}

function validateDependency(value: unknown): value is TaskDependency {
  return isRecord(value) && isString(value.id) && isString(value.taskId) && isString(value.targetTaskId) &&
    value.taskId !== value.targetTaskId && isString(value.relation) && DEPENDENCY_RELATIONS.has(value.relation) &&
    isString(value.createdBy) && isIsoTimestamp(value.createdAt)
}

function validateLabel(value: unknown): value is TaskLabel {
  return isRecord(value) && isString(value.id) && isString(value.name) && value.name.trim().length > 0 &&
    isString(value.color) && LABEL_COLORS.has(value.color) && isIsoTimestamp(value.createdAt) && isIsoTimestamp(value.updatedAt)
}

function validateActivity(value: unknown): value is ActivityEvent {
  return isRecord(value) && isString(value.id) && isString(value.taskId) && isString(value.actorId) &&
    isString(value.type) && isIsoTimestamp(value.timestamp) &&
    (value.metadata === undefined || isRecord(value.metadata))
}

function validateTrash(value: unknown): value is TaskTrashEntry {
  return isRecord(value) && isString(value.id) && validateTask(value.task) &&
    Array.isArray(value.comments) && value.comments.every(validateComment) &&
    Array.isArray(value.attachments) && value.attachments.every(validateAttachment) &&
    Array.isArray(value.dependencies) && value.dependencies.every(validateDependency) &&
    Array.isArray(value.activity) && value.activity.every(validateActivity) &&
    isIsoTimestamp(value.deletedAt) && isString(value.deletedBy)
}

/** Strict runtime validation, including normalized-graph referential integrity. */
export function validateTaskStore(value: unknown): value is TaskStoreState {
  if (!isRecord(value)) return false
  if (value.schemaVersion !== TASK_STORE_SCHEMA_VERSION || !isNonNegativeInteger(value.revision) || !isIsoTimestamp(value.updatedAt)) return false
  const keys = ['tasks', 'comments', 'attachments', 'dependencies', 'labels', 'activity', 'trash'] as const
  if (keys.some((key) => !isRecord(value[key]))) return false

  const tasks = value.tasks as Record<string, unknown>
  const comments = value.comments as Record<string, unknown>
  const attachments = value.attachments as Record<string, unknown>
  const dependencies = value.dependencies as Record<string, unknown>
  const labels = value.labels as Record<string, unknown>
  const activity = value.activity as Record<string, unknown>
  const trash = value.trash as Record<string, unknown>

  if (!Object.entries(tasks).every(([id, item]) => validateTask(item) && item.id === id)) return false
  if (!Object.entries(comments).every(([id, item]) => validateComment(item) && item.id === id && Boolean(tasks[item.taskId]))) return false
  if (!Object.entries(attachments).every(([id, item]) => validateAttachment(item) && item.id === id && Boolean(tasks[item.taskId]))) return false
  if (!Object.entries(dependencies).every(([id, item]) => validateDependency(item) && item.id === id && Boolean(tasks[item.taskId]) && Boolean(tasks[item.targetTaskId]))) return false
  if (!Object.entries(labels).every(([id, item]) => validateLabel(item) && item.id === id)) return false
  if (!Object.entries(activity).every(([id, item]) => validateActivity(item) && item.id === id && Boolean(tasks[item.taskId]))) return false
  if (!Object.entries(trash).every(([id, item]) => validateTrash(item) && item.id === id)) return false

  if (!Object.values(comments).every((unknownComment) => {
    const comment = unknownComment as TaskComment
    const parent = comment.parentCommentId ? comments[comment.parentCommentId] as TaskComment | undefined : undefined
    return comment.attachmentIds.every((id) => (attachments[id] as TaskAttachment | undefined)?.taskId === comment.taskId) &&
      (!comment.parentCommentId || (parent?.taskId === comment.taskId && !parent.parentCommentId))
  })) return false

  return Object.values(tasks).every((unknownTask) => {
    const task = unknownTask as TaskDetails
    return task.commentIds.every((id) => (comments[id] as TaskComment | undefined)?.taskId === task.id) &&
      task.attachmentIds.every((id) => (attachments[id] as TaskAttachment | undefined)?.taskId === task.id) &&
      task.dependencyIds.every((id) => {
        const dependency = dependencies[id] as TaskDependency | undefined
        return dependency?.taskId === task.id || dependency?.targetTaskId === task.id
      }) &&
      task.labelIds.every((id) => Boolean(labels[id])) &&
      (!task.parentTaskId || Boolean(tasks[task.parentTaskId]))
  })
}

export function validateTaskUiPreferences(value: unknown): value is TaskUiPreferences {
  return isRecord(value) && value.schemaVersion === TASK_UI_SCHEMA_VERSION &&
    isNonNegativeInteger(value.revision) && isString(value.activityFilter) &&
    ACTIVITY_FILTERS.has(value.activityFilter) && typeof value.isFullscreen === 'boolean' &&
    (value.detailsPanel === 'details' || value.detailsPanel === 'activity') && isIsoTimestamp(value.updatedAt)
}

function legacyStatus(value: unknown): TaskDetails['status'] {
  if (isString(value) && TASK_STATUSES.has(value)) return value as TaskDetails['status']
  const normalized = isString(value) ? value.toLowerCase().replace(/[\s-]+/g, '_') : ''
  if (normalized === 'review' || normalized === 'in_review') return 'in_review'
  if (normalized === 'inprogress' || normalized === 'in_progress' || normalized === 'doing') return 'in_progress'
  if (normalized === 'done' || normalized === 'complete' || normalized === 'completed') return 'done'
  if (normalized === 'backlog') return 'backlog'
  return 'todo'
}

function normalizeLegacyChecklist(value: unknown, checklistIndex: number, timestamp: string): Checklist | null {
  if (!isRecord(value)) return null
  const id = isString(value.id) && value.id ? value.id : `migrated-checklist-${checklistIndex}`
  const rawItems = Array.isArray(value.items) ? value.items : []
  const items = rawItems.flatMap((raw, itemIndex): ChecklistItem[] => {
    if (!isRecord(raw)) return []
    const text = isString(raw.text) ? raw.text.trim() : isString(raw.label) ? raw.label.trim() : ''
    if (!text) return []
    return [{
      id: isString(raw.id) && raw.id ? raw.id : `${id}-item-${itemIndex}`,
      text,
      completed: raw.completed === true,
      assigneeId: isString(raw.assigneeId) ? raw.assigneeId : undefined,
      dueDate: isDateOnly(raw.dueDate) ? raw.dueDate : undefined,
      order: itemIndex,
      createdAt: isIsoTimestamp(raw.createdAt) ? raw.createdAt : timestamp,
      updatedAt: isIsoTimestamp(raw.updatedAt) ? raw.updatedAt : timestamp,
    }]
  })
  return {
    id,
    title: isString(value.title) && value.title.trim() ? value.title.trim() : 'Checklist',
    items,
    hideCompleted: value.hideCompleted === true,
    order: checklistIndex,
    createdAt: isIsoTimestamp(value.createdAt) ? value.createdAt : timestamp,
    updatedAt: isIsoTimestamp(value.updatedAt) ? value.updatedAt : timestamp,
  }
}

function normalizeLegacyTask(value: unknown, index: number, timestamp: string): TaskDetails | null {
  if (!isRecord(value)) return null
  const id = isString(value.id) && value.id ? value.id : `migrated-task-${index}`
  const title = isString(value.title) ? value.title.trim().slice(0, 240) : ''
  if (!title) return null
  const boardId = isString(value.boardId) ? value.boardId : isString(value.board_id) ? value.board_id : 'default-board'
  const columnId = isString(value.columnId) ? value.columnId : isString(value.column_id) ? value.column_id : ''
  const priority = isString(value.priority) && TASK_PRIORITIES.has(value.priority) ? value.priority as TaskDetails['priority'] : 'medium'
  const createdAt = isIsoTimestamp(value.createdAt) ? value.createdAt : isIsoTimestamp(value.created_at) ? value.created_at : timestamp
  const checklists = (Array.isArray(value.checklists) ? value.checklists : [])
    .map((checklist, checklistIndex) => normalizeLegacyChecklist(checklist, checklistIndex, timestamp))
    .filter((checklist): checklist is Checklist => Boolean(checklist))
  return {
    id,
    key: isString(value.key) && value.key ? value.key : `TASK-${id.slice(0, 8).toUpperCase()}`,
    projectId: isString(value.projectId) ? value.projectId : boardId,
    boardId,
    columnId,
    sprintId: isString(value.sprintId) ? value.sprintId : undefined,
    parentTaskId: isString(value.parentTaskId) ? value.parentTaskId : undefined,
    title,
    description: isString(value.description) ? value.description : '',
    status: legacyStatus(value.status ?? value.columnName ?? value.column_name),
    priority,
    assigneeIds: Array.from(new Set(isStringArray(value.assigneeIds) ? value.assigneeIds : isString(value.assignee_id) ? [value.assignee_id] : [])),
    labelIds: Array.from(new Set(isStringArray(value.labelIds) ? value.labelIds : [])),
    estimate: isRecord(value.estimate) && isFiniteNumber(value.estimate.value) && value.estimate.value >= 0 && (value.estimate.unit === 'points' || value.estimate.unit === 'hours')
      ? { value: value.estimate.value, unit: value.estimate.unit }
      : isFiniteNumber(value.estimated_hours) && value.estimated_hours >= 0
        ? { value: value.estimated_hours, unit: 'hours' }
        : undefined,
    startDate: isDateOnly(value.startDate) ? value.startDate : isDateOnly(value.start_date) ? value.start_date : undefined,
    dueDate: isDateOnly(value.dueDate) ? value.dueDate : isDateOnly(value.due_date) ? value.due_date : undefined,
    dependencyIds: Array.from(new Set(isStringArray(value.dependencyIds) ? value.dependencyIds : [])),
    checklists,
    attachmentIds: Array.from(new Set(isStringArray(value.attachmentIds) ? value.attachmentIds : [])),
    commentIds: Array.from(new Set(isStringArray(value.commentIds) ? value.commentIds : [])),
    watcherIds: Array.from(new Set(isStringArray(value.watcherIds) ? value.watcherIds : [])),
    archivedAt: isIsoTimestamp(value.archivedAt) ? value.archivedAt : isIsoTimestamp(value.archived_at) ? value.archived_at : undefined,
    createdBy: isString(value.createdBy) ? value.createdBy : isString(value.created_by) ? value.created_by : undefined,
    createdAt,
    updatedAt: isIsoTimestamp(value.updatedAt) ? value.updatedAt : createdAt,
    version: Number.isInteger(value.version) && Number(value.version) >= 1 ? Number(value.version) : 1,
  }
}

function collectionFromUnknown(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (isRecord(value)) return Object.values(value)
  return []
}

/** Migrates the supported v1/raw-task shapes into the normalized v2 graph. */
export function migrateTaskStore(value: unknown, now = new Date().toISOString()): TaskStoreState | null {
  if (validateTaskStore(value)) return value
  const root: Record<string, unknown> = Array.isArray(value) ? { tasks: value, version: 1 } : isRecord(value) ? value : {}
  const version = root.schemaVersion ?? root.version
  if (version !== 1) return null

  const migratedTasks = collectionFromUnknown(root.tasks)
    .map((task, index) => normalizeLegacyTask(task, index, now))
    .filter((task): task is TaskDetails => Boolean(task))
  const tasks = recordById(migratedTasks)

  const comments = recordById(collectionFromUnknown(root.comments).filter(validateComment))
  const attachments = recordById(collectionFromUnknown(root.attachments).filter(validateAttachment))
  const dependencies = recordById(collectionFromUnknown(root.dependencies).filter(validateDependency))
  const labels = recordById(collectionFromUnknown(root.labels).filter(validateLabel))
  const activity = recordById(collectionFromUnknown(root.activity).filter(validateActivity))
  const trash = recordById(collectionFromUnknown(root.trash).filter(validateTrash))

  // Repair relationships that cannot survive migration rather than persisting dangling IDs.
  const repairedTasks = Object.fromEntries(Object.values(tasks).map((task) => [task.id, {
    ...task,
    commentIds: task.commentIds.filter((id) => comments[id]?.taskId === task.id),
    attachmentIds: task.attachmentIds.filter((id) => attachments[id]?.taskId === task.id),
    dependencyIds: task.dependencyIds.filter((id) => dependencies[id] && (dependencies[id].taskId === task.id || dependencies[id].targetTaskId === task.id)),
    labelIds: task.labelIds.filter((id) => Boolean(labels[id])),
    parentTaskId: task.parentTaskId && tasks[task.parentTaskId] ? task.parentTaskId : undefined,
  }]))
  const migrated: TaskStoreState = {
    schemaVersion: TASK_STORE_SCHEMA_VERSION,
    revision: isNonNegativeInteger(root.revision) ? root.revision + 1 : 1,
    updatedAt: now,
    tasks: repairedTasks,
    comments: Object.fromEntries(valuesOf(comments).filter((item) => Boolean(tasks[item.taskId])).map((item) => [item.id, item])),
    attachments: Object.fromEntries(valuesOf(attachments).filter((item) => Boolean(tasks[item.taskId])).map((item) => [item.id, item])),
    dependencies: Object.fromEntries(valuesOf(dependencies).filter((item) => Boolean(tasks[item.taskId]) && Boolean(tasks[item.targetTaskId])).map((item) => [item.id, item])),
    labels,
    activity: Object.fromEntries(valuesOf(activity).filter((item) => Boolean(tasks[item.taskId])).map((item) => [item.id, item])),
    trash,
  }
  return validateTaskStore(migrated) ? migrated : null
}

function unavailableIssue(): TaskPersistenceIssue {
  return { code: 'unavailable', message: 'Task storage is unavailable in this environment.', recoverable: true }
}

function storageOrDefault(storage?: TaskStorageLike | null): TaskStorageLike | null {
  if (storage !== undefined) return storage
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function parseTaskRaw(raw: string | null, now?: string): TaskLoadResult<TaskStoreState> {
  if (raw === null) return { data: createEmptyTaskStore(now), source: 'empty' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    return {
      data: createEmptyTaskStore(now),
      source: 'recovered',
      issue: { code: 'corrupt_data', message: 'Saved task data was not valid JSON. A clean local workspace was recovered.', cause, recoverable: true },
    }
  }
  if (validateTaskStore(parsed)) return { data: parsed, source: 'storage' }
  const migrated = migrateTaskStore(parsed, now)
  if (migrated) return { data: migrated, source: 'migrated' }
  return {
    data: createEmptyTaskStore(now),
    source: 'recovered',
    issue: { code: 'validation_failed', message: 'Saved task data did not match a supported schema. A clean local workspace was recovered.', recoverable: true },
  }
}

export function loadTaskStore(storage?: TaskStorageLike | null): TaskLoadResult<TaskStoreState> {
  const target = storageOrDefault(storage)
  if (!target) return { data: createEmptyTaskStore(), source: 'empty', issue: unavailableIssue() }
  try {
    return parseTaskRaw(target.getItem(TASK_STORAGE_KEY))
  } catch (cause) {
    return { data: createEmptyTaskStore(), source: 'recovered', issue: { ...unavailableIssue(), cause } }
  }
}

function classifyWriteError(cause: unknown): TaskPersistenceIssue {
  const error = cause as { name?: string; code?: number; message?: string } | null
  const quota = error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22 || error?.code === 1014
  return quota
    ? { code: 'quota_exceeded', message: 'Local task storage is full. Remove large local data or export tasks before retrying.', cause, recoverable: true }
    : { code: 'write_failed', message: error?.message || 'Task changes could not be saved locally.', cause, recoverable: true }
}

/**
 * Compare-before-write persistence. Pass the revision the mutation was based on;
 * a newer tab revision will be rejected instead of silently overwritten.
 */
export function persistTaskStore(
  state: TaskStoreState,
  options: { storage?: TaskStorageLike | null; expectedRevision?: number } = {},
): TaskSaveResult {
  if (!validateTaskStore(state)) {
    return { ok: false, issue: { code: 'validation_failed', message: 'Invalid task state was rejected before persistence.', recoverable: false } }
  }
  const target = storageOrDefault(options.storage)
  if (!target) return { ok: false, issue: unavailableIssue() }
  try {
    if (options.expectedRevision !== undefined) {
      const current = parseTaskRaw(target.getItem(TASK_STORAGE_KEY)).data
      if (current.revision !== options.expectedRevision) {
        return {
          ok: false,
          issue: {
            code: 'conflict',
            message: 'This task changed in another tab. The latest saved version was loaded; retry your change.',
            recoverable: true,
          },
        }
      }
    }
    target.setItem(TASK_STORAGE_KEY, JSON.stringify(state))
    return { ok: true, revision: state.revision }
  } catch (cause) {
    return { ok: false, issue: classifyWriteError(cause) }
  }
}

export function loadTaskUiPreferences(storage?: TaskStorageLike | null): TaskLoadResult<TaskUiPreferences> {
  const target = storageOrDefault(storage)
  if (!target) return { data: createDefaultTaskUiPreferences(), source: 'empty', issue: unavailableIssue() }
  let raw: string | null
  try {
    raw = target.getItem(TASK_UI_PREFERENCES_KEY)
  } catch (cause) {
    return { data: createDefaultTaskUiPreferences(), source: 'recovered', issue: { ...unavailableIssue(), cause } }
  }
  if (raw === null) return { data: createDefaultTaskUiPreferences(), source: 'empty' }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (validateTaskUiPreferences(parsed)) return { data: parsed, source: 'storage' }
    return { data: createDefaultTaskUiPreferences(), source: 'recovered', issue: { code: 'validation_failed', message: 'Invalid task UI preferences were reset.', recoverable: true } }
  } catch (cause) {
    return { data: createDefaultTaskUiPreferences(), source: 'recovered', issue: { code: 'corrupt_data', message: 'Corrupted task UI preferences were reset.', cause, recoverable: true } }
  }
}

export function persistTaskUiPreferences(
  preferences: TaskUiPreferences,
  options: { storage?: TaskStorageLike | null; expectedRevision?: number } = {},
): TaskSaveResult {
  if (!validateTaskUiPreferences(preferences)) {
    return { ok: false, issue: { code: 'validation_failed', message: 'Invalid task UI preferences were rejected.', recoverable: false } }
  }
  const target = storageOrDefault(options.storage)
  if (!target) return { ok: false, issue: unavailableIssue() }
  try {
    if (options.expectedRevision !== undefined) {
      const current = loadTaskUiPreferences(target).data
      if (current.revision !== options.expectedRevision) {
        return { ok: false, issue: { code: 'conflict', message: 'Task preferences changed in another tab.', recoverable: true } }
      }
    }
    target.setItem(TASK_UI_PREFERENCES_KEY, JSON.stringify(preferences))
    return { ok: true, revision: preferences.revision }
  } catch (cause) {
    return { ok: false, issue: classifyWriteError(cause) }
  }
}

export interface TaskStorageChange {
  key: typeof TASK_STORAGE_KEY | typeof TASK_UI_PREFERENCES_KEY
  tasks?: TaskLoadResult<TaskStoreState>
  preferences?: TaskLoadResult<TaskUiPreferences>
}

/** Listen for browser cross-tab changes. Same-tab updates use the hook store subscriber. */
export function subscribeToTaskStorage(
  listener: (change: TaskStorageChange) => void,
  eventTarget: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window === 'undefined' ? null : window,
): () => void {
  if (!eventTarget) return () => undefined
  const handler = (event: Event) => {
    const storageEvent = event as StorageEvent
    if (storageEvent.key === TASK_STORAGE_KEY) {
      listener({ key: TASK_STORAGE_KEY, tasks: parseTaskRaw(storageEvent.newValue) })
    } else if (storageEvent.key === TASK_UI_PREFERENCES_KEY) {
      if (storageEvent.newValue === null) {
        listener({ key: TASK_UI_PREFERENCES_KEY, preferences: { data: createDefaultTaskUiPreferences(), source: 'empty' } })
      } else {
        try {
          const parsed: unknown = JSON.parse(storageEvent.newValue)
          listener({
            key: TASK_UI_PREFERENCES_KEY,
            preferences: validateTaskUiPreferences(parsed)
              ? { data: parsed, source: 'storage' }
              : { data: createDefaultTaskUiPreferences(), source: 'recovered', issue: { code: 'validation_failed', message: 'Invalid task UI preferences from another tab were ignored.', recoverable: true } },
          })
        } catch (cause) {
          listener({ key: TASK_UI_PREFERENCES_KEY, preferences: { data: createDefaultTaskUiPreferences(), source: 'recovered', issue: { code: 'corrupt_data', message: 'Corrupted task UI preferences from another tab were ignored.', cause, recoverable: true } } })
        }
      }
    }
  }
  eventTarget.addEventListener('storage', handler)
  return () => eventTarget.removeEventListener('storage', handler)
}
