import { describe, expect, it } from 'vitest'
import type { ProjectTask } from '@/types/database'
import { applyTaskMutation, TaskDomainError, taskDetailsFromProjectTask } from './taskMutations'
import { createEmptyTaskStore, validateTaskStore } from './taskPersistence'

const at = '2026-11-02T12:00:00.000Z'
const source: ProjectTask = {
  id: 'task-cover-1',
  board_id: 'board-1',
  column_id: 'todo',
  title: 'Cover task',
  description: null,
  priority: 'medium',
  due_date: null,
  assignee_id: null,
  created_by: 'user-1',
  position: 0,
  created_at: at,
}

function seededState() {
  return applyTaskMutation(
    createEmptyTaskStore(at),
    { type: 'seed_task', task: taskDetailsFromProjectTask(source, { status: 'todo' }) },
    { actorId: 'user-1', now: () => at },
  ).state
}

describe('task cover domain', () => {
  it('sets and removes covers with one structured audit event per actual change', () => {
    let sequence = 0
    const context = { actorId: 'user-1', now: () => at, idFactory: () => `activity-${++sequence}` as string }
    const initial = seededState()
    const added = applyTaskMutation(initial, {
      type: 'set_cover',
      taskId: source.id,
      cover: { type: 'gradient', value: 'ocean' },
    }, context)

    expect(added.state.tasks[source.id].cover).toEqual({ type: 'gradient', value: 'ocean' })
    expect(Object.values(added.state.activity)).toContainEqual(expect.objectContaining({
      type: 'cover_changed',
      previousValue: undefined,
      newValue: { type: 'gradient', value: 'ocean' },
      metadata: { action: 'added', previousType: 'none', nextType: 'gradient' },
    }))
    expect(validateTaskStore(added.state)).toBe(true)

    const unchanged = applyTaskMutation(added.state, {
      type: 'set_cover', taskId: source.id, cover: { type: 'gradient', value: 'ocean' },
    }, context)
    expect(unchanged.changed).toBe(false)
    expect(Object.values(unchanged.state.activity)).toHaveLength(1)

    const removed = applyTaskMutation(unchanged.state, { type: 'set_cover', taskId: source.id }, context)
    expect(removed.state.tasks[source.id].cover).toBeUndefined()
    expect(Object.values(removed.state.activity).at(-1)).toMatchObject({
      type: 'cover_changed',
      metadata: { action: 'removed', previousType: 'gradient', nextType: 'none' },
    })
  })

  it('rejects malformed image metadata before state changes', () => {
    expect(() => applyTaskMutation(seededState(), {
      type: 'set_cover',
      taskId: source.id,
      cover: { type: 'image', value: 'key', mimeType: 'image/png', width: 1200, height: 400, positionY: 101 },
    }, { actorId: 'user-1', now: () => at })).toThrowError(TaskDomainError)
  })
})
