import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createTaskDetailsStore,
  useTaskDetails,
  type TaskActionOutcome,
} from './useTaskDetails'
import { taskDetailsFromProjectTask } from '@/lib/taskMutations'
import { createTaskSharedMetadata, taskSharedMetadataFromState } from '@/lib/taskMetadata'
import type { ProjectTask } from '@/types/database'

const createdAt = '2026-11-02T12:00:00.000Z'
const projectTask: ProjectTask = {
  id: 'hook-regression-task',
  board_id: 'board-1',
  column_id: 'column-1',
  title: 'Persist the task workspace',
  description: 'Regression fixture',
  priority: 'medium',
  due_date: null,
  assignee_id: null,
  created_by: 'user-1',
  position: 0,
  created_at: createdAt,
}

const taskSeed = taskDetailsFromProjectTask(projectTask, {
  columnName: 'To Do',
  now: createdAt,
})

describe('shared task metadata hydration', () => {
  it('clones a foreign label instead of overwriting an existing task-scoped identity', () => {
    const store = createTaskDetailsStore(null)
    const metadata = createTaskSharedMetadata(['Release'], [], createdAt)
    const first = renderHook(() => useTaskDetails({ ...projectTask, id: 'foreign-label-a', task_metadata: metadata }, { store, actorId: 'user-1' }))
    const firstId = first.result.current.labels[0].id
    act(() => { first.result.current.updateLabel(firstId, { name: 'Launch' }) })
    const second = renderHook(() => useTaskDetails({ ...projectTask, id: 'foreign-label-b', task_metadata: metadata }, { store, actorId: 'user-1' }))
    act(() => { second.result.current.addLabel(firstId) })
    expect(second.result.current.labels.map(label => label.name).sort()).toEqual(['Launch', 'Release'])
    expect(second.result.current.labels.map(label => label.id)).not.toContain(firstId)
    expect(first.result.current.labels.map(label => label.name)).toEqual(['Launch'])
  })

  it('keeps same-named labels isolated when another task hydrates, renames, or deletes them', () => {
    const store = createTaskDetailsStore(null)
    const metadata = createTaskSharedMetadata(['Release'], [], createdAt)
    const taskA = { ...projectTask, id: 'label-task-a', task_metadata: metadata }
    const taskB = { ...projectTask, id: 'label-task-b', task_metadata: metadata }
    const first = renderHook(() => useTaskDetails(taskA, { store, actorId: 'user-1' }))
    const firstLabelId = first.result.current.labels[0].id
    act(() => { first.result.current.updateLabel(firstLabelId, { name: 'Launch' }) })
    const second = renderHook(({ task }) => useTaskDetails(task, { store, actorId: 'user-1' }), { initialProps: { task: taskB } })
    const secondLabelId = second.result.current.labels[0].id
    expect(secondLabelId).not.toBe(firstLabelId)
    expect(first.result.current.labels.map(label => label.name)).toEqual(['Launch'])
    expect(second.result.current.labels.map(label => label.name)).toEqual(['Release'])
    expect(second.result.current.allLabels.map(label => label.name)).toEqual(['Release'])
    second.rerender({ task: { ...taskB, task_metadata: { ...metadata, labels: metadata.labels.map(label => ({ ...label, color: 'rose' as const })) } } })
    expect(first.result.current.labels[0]).toMatchObject({ name: 'Launch', color: 'blue' })
    act(() => { second.result.current.deleteLabel(secondLabelId) })
    expect(first.result.current.labels[0].name).toBe('Launch')
    act(() => { second.result.current.createLabel('Launch', 'emerald') })
    expect(second.result.current.labels[0]).toMatchObject({ name: 'Launch', color: 'emerald' })
    expect(second.result.current.labels[0].id).not.toBe(firstLabelId)
    const saved = taskSharedMetadataFromState(first.result.current.task!, store.getSnapshot().state)
    expect(saved.labels[0]).toMatchObject({ id: firstLabelId, name: 'Launch' })
  })

  it('loads labels and checklists into a fresh browser store and removes stale local assignees', () => {
    const store = createTaskDetailsStore(null)
    store.hydrate()
    store.seed({ ...taskSeed, assigneeIds: ['stale-member'] }, { actorId: 'user-1' })
    const metadata = createTaskSharedMetadata(['Release'], [{ label: 'Check the release' }], createdAt)
    const remote = { ...projectTask, assignee_ids: ['user-1', 'user-2'], labels: ['Release'], task_metadata: metadata }
    const { result, rerender } = renderHook(({ task }) => useTaskDetails(task, { store, actorId: 'user-1' }), { initialProps: { task: remote } })
    expect(result.current.task?.assigneeIds).toEqual(['user-1', 'user-2'])
    expect(result.current.labels.map(label => label.name)).toEqual(['Release'])
    expect(result.current.task?.checklists).toEqual(metadata.checklists)
    rerender({ task: { ...remote, assignee_ids: [], labels: [], task_metadata: { schemaVersion: 1, labels: [], checklists: [] } } })
    expect(result.current.task?.assigneeIds).toEqual([])
    expect(result.current.task?.checklists).toEqual([])
    expect(result.current.labels).toEqual([])
  })

  it('keeps legacy local details for unversioned rows and supplies complete metadata to the save callback', () => {
    const store = createTaskDetailsStore(null)
    const onTaskChange = vi.fn()
    const { result } = renderHook(() => useTaskDetails({ ...projectTask, task_metadata: {} }, { store, actorId: 'user-1', onTaskChange }))
    act(() => { result.current.createLabel('Ready', 'emerald') })
    const latest = onTaskChange.mock.calls.at(-1)!
    expect(latest[0].labelIds).toHaveLength(1)
    expect(Object.values(latest[2].labels)).toEqual([expect.objectContaining({ name: 'Ready', color: 'emerald' })])
    act(() => { result.current.addChecklist('Local checklist') })
    expect(result.current.task?.checklists[0].title).toBe('Local checklist')
  })
})

describe('TaskDetailsStore resilience', () => {
  it('continues in session-only memory when localStorage is unavailable', () => {
    const store = createTaskDetailsStore(null)

    store.hydrate()
    expect(store.getSnapshot().hydrated).toBe(true)
    expect(store.getSnapshot().persistenceError).toMatchObject({
      code: 'unavailable',
      recoverable: true,
    })

    const seeded = store.seed(taskSeed, { actorId: 'user-1' })
    expect(seeded.ok).toBe(true)
    expect(store.getSnapshot().state.tasks[projectTask.id]).toEqual(taskSeed)

    const updated = store.dispatch(
      { type: 'update_title', taskId: projectTask.id, title: 'Session-only update' },
      { actorId: 'user-1' },
    )
    expect(updated.ok).toBe(true)
    expect(store.getSnapshot().state.tasks[projectTask.id]?.title).toBe('Session-only update')
    expect(store.getSnapshot().persistenceError?.message).toContain('kept for this tab only')

    expect(store.updatePreferences({ detailsPanel: 'activity' })).toBe(true)
    expect(store.getSnapshot().preferences.detailsPanel).toBe('activity')
    expect(store.getSnapshot().persistenceError?.code).toBe('unavailable')

    store.destroy()
  })

  it('provides one deterministic server snapshot independent of client hydration', () => {
    const first = createTaskDetailsStore(null)
    const second = createTaskDetailsStore(null)
    const serverSnapshot = first.getServerSnapshot()

    expect(first.getServerSnapshot()).toBe(serverSnapshot)
    expect(second.getServerSnapshot()).toBe(serverSnapshot)
    expect(serverSnapshot).toMatchObject({
      hydrated: false,
      state: { revision: 0, updatedAt: '1970-01-01T00:00:00.000Z' },
      preferences: { revision: 0, updatedAt: '1970-01-01T00:00:00.000Z' },
    })

    first.hydrate()
    expect(first.getSnapshot().hydrated).toBe(true)
    expect(first.getServerSnapshot()).toBe(serverSnapshot)

    first.destroy()
    second.destroy()
  })
})

describe('useTaskDetails hydration hand-off', () => {
  it('keeps the project task readable while the hydrated store is waiting for its seed', () => {
    const store = createTaskDetailsStore(null)
    store.hydrate()
    const unchanged: TaskActionOutcome = {
      ok: true,
      result: {
        state: store.getSnapshot().state,
        changed: false,
        taskId: projectTask.id,
      },
    }
    const seed = vi.spyOn(store, 'seed').mockReturnValue(unchanged)

    const { result, unmount } = renderHook(() =>
      useTaskDetails(projectTask, { actorId: 'user-1', store }),
    )

    expect(result.current.hydrated).toBe(true)
    expect(seed).toHaveBeenCalledWith(
      expect.objectContaining({ id: projectTask.id, title: projectTask.title }),
      expect.objectContaining({ actorId: 'user-1' }),
    )
    expect(result.current.task).toMatchObject({
      id: projectTask.id,
      title: projectTask.title,
      boardId: projectTask.board_id,
    })
    expect(store.getSnapshot().state.tasks[projectTask.id]).toBeUndefined()

    act(() => unmount())
    store.destroy()
  })

  it('does not reseed a task while its local trash tombstone exists', () => {
    const store = createTaskDetailsStore(null)
    store.hydrate()
    expect(store.seed(taskSeed, { actorId: 'user-1' }).ok).toBe(true)
    expect(
      store.dispatch(
        { type: 'delete_task', taskId: projectTask.id },
        { actorId: 'user-1' },
      ).ok,
    ).toBe(true)

    const seed = vi.spyOn(store, 'seed')
    const { result, unmount } = renderHook(() =>
      useTaskDetails(projectTask, { actorId: 'user-1', store }),
    )

    expect(result.current.hydrated).toBe(true)
    expect(result.current.task).toBeUndefined()
    expect(seed).not.toHaveBeenCalled()
    expect(store.getSnapshot().state.tasks[projectTask.id]).toBeUndefined()
    expect(
      Object.values(store.getSnapshot().state.trash).some(
        (entry) => entry.task.id === projectTask.id,
      ),
    ).toBe(true)

    act(() => unmount())
    store.destroy()
  })

  it('supports the member and checklist item convenience aliases', () => {
    const store = createTaskDetailsStore(null)
    store.hydrate()
    const { result, unmount } = renderHook(() =>
      useTaskDetails(projectTask, { actorId: 'user-1', store }),
    )

    act(() => {
      expect(result.current.toggleMember('user-2').ok).toBe(true)
    })
    expect(result.current.task?.assigneeIds).toContain('user-2')

    act(() => {
      expect(result.current.addChecklist('QA').ok).toBe(true)
    })
    const checklistId = result.current.task?.checklists[0]?.id
    expect(checklistId).toBeTruthy()

    act(() => {
      expect(result.current.addItem(checklistId!, 'Verify the alias').ok).toBe(true)
    })
    const itemId = result.current.task?.checklists[0]?.items[0]?.id
    expect(itemId).toBeTruthy()

    act(() => {
      expect(result.current.toggleItem(checklistId!, itemId!).ok).toBe(true)
    })
    expect(result.current.task?.checklists[0]?.items[0]?.completed).toBe(true)

    act(() => {
      expect(result.current.deleteItem(checklistId!, itemId!).ok).toBe(true)
      expect(result.current.toggleMember('user-2').ok).toBe(true)
    })
    expect(result.current.task?.checklists[0]?.items).toHaveLength(0)
    expect(result.current.task?.assigneeIds).not.toContain('user-2')

    act(() => unmount())
    store.destroy()
  })
})
