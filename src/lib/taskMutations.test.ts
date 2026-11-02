import { describe, expect, it } from 'vitest'
import type { ProjectTask } from '@/types/database'
import { createEmptyTaskStore, validateTaskStore } from './taskPersistence'
import {
  applyTaskMutation,
  getChecklistProgress,
  TaskDomainError,
  taskDetailsFromProjectTask,
  type TaskMutation,
} from './taskMutations'
import type { TaskComment, TaskMutationContext } from '@/types/task'

const now = '2026-11-02T12:00:00.000Z'

function projectTask(id: string, overrides: Partial<ProjectTask> = {}): ProjectTask {
  return {
    id,
    board_id: 'board-1',
    column_id: 'todo-column',
    title: `Task ${id}`,
    description: null,
    priority: 'medium',
    due_date: null,
    assignee_id: null,
    created_by: 'author-1',
    position: 0,
    created_at: now,
    ...overrides,
  }
}

function harness(...ids: string[]) {
  let counter = 0
  const context: TaskMutationContext = {
    actorId: 'user-1',
    now: () => now,
    idFactory: (kind) => `${kind}-${++counter}`,
  }
  let state = createEmptyTaskStore(now)
  ids.forEach((id) => {
    state = applyTaskMutation(state, { type: 'seed_task', task: taskDetailsFromProjectTask(projectTask(id), { status: 'todo' }) }, context).state
  })
  const mutate = (mutation: TaskMutation) => {
    const result = applyTaskMutation(state, mutation, context)
    state = result.state
    return result
  }
  return { context, mutate, get state() { return state } }
}

describe('task mutations', () => {
  it('logs only real validated changes', () => {
    const app = harness('task-1')
    const unchanged = app.mutate({ type: 'update_title', taskId: 'task-1', title: '  Task task-1  ' })
    expect(unchanged.changed).toBe(false)
    expect(Object.values(app.state.activity)).toHaveLength(0)

    const changed = app.mutate({ type: 'update_status', taskId: 'task-1', status: 'in_progress', columnId: 'doing-column' })
    expect(changed.changed).toBe(true)
    expect(app.state.tasks['task-1']).toMatchObject({ status: 'in_progress', columnId: 'doing-column' })
    expect(Object.values(app.state.activity)).toEqual([
      expect.objectContaining({ type: 'status_changed', previousValue: 'todo', newValue: 'in_progress' }),
    ])
    expect(validateTaskStore(app.state)).toBe(true)
  })

  it('validates date ranges and estimates before changing state', () => {
    const app = harness('task-1')
    expect(() => app.mutate({ type: 'set_dates', taskId: 'task-1', startDate: '2026-11-10', dueDate: '2026-11-09' }))
      .toThrowError(new TaskDomainError('Due date cannot be before the start date.', 'invalid_input'))
    expect(() => app.mutate({ type: 'set_estimate', taskId: 'task-1', estimate: { value: 4, unit: 'points' } }))
      .toThrow('Story points must be 1, 2, 3, 5, 8, or 13.')
    expect(app.state.revision).toBe(1)
  })

  it('keeps checklist item IDs stable while reordering and derives progress', () => {
    const app = harness('task-1')
    const checklistId = app.mutate({ type: 'add_checklist', taskId: 'task-1', title: 'QA' }).entityId!
    const firstId = app.mutate({ type: 'add_checklist_item', taskId: 'task-1', checklistId, text: 'Desktop' }).entityId!
    const secondId = app.mutate({ type: 'add_checklist_item', taskId: 'task-1', checklistId, text: 'Mobile' }).entityId!
    app.mutate({ type: 'toggle_checklist_item', taskId: 'task-1', checklistId, itemId: secondId })
    app.mutate({ type: 'reorder_checklist_items', taskId: 'task-1', checklistId, orderedIds: [secondId, firstId] })

    const checklist = app.state.tasks['task-1'].checklists[0]
    expect(checklist.items.map((item) => item.id)).toEqual([secondId, firstId])
    expect(getChecklistProgress(checklist)).toEqual({ completed: 1, total: 2, percentage: 50 })
    expect(validateTaskStore(app.state)).toBe(true)
  })

  it('prevents duplicate and circular blocking dependencies', () => {
    const app = harness('a', 'b', 'c')
    app.mutate({ type: 'add_dependency', taskId: 'a', targetTaskId: 'b', relation: 'blocks' })
    app.mutate({ type: 'add_dependency', taskId: 'b', targetTaskId: 'c', relation: 'blocks' })
    expect(() => app.mutate({ type: 'add_dependency', taskId: 'c', targetTaskId: 'a', relation: 'blocks' }))
      .toThrow('blocking cycle')
    expect(() => app.mutate({ type: 'add_dependency', taskId: 'b', targetTaskId: 'a', relation: 'blocked_by' }))
      .toThrow('already exists')
    expect(validateTaskStore(app.state)).toBe(true)
  })

  it('stores reaction participants as unique IDs and enforces comment ownership', () => {
    const app = harness('task-1')
    const commentId = app.mutate({ type: 'add_comment', taskId: 'task-1', body: 'Ready for QA' }).entityId!
    app.mutate({ type: 'toggle_reaction', commentId, emoji: '👍' })
    expect(app.state.comments[commentId].reactions['👍']).toEqual(['user-1'])
    app.mutate({ type: 'toggle_reaction', commentId, emoji: '👍' })
    expect(app.state.comments[commentId].reactions['👍']).toBeUndefined()

    expect(() => applyTaskMutation(app.state, { type: 'update_comment', commentId, body: 'Changed' }, { ...app.context, actorId: 'someone-else' }))
      .toThrow('only edit your own')
  })

  it('duplicates without discussion history and supports recoverable deletion', () => {
    const app = harness('task-1')
    app.mutate({ type: 'add_comment', taskId: 'task-1', body: 'Do not copy me' })
    const checklistId = app.mutate({ type: 'add_checklist', taskId: 'task-1', title: 'Release' }).entityId!
    app.mutate({ type: 'add_checklist_item', taskId: 'task-1', checklistId, text: 'Ship' })

    const duplicateId = app.mutate({ type: 'duplicate_task', taskId: 'task-1' }).taskId!
    expect(app.state.tasks[duplicateId].commentIds).toEqual([])
    expect(app.state.tasks[duplicateId].checklists[0].id).not.toBe(checklistId)

    app.mutate({ type: 'archive_task', taskId: duplicateId })
    app.mutate({ type: 'restore_task', taskId: duplicateId })
    expect(app.state.tasks[duplicateId].archivedAt).toBeUndefined()

    const trashId = app.mutate({ type: 'delete_task', taskId: duplicateId }).entityId!
    expect(app.state.tasks[duplicateId]).toBeUndefined()
    expect(app.state.trash[trashId].task.id).toBe(duplicateId)
    app.mutate({ type: 'restore_from_trash', trashId })
    expect(app.state.tasks[duplicateId]).toBeDefined()
    expect(app.state.trash[trashId]).toBeUndefined()
    expect(validateTaskStore(app.state)).toBe(true)
  })

  it('moves a task across workspaces and records the complete transition', () => {
    const app = harness('task-1')

    const result = app.mutate({
      type: 'move_task',
      taskId: 'task-1',
      boardId: 'board-2',
      projectId: 'project-2',
      columnId: 'review-column',
      status: 'in_review',
    })

    expect(result.changed).toBe(true)
    expect(app.state.tasks['task-1']).toMatchObject({
      boardId: 'board-2',
      projectId: 'project-2',
      columnId: 'review-column',
      status: 'in_review',
      version: 2,
    })
    expect(app.state.activity[result.activityId!]).toMatchObject({
      taskId: 'task-1',
      actorId: 'user-1',
      type: 'task_moved',
      previousValue: {
        boardId: 'board-1',
        projectId: 'board-1',
        columnId: 'todo-column',
        status: 'todo',
      },
      newValue: {
        boardId: 'board-2',
        projectId: 'project-2',
        columnId: 'review-column',
        status: 'in_review',
      },
    })

    const activityCount = Object.keys(app.state.activity).length
    const unchanged = app.mutate({
      type: 'move_task',
      taskId: 'task-1',
      boardId: 'board-2',
      projectId: 'project-2',
      columnId: 'review-column',
      status: 'in_review',
    })
    expect(unchanged.changed).toBe(false)
    expect(Object.keys(app.state.activity)).toHaveLength(activityCount)
    expect(validateTaskStore(app.state)).toBe(true)
  })

  it('sets a parent while rejecting self-parenting and hierarchy cycles', () => {
    const app = harness('parent', 'child', 'grandchild')

    const childResult = app.mutate({ type: 'set_parent', taskId: 'child', parentTaskId: 'parent' })
    expect(app.state.tasks.child.parentTaskId).toBe('parent')
    expect(app.state.activity[childResult.activityId!]).toMatchObject({
      taskId: 'child',
      type: 'parent_changed',
      previousValue: undefined,
      newValue: 'parent',
    })

    app.mutate({ type: 'set_parent', taskId: 'grandchild', parentTaskId: 'child' })
    const revisionBeforeRejections = app.state.revision

    expect(() => app.mutate({ type: 'set_parent', taskId: 'child', parentTaskId: 'child' }))
      .toThrowError(new TaskDomainError('A task cannot be its own parent.', 'invalid_input'))
    expect(() => app.mutate({ type: 'set_parent', taskId: 'parent', parentTaskId: 'grandchild' }))
      .toThrowError(new TaskDomainError('This parent would create a circular task hierarchy.', 'dependency_cycle'))

    expect(app.state.revision).toBe(revisionBeforeRejections)
    expect(app.state.tasks.parent.parentTaskId).toBeUndefined()
    expect(validateTaskStore(app.state)).toBe(true)
  })

  it('uses a supplied duplicate ID and deliberately omits image covers', () => {
    const app = harness('task-1')
    const imageCover = {
      type: 'image' as const,
      value: 'task/task-1/cover/hero',
      mimeType: 'image/png' as const,
      width: 1600,
      height: 900,
      positionY: 42,
    }
    app.mutate({ type: 'set_cover', taskId: 'task-1', cover: imageCover })

    const result = app.mutate({ type: 'duplicate_task', taskId: 'task-1', newTaskId: 'stable-copy-id' })

    expect(result).toMatchObject({ changed: true, taskId: 'stable-copy-id', entityId: 'stable-copy-id' })
    expect(app.state.tasks['stable-copy-id']).toMatchObject({
      id: 'stable-copy-id',
      title: 'Task task-1 (copy)',
      createdBy: 'user-1',
      version: 1,
    })
    expect(app.state.tasks['stable-copy-id'].cover).toBeUndefined()
    expect(app.state.tasks['task-1'].cover).toEqual(imageCover)
    expect(app.state.activity[result.activityId!]).toMatchObject({
      taskId: 'task-1',
      type: 'task_duplicated',
      newValue: { duplicateTaskId: 'stable-copy-id' },
    })
    expect(() => app.mutate({ type: 'duplicate_task', taskId: 'task-1', newTaskId: 'stable-copy-id' }))
      .toThrowError(new TaskDomainError('A task with the duplicate ID already exists.', 'conflict'))
    expect(validateTaskStore(app.state)).toBe(true)
  })

  it('seeds imported comments idempotently without creating activity', () => {
    const app = harness('task-1')
    const imported: TaskComment = {
      id: 'remote-comment-1',
      taskId: 'task-1',
      authorId: 'remote-user',
      body: 'Imported from the project discussion',
      mentionIds: [],
      attachmentIds: [],
      reactions: {},
      createdAt: '2026-11-01T09:30:00.000Z',
    }

    const first = app.mutate({ type: 'seed_comments', taskId: 'task-1', comments: [imported] })
    expect(first.changed).toBe(true)
    expect(app.state.tasks['task-1'].commentIds).toEqual(['remote-comment-1'])
    expect(app.state.comments['remote-comment-1']).toEqual(imported)
    expect(Object.values(app.state.activity)).toHaveLength(0)

    const revisionAfterFirstSeed = app.state.revision
    const stateAfterFirstSeed = app.state
    const second = app.mutate({ type: 'seed_comments', taskId: 'task-1', comments: [imported] })
    expect(second.changed).toBe(false)
    expect(second.state).toBe(stateAfterFirstSeed)
    expect(app.state.revision).toBe(revisionAfterFirstSeed)
    expect(app.state.tasks['task-1'].commentIds).toEqual(['remote-comment-1'])
    expect(Object.values(app.state.comments)).toHaveLength(1)
    expect(validateTaskStore(app.state)).toBe(true)
  })

  it('reconciles shared board fields without replacing rich local task data', () => {
    const app = harness('task-1')
    const checklistId = app.mutate({ type: 'add_checklist', taskId: 'task-1', title: 'Release checks' }).entityId!
    app.mutate({ type: 'add_checklist_item', taskId: 'task-1', checklistId, text: 'Verify production' })
    app.mutate({ type: 'set_cover', taskId: 'task-1', cover: { type: 'gradient', value: 'ocean' } })
    const activityCount = Object.keys(app.state.activity).length

    const remote = taskDetailsFromProjectTask(projectTask('task-1', {
      column_id: 'doing-column',
      title: 'Renamed on the board',
      description: 'Shared description',
      priority: 'high',
      assignee_id: 'member-2',
      start_date: '2026-11-03',
      due_date: '2026-11-10',
      estimated_hours: 8,
    }), { status: 'in_progress' })
    const reconciled = app.mutate({ type: 'seed_task', task: remote })

    expect(reconciled.changed).toBe(true)
    expect(app.state.tasks['task-1']).toMatchObject({
      title: 'Renamed on the board',
      description: 'Shared description',
      columnId: 'doing-column',
      status: 'in_progress',
      priority: 'high',
      assigneeIds: ['member-2'],
      estimate: { value: 8, unit: 'hours' },
      startDate: '2026-11-03',
      dueDate: '2026-11-10',
      cover: { type: 'gradient', value: 'ocean' },
    })
    expect(app.state.tasks['task-1'].checklists[0].items[0].text).toBe('Verify production')
    expect(Object.keys(app.state.activity)).toHaveLength(activityCount)
    expect(validateTaskStore(app.state)).toBe(true)
  })

  it('rolls back a failed shared mutation and removes its audit event',() => {
    const app=harness('task-1')
    const snapshot=app.state.tasks['task-1']
    const changed=app.mutate({type:'update_title',taskId:'task-1',title:'Optimistic title'})
    const changedVersion=app.state.tasks['task-1'].version

    const rolledBack=app.mutate({type:'rollback_shared_task',taskId:'task-1',snapshot,expectedVersion:changedVersion,activityId:changed.activityId})

    expect(rolledBack.changed).toBe(true)
    expect(app.state.tasks['task-1'].title).toBe('Task task-1')
    expect(app.state.activity[changed.activityId!]).toBeUndefined()
    app.mutate({type:'update_priority',taskId:'task-1',priority:'high'})
    expect(() => app.mutate({type:'rollback_shared_task',taskId:'task-1',snapshot,expectedVersion:changedVersion})).toThrowError(new TaskDomainError('The task changed again before it could be rolled back.','conflict'))
    expect(validateTaskStore(app.state)).toBe(true)
  })
})
