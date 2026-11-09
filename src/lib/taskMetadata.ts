import type { Checklist, ChecklistItem, LabelColor, TaskDetails, TaskLabel, TaskSharedMetadata, TaskStoreState } from '@/types/task'

const colors = new Set<LabelColor>(['slate', 'rose', 'orange', 'amber', 'emerald', 'sky', 'blue', 'violet', 'pink'])
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const timestamp = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const dateOnly = (value: unknown) => {
  if (value === undefined) return true
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
const string = (value: unknown): value is string => typeof value === 'string' && value.length > 0

function validItem(value: unknown): value is ChecklistItem {
  return record(value) && string(value.id) && string(value.text) && value.text.trim().length > 0 && value.text.length <= 500 && typeof value.completed === 'boolean'
    && (value.assigneeId === undefined || string(value.assigneeId)) && dateOnly(value.dueDate)
    && Number.isInteger(value.order) && Number(value.order) >= 0 && timestamp(value.createdAt) && timestamp(value.updatedAt)
}

function validChecklist(value: unknown): value is Checklist {
  return record(value) && string(value.id) && string(value.title) && typeof value.hideCompleted === 'boolean'
    && Number.isInteger(value.order) && Number(value.order) >= 0 && timestamp(value.createdAt) && timestamp(value.updatedAt)
    && Array.isArray(value.items) && value.items.every(validItem) && new Set(value.items.map(item => item.id)).size === value.items.length
    && new Set(value.items.map(item => item.order)).size === value.items.length
}

function validLabel(value: unknown): value is TaskLabel {
  return record(value) && string(value.id) && string(value.name) && colors.has(value.color as LabelColor)
    && timestamp(value.createdAt) && timestamp(value.updatedAt)
}

/** An unversioned migration default leaves pre-existing browser-only details intact. */
export function parseTaskSharedMetadata(value: unknown): TaskSharedMetadata | undefined {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.labels) || !Array.isArray(value.checklists)) return undefined
  if (!value.labels.every(validLabel) || !value.checklists.every(validChecklist)) return undefined
  if (new Set(value.labels.map(label => label.id)).size !== value.labels.length || new Set(value.checklists.map(checklist => checklist.id)).size !== value.checklists.length
    || new Set(value.checklists.map(checklist => checklist.order)).size !== value.checklists.length) return undefined
  return { schemaVersion: 1, labels: value.labels, checklists: value.checklists }
}

export const readTaskSharedMetadata = parseTaskSharedMetadata

export function taskScopedLabelId(taskId: string, labelId: string): string {
  const prefix = `task-label:${encodeURIComponent(taskId)}:`
  if (labelId.startsWith(prefix)) return labelId
  const scoped = /^task-label:[^:]*:(.*)$/.exec(labelId)
  let sourceId = labelId
  if (scoped) {
    try { sourceId = decodeURIComponent(scoped[1]) } catch { /* Keep a malformed legacy ID distinct. */ }
  }
  return prefix + encodeURIComponent(sourceId)
}

export function labelBelongsToTask(taskId: string, labelId: string): boolean {
  return labelId.startsWith(`task-label:${encodeURIComponent(taskId)}:`)
}

export function scopeTaskSharedMetadata(taskId: string, metadata: TaskSharedMetadata): TaskSharedMetadata {
  return { ...metadata, labels: metadata.labels.map(label => ({ ...label, id: taskScopedLabelId(taskId, label.id) })) }
}

export function createTaskSharedMetadata(
  labels: string[],
  checklistItems: Array<{ label: string; completed?: boolean }>,
  now = new Date().toISOString(),
): TaskSharedMetadata {
  const seen = new Set<string>()
  const records: TaskLabel[] = []
  for (const rawName of labels) {
    const name = rawName.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    records.push({ id: `shared-label:${encodeURIComponent(key)}`, name, color: 'blue', createdAt: now, updatedAt: now })
  }
  const items = checklistItems.filter(item => item.label.trim()).map((item, order) => ({
    id: `item-${crypto.randomUUID()}`, text: item.label.trim(), completed: Boolean(item.completed), order, createdAt: now, updatedAt: now,
  }))
  return {
    schemaVersion: 1,
    labels: records,
    checklists: items.length ? [{ id: `checklist-${crypto.randomUUID()}`, title: 'Checklist', items, hideCompleted: false, order: 0, createdAt: now, updatedAt: now }] : [],
  }
}

export function taskSharedMetadataFromState(task: TaskDetails, state: TaskStoreState): TaskSharedMetadata {
  return scopeTaskSharedMetadata(task.id, { schemaVersion: 1, labels: task.labelIds.map(id => state.labels[id]).filter((label): label is TaskLabel => Boolean(label)), checklists: task.checklists })
}

export function isSharedTaskMetadataMutation(type: string): boolean {
  return ['create_label', 'update_label', 'delete_label', 'add_label', 'remove_label', 'add_checklist', 'rename_checklist', 'delete_checklist',
    'toggle_checklist_visibility', 'reorder_checklists', 'add_checklist_item', 'update_checklist_item', 'toggle_checklist_item', 'delete_checklist_item', 'reorder_checklist_items'].includes(type)
}
