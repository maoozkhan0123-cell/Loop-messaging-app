import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAccountLinkEmail } from '@/lib/email'

const PRIMARY_ADMIN = 'loop@bytechsol.com'

async function authorize(memberId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) }
  if (user.app_metadata?.role !== 'admin' && user.email !== PRIMARY_ADMIN) {
    return { response: NextResponse.json({ error: 'Only workspace admins can manage members.' }, { status: 403 }) }
  }
  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.getUserById(memberId)
  if (error || !data.user) return { response: NextResponse.json({ error: 'Member not found.' }, { status: 404 }) }
  return { admin, actor: user, member: data.user }
}

export async function PATCH(request: Request, context: { params: Promise<{ memberId: string }> }) {
  try {
    const { memberId } = await context.params
    const auth = await authorize(memberId)
    if (auth.response) return auth.response
    const { admin, actor, member } = auth
    const body = await request.json()
    const action = String(body.action ?? 'update')
    const protectedAccount = member.email === PRIMARY_ADMIN

    if ((action === 'suspend' || action === 'delete') && (protectedAccount || actor.id === memberId)) {
      return NextResponse.json({ error: 'The primary admin or your own active account cannot be disabled.' }, { status: 400 })
    }

    if (action === 'reset_password') {
      const origin = new URL(request.url).origin
      const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: member.email!, options: { redirectTo: `${origin}/set-password` } })
      if (error) throw error
      await sendAccountLinkEmail({ to: member.email!, name: String(member.user_metadata?.display_name || member.email), link: data.properties.action_link, kind: 'recovery' })
      await admin.from('member_audit_logs').insert({ actor_id: actor.id, target_id: memberId, action: 'password_reset' }).then(() => undefined)
      return NextResponse.json({ message: 'Password reset email sent.' })
    }

    if (action === 'suspend' || action === 'reactivate') {
      const { error } = await admin.auth.admin.updateUserById(memberId, { ban_duration: action === 'suspend' ? '876000h' : 'none' })
      if (error) throw error
      await admin.from('profiles').update({ status: 'offline' }).eq('id', memberId)
      await admin.from('member_audit_logs').insert({ actor_id: actor.id, target_id: memberId, action }).then(() => undefined)
      return NextResponse.json({ message: action === 'suspend' ? 'Member suspended.' : 'Member reactivated.' })
    }

    const displayName = String(body.displayName ?? '').trim()
    const jobTitle = String(body.jobTitle ?? '').trim() || 'Teammate'
    const role = ['admin', 'ceo'].includes(body.role) ? body.role : 'member'
    const channelIds = Array.isArray(body.channelIds) ? body.channelIds.map(String) : []
    if (displayName.length < 2) return NextResponse.json({ error: 'Enter the member’s full name.' }, { status: 400 })
    if (protectedAccount && role !== 'admin') return NextResponse.json({ error: 'The primary admin role cannot be removed.' }, { status: 400 })

    const { error: userError } = await admin.auth.admin.updateUserById(memberId, {
      app_metadata: { ...member.app_metadata, role },
      user_metadata: { ...member.user_metadata, display_name: displayName },
    })
    if (userError) throw userError
    const { error: profileError } = await admin.from('profiles').update({ display_name: displayName, job_title: jobTitle }).eq('id', memberId)
    if (profileError) throw profileError
    const { data: publicChannels, error: channelError } = await admin.from('channels').select('id').eq('type', 'public').is('archived_at', null)
    if (channelError) throw channelError
    const publicIds = (publicChannels ?? []).map((channel) => channel.id)
    if (publicIds.length) {
      const { error: deleteError } = await admin.from('channel_members').delete().eq('user_id', memberId).in('channel_id', publicIds)
      if (deleteError) throw deleteError
    }
    const selectedIds = publicIds.filter((id) => channelIds.includes(id))
    if (selectedIds.length) {
      const { error: insertError } = await admin.from('channel_members').insert(selectedIds.map((channelId) => ({ channel_id: channelId, user_id: memberId, role })))
      if (insertError) throw insertError
    }
    await admin.from('member_audit_logs').insert({ actor_id: actor.id, target_id: memberId, action: 'update', details: { role, channel_ids: selectedIds } }).then(() => undefined)
    return NextResponse.json({ message: 'Member access updated.' })
  } catch (error: unknown) {
    console.error('Manage member error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to manage member.' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ memberId: string }> }) {
  try {
    const { memberId } = await context.params
    const auth = await authorize(memberId)
    if (auth.response) return auth.response
    const { admin, actor, member } = auth
    if (member.email === PRIMARY_ADMIN || actor.id === memberId) return NextResponse.json({ error: 'The primary admin or your own account cannot be deleted.' }, { status: 400 })
    await admin.from('member_audit_logs').insert({ actor_id: actor.id, target_id: memberId, action: 'delete', details: { email: member.email } }).then(() => undefined)
    const { error } = await admin.auth.admin.deleteUser(memberId)
    if (error) throw error
    return NextResponse.json({ message: 'Member permanently removed.' })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete member.' }, { status: 500 })
  }
}
