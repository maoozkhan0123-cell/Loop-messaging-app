import { describe, expect, it, vi } from 'vitest'
import { createDashboardTask, type CreateDashboardTaskInput } from './createDashboardTask'
import type { ProjectTask } from '@/types/database'
import { createTaskSharedMetadata } from './taskMetadata'

const task = {
  id: 'task-1', board_id: 'board-1', column_id: 'column-1', title: 'Prepare launch', description: null,
  priority: 'high', due_date: '2026-11-15', assignee_id: 'member-1', created_by: 'creator-1', position: 3,
  created_at: '2026-11-09T12:00:00.000Z',
} as ProjectTask

const input: CreateDashboardTaskInput = {
  boardId: task.board_id, columnId: task.column_id, title: ' Prepare launch ', priority: 'high', dueDate: '2026-11-15',
}

function client(error: { code: string; message: string } | null = null) {
  const single = vi.fn().mockResolvedValue({ data: error ? null : task, error })
  const rpc = vi.fn(() => ({ single }))
  return { supabase: { rpc } as unknown as Parameters<typeof createDashboardTask>[0], rpc, single }
}

describe('createDashboardTask persistence', () => {
  it('creates all assignees, dates, labels and checklist metadata in one RPC', async () => {
    const { supabase, rpc } = client()
    const created = await createDashboardTask(supabase, {
      ...input, assigneeIds: ['member-1', ' member-2 ', 'member-1'], assigneeId: 'ignored-legacy-member',
      startDate: '2026-11-10', description: ' Launch notes ', labels: [' Release ', 'release', 'Client'],
      checklistItems: [{ label: ' Review copy ', completed: true }, { label: 'Publish' }], estimatedHours: 2,
    }, 3)

    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith('create_project_task', expect.objectContaining({
      p_title: 'Prepare launch', p_description: 'Launch notes', p_priority: 'high', p_position: 3,
      p_assignee_ids: ['member-1', 'member-2'], p_start_date: '2026-11-10', p_due_date: '2026-11-15',
      p_labels: ['Release', 'Client'], p_estimated_hours: 2,
      p_task_metadata: expect.objectContaining({
        schemaVersion: 1,
        labels: [expect.objectContaining({ name: 'Release' }), expect.objectContaining({ name: 'Client' })],
        checklists: [expect.objectContaining({ items: [
          expect.objectContaining({ text: 'Review copy', completed: true, order: 0 }),
          expect.objectContaining({ text: 'Publish', completed: false, order: 1 }),
        ] })],
      }),
    }))
    expect(created.assignee_ids).toEqual(['member-1', 'member-2'])
  })

  it('preserves legacy single-assignee callers and stable duplicate-task IDs', async () => {
    const { supabase, rpc } = client()
    await createDashboardTask(supabase, { ...input, id: 'duplicate-id', assigneeId: 'member-1' })
    expect(rpc).toHaveBeenCalledWith('create_project_task', expect.objectContaining({
      p_task_id: 'duplicate-id', p_assignee_ids: ['member-1'], p_start_date: null, p_labels: [],
      p_task_metadata: { schemaVersion: 1, labels: [], checklists: [] },
    }))
  })

  it('respects an explicitly unassigned task instead of reviving the legacy assignee', async () => {
    const { supabase, rpc } = client()
    await createDashboardTask(supabase, { ...input, assigneeId: 'member-1', assigneeIds: [] })
    expect(rpc).toHaveBeenCalledWith('create_project_task', expect.objectContaining({ p_assignee_ids: [] }))
  })

  it('can create a task without a deadline', async () => {
    const { supabase, rpc } = client()
    await createDashboardTask(supabase, { ...input, startDate: '2026-11-10', dueDate: null })
    expect(rpc).toHaveBeenCalledWith('create_project_task', expect.objectContaining({ p_start_date: '2026-11-10', p_due_date: null }))
  })

  it('preserves rich checklist groups and label colors when copying a task', async () => {
    const { supabase, rpc } = client()
    const metadata = createTaskSharedMetadata(['Release'], [{ label: 'Review' }])
    metadata.labels[0].color = 'emerald'
    metadata.checklists[0].title = 'Launch checks'
    metadata.checklists[0].items[0].dueDate = '2026-11-14'
    metadata.checklists[0].items[0].assigneeId = 'member-2'
    await createDashboardTask(supabase, { ...input, taskMetadata: metadata })
    expect(rpc).toHaveBeenCalledWith('create_project_task', expect.objectContaining({
      p_labels: ['Release'], p_task_metadata: metadata,
    }))
  })

  it('normalizes copied label records and names together without mutating the source task', async () => {
    const { supabase, rpc } = client()
    const metadata = createTaskSharedMetadata(['Release'], [])
    const firstLabel = { ...metadata.labels[0], name: ' Release ', color: 'emerald' as const }
    metadata.labels = [firstLabel, { ...firstLabel, id: 'duplicate-label', name: 'release', color: 'rose' }, { ...firstLabel, id: 'client-label', name: ' Client ' }]
    const original = structuredClone(metadata)

    await createDashboardTask(supabase, { ...input, taskMetadata: metadata })

    expect(rpc).toHaveBeenCalledWith('create_project_task', expect.objectContaining({
      p_labels: ['Release', 'Client'],
      p_task_metadata: expect.objectContaining({ labels: [
        expect.objectContaining({ id: firstLabel.id, name: 'Release', color: 'emerald' }),
        expect.objectContaining({ id: 'client-label', name: 'Client' }),
      ] }),
    }))
    expect(metadata).toEqual(original)
  })

  it.each([
    [{ ...input, startDate: '2026-11-16' }, /on or after the start date/],
    [{ ...input, dueDate: '2026-02-30' }, /valid date/],
    [{ ...input, title: ' ' }, /title/],
    [{ ...input, checklistItems: [{ label: 'x'.repeat(501) }] }, /checklist item/],
  ])('rejects invalid input before starting a write', async (invalid, message) => {
    const { supabase, rpc } = client()
    await expect(createDashboardTask(supabase, invalid)).rejects.toThrow(message)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('requires the atomic migration instead of silently creating a task without its metadata', async () => {
    const { supabase, rpc } = client({ code: 'PGRST202', message: 'Function not found' })
    await expect(createDashboardTask(supabase, { ...input, assigneeIds: ['member-1', 'member-2'] })).rejects.toThrow(/database update/)
    expect(rpc).toHaveBeenCalledOnce()
  })

  it('surfaces assignment failures without retrying a partial task creation path', async () => {
    const { supabase, rpc } = client({ code: '23503', message: 'Unknown profile' })
    await expect(createDashboardTask(supabase, { ...input, assigneeIds: ['missing-member'] })).rejects.toThrow(/assignee is no longer available/)
    expect(rpc).toHaveBeenCalledOnce()
  })
})
