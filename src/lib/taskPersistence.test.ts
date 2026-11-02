import { describe, expect, it } from 'vitest'
import type { ProjectTask } from '@/types/database'
import { applyTaskMutation, taskDetailsFromProjectTask } from './taskMutations'
import {
  createDefaultTaskUiPreferences,
  createEmptyTaskStore,
  loadTaskStore,
  loadTaskUiPreferences,
  migrateTaskStore,
  persistTaskStore,
  persistTaskUiPreferences,
  subscribeToTaskStorage,
  TASK_STORAGE_KEY,
  TASK_UI_PREFERENCES_KEY,
  type TaskStorageLike,
} from './taskPersistence'

class MemoryStorage implements TaskStorageLike {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const task: ProjectTask = {
  id: 'task-1', board_id: 'board-1', column_id: 'todo', title: 'Persist me', description: null,
  priority: 'medium', due_date: null, assignee_id: null, created_by: 'user-1', position: 0,
  created_at: '2026-11-02T12:00:00.000Z',
}

function populatedState() {
  return applyTaskMutation(
    createEmptyTaskStore('2026-11-02T12:00:00.000Z'),
    { type: 'seed_task', task: taskDetailsFromProjectTask(task, { status: 'todo' }) },
    { actorId: 'user-1', now: () => '2026-11-02T12:00:00.000Z' },
  ).state
}

describe('task persistence', () => {
  it('round-trips the versioned task graph and preferences', () => {
    const storage = new MemoryStorage()
    const state = populatedState()
    expect(persistTaskStore(state, { storage, expectedRevision: 0 })).toEqual({ ok: true, revision: 1 })
    expect(loadTaskStore(storage).data.tasks['task-1'].title).toBe('Persist me')

    const preferences = { ...createDefaultTaskUiPreferences(), revision: 1, activityFilter: 'history' as const }
    expect(persistTaskUiPreferences(preferences, { storage, expectedRevision: 0 }).ok).toBe(true)
    expect(loadTaskUiPreferences(storage).data.activityFilter).toBe('history')
    expect(storage.values.has(TASK_STORAGE_KEY)).toBe(true)
    expect(storage.values.has(TASK_UI_PREFERENCES_KEY)).toBe(true)
  })

  it('recovers safely from corrupt JSON', () => {
    const storage = new MemoryStorage()
    storage.setItem(TASK_STORAGE_KEY, '{not-json')
    const result = loadTaskStore(storage)
    expect(result.source).toBe('recovered')
    expect(result.issue?.code).toBe('corrupt_data')
    expect(result.data.tasks).toEqual({})
  })

  it('migrates a v1 task collection while preserving stable IDs', () => {
    const migrated = migrateTaskStore({
      version: 1,
      tasks: [{ ...task, status: 'In Progress', checklists: [{ title: 'QA', items: [{ id: 'old-item', label: 'Test', completed: true }] }] }],
    }, '2026-11-02T13:00:00.000Z')
    expect(migrated?.schemaVersion).toBe(2)
    expect(migrated?.tasks['task-1']).toMatchObject({ id: 'task-1', status: 'in_progress' })
    expect(migrated?.tasks['task-1'].checklists[0].items[0].id).toBe('old-item')
  })

  it('rejects a stale-tab write instead of overwriting newer data', () => {
    const storage = new MemoryStorage()
    const first = populatedState()
    expect(persistTaskStore(first, { storage, expectedRevision: 0 }).ok).toBe(true)
    const newer = { ...first, revision: 2, updatedAt: '2026-11-02T14:00:00.000Z' }
    expect(persistTaskStore(newer, { storage, expectedRevision: 1 }).ok).toBe(true)
    const staleAttempt = { ...first, revision: 2, updatedAt: '2026-11-02T15:00:00.000Z' }
    const result = persistTaskStore(staleAttempt, { storage, expectedRevision: 1 })
    expect(result).toMatchObject({ ok: false, issue: { code: 'conflict' } })
    expect(loadTaskStore(storage).data.updatedAt).toBe('2026-11-02T14:00:00.000Z')
  })

  it('surfaces quota failures without modifying the previous state', () => {
    const storage: TaskStorageLike = {
      getItem: () => null,
      setItem: () => {
        const error = new Error('full')
        error.name = 'QuotaExceededError'
        throw error
      },
    }
    const result = persistTaskStore(populatedState(), { storage, expectedRevision: 0 })
    expect(result).toMatchObject({ ok: false, issue: { code: 'quota_exceeded', recoverable: true } })
  })

  it('publishes valid task state received through a cross-tab storage event', () => {
    const listeners = new Set<EventListener>()
    const target = {
      addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') listeners.add(listener)
      },
      removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
        if (typeof listener === 'function') listeners.delete(listener)
      },
    }
    const changes: string[] = []
    const stop = subscribeToTaskStorage((change) => {
      if (change.tasks) changes.push(change.tasks.data.tasks['task-1']?.title ?? 'empty')
    }, target as Pick<Window, 'addEventListener' | 'removeEventListener'>)
    const event = new StorageEvent('storage', { key: TASK_STORAGE_KEY, newValue: JSON.stringify(populatedState()) })
    listeners.forEach((listener) => listener(event))
    expect(changes).toEqual(['Persist me'])
    stop()
    expect(listeners.size).toBe(0)
  })
})
