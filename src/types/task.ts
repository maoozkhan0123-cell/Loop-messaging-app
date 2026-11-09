/**
 * Backend-agnostic task workspace domain types.
 *
 * Binary attachment data intentionally does not live in this graph. `storageKey`
 * points at IndexedDB (or a future remote object store); localStorage only keeps
 * the small, serializable metadata below.
 */

export const TASK_STORE_SCHEMA_VERSION = 2 as const
export const TASK_UI_SCHEMA_VERSION = 1 as const

export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'
export type EstimateUnit = 'points' | 'hours'
export type DependencyRelation = 'blocks' | 'blocked_by' | 'relates_to'
export type ActivityFilter = 'all' | 'comments' | 'history'
export type LabelColor =
  | 'slate'
  | 'rose'
  | 'orange'
  | 'amber'
  | 'emerald'
  | 'sky'
  | 'blue'
  | 'violet'
  | 'pink'

export type TaskCoverColorPreset =
  | 'slate'
  | 'indigo'
  | 'blue'
  | 'teal'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'plum'

export type TaskCoverGradientPreset =
  | 'midnight'
  | 'ocean'
  | 'aurora'
  | 'sunrise'
  | 'berry'
  | 'slate-sky'

export type TaskCoverImageMimeType =
  | 'image/avif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'

export interface TaskMember {
  id: string
  name: string
  email?: string
  avatarUrl?: string
  initials: string
  role?: string
}

export interface TaskLabel {
  id: string
  name: string
  color: LabelColor
  createdAt: string
  updatedAt: string
}

export interface ChecklistItem {
  id: string
  text: string
  completed: boolean
  assigneeId?: string
  dueDate?: string
  order: number
  createdAt: string
  updatedAt: string
}

export interface Checklist {
  id: string
  title: string
  items: ChecklistItem[]
  hideCompleted: boolean
  order: number
  createdAt: string
  updatedAt: string
}

/** Rich task fields shared through the project's authenticated task record. */
export interface TaskSharedMetadata {
  schemaVersion: 1
  labels: TaskLabel[]
  checklists: Checklist[]
}

export interface TaskAttachment {
  id: string
  taskId: string
  name: string
  mimeType: string
  sizeBytes: number
  storageKey: string
  uploadedBy: string
  createdAt: string
}

export interface TaskComment {
  id: string
  taskId: string
  authorId: string
  parentCommentId?: string
  body: string
  mentionIds: string[]
  attachmentIds: string[]
  /** Emoji -> unique user IDs. Counts are always derived from these sets. */
  reactions: Record<string, string[]>
  createdAt: string
  updatedAt?: string
  deletedAt?: string
}

export interface TaskDependency {
  id: string
  taskId: string
  targetTaskId: string
  relation: DependencyRelation
  createdBy: string
  createdAt: string
}

export type ActivityEventType =
  | 'task_created'
  | 'title_changed'
  | 'description_changed'
  | 'cover_changed'
  | 'status_changed'
  | 'priority_changed'
  | 'dates_changed'
  | 'estimate_changed'
  | 'assignee_added'
  | 'assignee_removed'
  | 'label_added'
  | 'label_removed'
  | 'label_created'
  | 'label_updated'
  | 'label_deleted'
  | 'checklist_created'
  | 'checklist_renamed'
  | 'checklist_removed'
  | 'checklist_reordered'
  | 'checklist_visibility_changed'
  | 'checklist_item_created'
  | 'checklist_item_updated'
  | 'checklist_item_completed'
  | 'checklist_item_removed'
  | 'checklist_item_reordered'
  | 'comment_added'
  | 'comment_updated'
  | 'comment_removed'
  | 'reaction_added'
  | 'reaction_removed'
  | 'dependency_added'
  | 'dependency_removed'
  | 'watch_started'
  | 'watch_stopped'
  | 'attachment_added'
  | 'attachment_removed'
  | 'task_duplicated'
  | 'task_moved'
  | 'parent_changed'
  | 'task_archived'
  | 'task_restored'
  | 'task_deleted'

export interface ActivityEvent {
  id: string
  taskId: string
  actorId: string
  type: ActivityEventType
  timestamp: string
  previousValue?: unknown
  newValue?: unknown
  metadata?: Record<string, unknown>
}

export interface TaskEstimate {
  value: number
  unit: EstimateUnit
}

export interface TaskReminder {
  offsetMinutes: number
  enabled: boolean
}

export type TaskCover =
  | {
      type: 'color'
      /** A safe preset ID; raw CSS is deliberately not persisted. */
      value: TaskCoverColorPreset
    }
  | {
      type: 'gradient'
      /** A safe preset ID; raw CSS is deliberately not persisted. */
      value: TaskCoverGradientPreset
    }
  | {
      type: 'image'
      /** IndexedDB storage key. Binary data never enters localStorage. */
      value: string
      mimeType: TaskCoverImageMimeType
      width: number
      height: number
      /** Vertical object-position percentage. */
      positionY: number
    }

export interface TaskDetails {
  /** Stable ID inherited from ProjectTask whenever a task is hydrated. */
  id: string
  key: string
  projectId: string
  boardId: string
  /** Preserved so the existing Kanban board can map workflow status back. */
  columnId: string
  sprintId?: string
  parentTaskId?: string

  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  assigneeIds: string[]
  labelIds: string[]
  estimate?: TaskEstimate
  startDate?: string
  dueDate?: string
  reminder?: TaskReminder

  dependencyIds: string[]
  checklists: Checklist[]
  attachmentIds: string[]
  commentIds: string[]
  cover?: TaskCover
  watcherIds: string[]

  archivedAt?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
  version: number
}

export interface TaskTrashEntry {
  id: string
  task: TaskDetails
  comments: TaskComment[]
  attachments: TaskAttachment[]
  dependencies: TaskDependency[]
  activity: ActivityEvent[]
  deletedAt: string
  deletedBy: string
}

/** Normalized serializable graph stored under workspace:tasks:v2. */
export interface TaskStoreState {
  schemaVersion: typeof TASK_STORE_SCHEMA_VERSION
  /** Monotonic revision used for compare-before-write conflict detection. */
  revision: number
  updatedAt: string
  tasks: Record<string, TaskDetails>
  comments: Record<string, TaskComment>
  attachments: Record<string, TaskAttachment>
  dependencies: Record<string, TaskDependency>
  labels: Record<string, TaskLabel>
  activity: Record<string, ActivityEvent>
  trash: Record<string, TaskTrashEntry>
}

export interface TaskUiPreferences {
  schemaVersion: typeof TASK_UI_SCHEMA_VERSION
  revision: number
  activityFilter: ActivityFilter
  isFullscreen: boolean
  detailsPanel: 'details' | 'activity'
  updatedAt: string
}

export type TaskPersistenceErrorCode =
  | 'unavailable'
  | 'corrupt_data'
  | 'validation_failed'
  | 'quota_exceeded'
  | 'write_failed'
  | 'conflict'

export interface TaskPersistenceIssue {
  code: TaskPersistenceErrorCode
  message: string
  cause?: unknown
  recoverable: boolean
}

export interface TaskMutationContext {
  actorId: string
  now?: () => string
  idFactory?: (kind: 'task' | 'checklist' | 'item' | 'comment' | 'dependency' | 'activity' | 'label' | 'trash') => string
  canManageAllComments?: boolean
}

export interface TaskMutationResult {
  state: TaskStoreState
  changed: boolean
  taskId?: string
  entityId?: string
  activityId?: string
}

export interface ChecklistProgress {
  completed: number
  total: number
  percentage: number
}
