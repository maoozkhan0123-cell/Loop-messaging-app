import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Runs an action the assistant proposed, only after the user clicked Confirm. Uses the user's own session,
// so the database's access rules decide whether they may create the task.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })

  let body: { type?: string; id?: string; messageId?: string; title?: string; description?: string | null; boardId?: string; assigneeId?: string | null; dueDate?: string | null; priority?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }) }
  if (body.type !== 'create_task') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  const title = String(body.title ?? '').trim().slice(0, 200)
  if (!title || !body.boardId) return NextResponse.json({ error: 'The task needs a title and a project.' }, { status: 400 })
  const priority = ['low', 'medium', 'high', 'urgent'].includes(String(body.priority)) ? body.priority : 'medium'
  const dueDate = body.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? body.dueDate : null

  const { data: column, error: columnError } = await supabase.from('project_columns').select('id').eq('board_id', body.boardId).order('position').limit(1).maybeSingle()
  if (columnError || !column) return NextResponse.json({ error: 'You cannot add tasks to that project.' }, { status: 403 })

  const { data: task, error } = await supabase.from('project_tasks').insert({
    board_id: body.boardId,
    column_id: column.id,
    title,
    description: body.description ? String(body.description).slice(0, 2000) : null,
    priority,
    assignee_id: body.assigneeId || null,
    due_date: dueDate,
    created_by: user.id,
  }).select('id,board_id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Mark the proposal as created in the saved chat (best effort; history may not be set up).
  if (body.messageId && body.id) {
    const { data: message } = await supabase.from('ai_messages').select('proposals').eq('id', body.messageId).maybeSingle()
    if (message && Array.isArray(message.proposals)) {
      const proposals = message.proposals.map((item: { id?: string }) => item.id === body.id ? { ...item, state: 'created', createdTaskId: task.id } : item)
      await supabase.from('ai_messages').update({ proposals }).eq('id', body.messageId)
    }
  }
  return NextResponse.json({ taskId: task.id, boardId: task.board_id })
}
