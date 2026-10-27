import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthorizedCEO } from '@/lib/auth/ceo'

export async function POST(request: Request) {
  const auth = await getAuthorizedCEO()
  if (!auth.user) return NextResponse.json({ error: 'CEO access required.' }, { status: auth.status })
  try {
    const input = await request.json(); const kind = String(input.kind ?? ''); const boardId = String(input.boardId ?? ''); const title = String(input.title ?? '').trim()
    if (!boardId || !title) return NextResponse.json({ error: 'Project and title are required.' }, { status: 400 })
    const admin = createAdminClient(); const { data: board } = await admin.from('project_boards').select('id').eq('id', boardId).is('archived_at', null).maybeSingle()
    if (!board) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
    if (kind === 'milestone') {
      const target = new Date(input.targetDate); if (Number.isNaN(target.getTime())) return NextResponse.json({ error: 'Valid target date required.' }, { status: 400 })
      const { data, error } = await admin.from('project_milestones').insert({ board_id: boardId, title, description: String(input.description ?? '').trim() || null, target_date: target.toISOString(), owner_id: input.ownerId || null, status: input.status || 'planned', created_by: auth.user.id }).select().single(); if (error) throw error
      await log(admin, auth.user.id, 'milestone_created', 'milestone', data.id, { board_id: boardId, title }); return NextResponse.json({ milestone: data }, { status: 201 })
    }
    if (kind === 'risk') {
      const { data, error } = await admin.from('project_risks').insert({ board_id: boardId, title, description: String(input.description ?? '').trim() || null, severity: input.severity || 'medium', probability: input.probability || 'possible', mitigation: String(input.mitigation ?? '').trim() || null, owner_id: input.ownerId || null, review_date: input.reviewDate ? new Date(input.reviewDate).toISOString() : null, created_by: auth.user.id }).select().single(); if (error) throw error
      await log(admin, auth.user.id, 'risk_created', 'risk', data.id, { board_id: boardId, title, severity: data.severity }); return NextResponse.json({ risk: data }, { status: 201 })
    }
    return NextResponse.json({ error: 'Unsupported project operation.' }, { status: 400 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save project record.' }, { status: 500 }) }
}

export async function PATCH(request: Request) {
  const auth = await getAuthorizedCEO(); if (!auth.user) return NextResponse.json({ error: 'CEO access required.' }, { status: auth.status })
  try { const input = await request.json(); const admin = createAdminClient(); const table = input.kind === 'risk' ? 'project_risks' : 'project_milestones'; const id = String(input.id ?? ''); const allowed = input.kind === 'risk' ? { status: input.status } : { status: input.status }; const { data, error } = await admin.from(table).update(allowed).eq('id', id).select().single(); if (error) throw error; await log(admin, auth.user.id, `${input.kind}_updated`, input.kind, id, allowed); return NextResponse.json({ record: data }) } catch(error){ return NextResponse.json({ error:error instanceof Error?error.message:'Unable to update record.' },{status:500}) }
}

async function log(admin: ReturnType<typeof createAdminClient>, actorId: string, action: string, entityType: string, entityId: string, details: Record<string, unknown>) { await admin.from('executive_audit_logs').insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, details }) }
