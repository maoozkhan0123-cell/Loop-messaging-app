import type { createClient } from '@/lib/supabase/client'
import type { ProjectTask, TaskChecklistItem, TaskPriority } from '@/types/database'
import { createTaskSharedMetadata, parseTaskSharedMetadata } from '@/lib/taskMetadata'
import type { TaskSharedMetadata } from '@/types/task'

export type CreateTaskChecklistInput = Pick<TaskChecklistItem, 'label'> & Partial<Pick<TaskChecklistItem, 'completed'>>

export type CreateDashboardTaskInput = {
  id?: string
  boardId: string
  columnId: string
  title: string
  description?: string
  priority: TaskPriority
  /** Kept for callers that still assign one person. An explicit assigneeIds list takes precedence. */
  assigneeId?: string
  assigneeIds?: string[]
  dueDate?: string | null
  startDate?: string | null
  estimatedHours?: number
  labels?: string[]
  checklistItems?: CreateTaskChecklistInput[]
  /** Preserve full shared details when duplicating an existing task. */
  taskMetadata?: TaskSharedMetadata
}

type TaskCreationClient = Pick<ReturnType<typeof createClient>, 'rpc'>

function dateOnly(value: string | null | undefined, name: string) {
  const date = value?.trim()
  if (!date) return null
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${name} must be a valid date.`)
  }
  return date
}

/** One database transaction creates the task and all requested metadata under the caller's RLS. */
export async function createDashboardTask(supabase: TaskCreationClient, input: CreateDashboardTaskInput, position = 0): Promise<ProjectTask> {
  const title = input.title.trim()
  if (!title || title.length > 240) throw new Error('Task title must contain between 1 and 240 characters.')
  if (!input.boardId || !input.columnId) throw new Error('Choose a project and a task list.')
  const startDate = dateOnly(input.startDate, 'Start date')
  const dueDate = dateOnly(input.dueDate, 'Due date')
  if (startDate && dueDate && startDate > dueDate) throw new Error('Due date must be on or after the start date.')
  if (input.estimatedHours !== undefined && (!Number.isFinite(input.estimatedHours) || input.estimatedHours < 0)) {
    throw new Error('Estimated hours must be zero or greater.')
  }

  const assigneeIds = Array.from(new Set((input.assigneeIds ?? (input.assigneeId ? [input.assigneeId] : [])).map((id) => id.trim()).filter(Boolean)))
  const parsedMetadata = input.taskMetadata ? parseTaskSharedMetadata(input.taskMetadata) : undefined
  if (input.taskMetadata && !parsedMetadata) throw new Error('Task labels or checklists contain invalid details. Refresh the task before trying again.')
  const labelNames = new Set<string>()
  const normalizeLabelName = (rawName: string) => {
    const label = rawName.trim()
    if (!label) return null
    if (label.length > 80) throw new Error('Each label must contain no more than 80 characters.')
    const key = label.toLowerCase()
    if (labelNames.has(key)) return null
    labelNames.add(key)
    return label
  }
  const providedMetadata = parsedMetadata ? {
    ...parsedMetadata,
    labels: parsedMetadata.labels.flatMap((label) => {
      const name = normalizeLabelName(label.name)
      return name ? [{ ...label, name }] : []
    }),
  } : undefined
  const labels = providedMetadata ? providedMetadata.labels.map((label) => label.name) : (input.labels ?? []).flatMap((label) => {
    const name = normalizeLabelName(label)
    return name ? [name] : []
  })
  const checklistItems = (input.checklistItems ?? []).map((item) => ({ label: item.label.trim(), completed: item.completed ?? false })).filter((item) => {
    if (item.label.length > 500) throw new Error('Each checklist item must contain no more than 500 characters.')
    return Boolean(item.label)
  })

  const { data, error } = await supabase.rpc('create_project_task', {
    p_board_id: input.boardId,
    p_column_id: input.columnId,
    p_title: title,
    p_description: input.description?.trim() || null,
    p_priority: input.priority,
    p_assignee_ids: assigneeIds,
    p_due_date: dueDate,
    p_start_date: startDate,
    p_labels: labels,
    p_task_metadata: providedMetadata ?? createTaskSharedMetadata(labels, checklistItems),
    p_position: position,
    p_task_id: input.id || null,
    p_estimated_hours: input.estimatedHours ?? null,
  }).single()

  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      throw new Error('Task creation needs a database update. Please ask your administrator to apply the task creation migration.')
    }
    if (error.code === '23503') throw new Error('A selected project, list, or assignee is no longer available. Refresh the page and try again.')
    if (error.code === '42501') throw new Error('You do not have permission to create tasks in this project. Check your session and project access.')
    throw new Error(error.message || 'Task could not be created. Please try again.')
  }
  if (!data) throw new Error('The server did not return the created task. Refresh the project before trying again.')
  return { ...(data as ProjectTask), assignee_ids: assigneeIds }
}
