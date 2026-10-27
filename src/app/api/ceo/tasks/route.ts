import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthorizedCEO } from '@/lib/auth/ceo'

const priorities = new Set(['low','medium','high','urgent'])

export async function POST(request: Request) {
  const auth = await getAuthorizedCEO()
  if (!auth.user) return NextResponse.json({ error: 'CEO access required.' }, { status: auth.status })
  try {
    const input = await request.json()
    const title = String(input.title ?? '').trim()
    const boardId = String(input.boardId ?? '')
    const columnId = String(input.columnId ?? '')
    const assigneeId = input.assigneeId ? String(input.assigneeId) : null
    const priority = priorities.has(input.priority) ? input.priority : 'medium'
    const dueDate = input.dueDate ? new Date(input.dueDate) : null
    if (!title || title.length > 240) return NextResponse.json({ error: 'Enter a task title up to 240 characters.' }, { status: 400 })
    if (!boardId || !columnId) return NextResponse.json({ error: 'Select a project and status.' }, { status: 400 })
    if (dueDate && Number.isNaN(dueDate.getTime())) return NextResponse.json({ error: 'Enter a valid deadline.' }, { status: 400 })
    const admin = createAdminClient()
    const [{ data: column }, { data: assignee }] = await Promise.all([
      admin.from('project_columns').select('id,board_id').eq('id', columnId).eq('board_id', boardId).maybeSingle(),
      assigneeId ? admin.from('profiles').select('id').eq('id', assigneeId).maybeSingle() : Promise.resolve({ data: null }),
    ])
    if (!column) return NextResponse.json({ error: 'The selected project status is invalid.' }, { status: 400 })
    if (assigneeId && !assignee) return NextResponse.json({ error: 'The selected employee does not exist.' }, { status: 400 })
    const { count } = await admin.from('project_tasks').select('*', { count: 'exact', head: true }).eq('column_id', columnId)
    const estimatedHours = input.estimatedHours === '' || input.estimatedHours == null ? null : Number(input.estimatedHours)
    if (estimatedHours !== null && (!Number.isFinite(estimatedHours) || estimatedHours < 0)) return NextResponse.json({ error: 'Estimated hours must be zero or greater.' }, { status: 400 })
    const { data: task, error } = await admin.from('project_tasks').insert({ board_id: boardId, column_id: columnId, title, description: String(input.description ?? '').trim() || null, priority, start_date: input.startDate ? new Date(input.startDate).toISOString() : null, due_date: dueDate?.toISOString() ?? null, estimated_hours: estimatedHours, blocked_reason: String(input.blockedReason ?? '').trim() || null, assignee_id: assigneeId, created_by: auth.user.id, position: count ?? 0 }).select().single()
    if (error) throw error
    const collaborators = Array.isArray(input.collaboratorIds) ? [...new Set(input.collaboratorIds.map(String))] : []
    if (collaborators.length) await admin.from('project_task_collaborators').insert(collaborators.map((userId) => ({ task_id: task.id, user_id: userId, role: 'collaborator' })))
    if (input.dependsOnTaskId) await admin.from('project_task_dependencies').insert({ task_id: task.id, depends_on_task_id: String(input.dependsOnTaskId), created_by: auth.user.id })
    await admin.from('executive_audit_logs').insert({ actor_id: auth.user.id, action: 'task_created', entity_type: 'task', entity_id: task.id, details: { title, assignee_id: assigneeId, board_id: boardId } })
    return NextResponse.json({ task }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create task.' }, { status: 500 }) }
}

export async function PATCH(request: Request) {
  const auth = await getAuthorizedCEO()
  if (!auth.user) return NextResponse.json({ error: 'CEO access required.' }, { status: auth.status })
  try {
    const input = await request.json(); const taskId = String(input.taskId ?? '')
    if (!taskId) return NextResponse.json({ error: 'Task is required.' }, { status: 400 })
    const allowed: Record<string, unknown> = {}
    if (input.columnId) allowed.column_id = String(input.columnId)
    if ('assigneeId' in input) allowed.assignee_id = input.assigneeId ? String(input.assigneeId) : null
    if (input.priority && priorities.has(input.priority)) allowed.priority = input.priority
    if ('dueDate' in input) allowed.due_date = input.dueDate ? new Date(input.dueDate).toISOString() : null
    if ('estimatedHours' in input) allowed.estimated_hours = input.estimatedHours === '' || input.estimatedHours == null ? null : Number(input.estimatedHours)
    if ('blockedReason' in input) allowed.blocked_reason = String(input.blockedReason ?? '').trim() || null
    if ('startDate' in input) allowed.start_date = input.startDate ? new Date(input.startDate).toISOString() : null
    const admin = createAdminClient()
    const { data: existing } = await admin.from('project_tasks').select('version').eq('id', taskId).maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Task not found.' }, { status: 404 })
    if (input.version != null && Number(input.version) !== Number(existing.version)) return NextResponse.json({ error: 'This task changed since you opened it. Refresh and try again.' }, { status: 409 })
    allowed.version = Number(existing.version ?? 1) + 1
    const { data: task, error } = await admin.from('project_tasks').update(allowed).eq('id', taskId).eq('version', existing.version).select().single()
    if (error) throw error
    await admin.from('executive_audit_logs').insert({ actor_id: auth.user.id, action: 'task_updated', entity_type: 'task', entity_id: taskId, details: allowed })
    return NextResponse.json({ task })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to update task.' }, { status: 500 }) }
}
