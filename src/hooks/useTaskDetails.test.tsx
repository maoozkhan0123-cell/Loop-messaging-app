import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createTaskDetailsStore,
  useTaskDetails,
  type TaskActionOutcome,
} from './useTaskDetails'
import { taskDetailsFromProjectTask } from '@/lib/taskMutations'
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
