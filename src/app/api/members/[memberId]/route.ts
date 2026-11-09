import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAccountLinkEmail } from '@/lib/email'
import { channelRoleForWorkspaceRole, isWorkspaceAdmin, PRIMARY_ADMIN_EMAIL } from '@/lib/auth/workspace'
import { recordMemberAudit } from '@/lib/memberAdministration'

async function authorize(memberId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) }
  if (!isWorkspaceAdmin(user.app_metadata?.role, user.email)) {
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
    const protectedAccount = member.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL
    if (!['update', 'reset_password', 'suspend', 'reactivate'].includes(action)) return NextResponse.json({ error: 'Choose a valid member action.' }, { status: 400 })

    if ((action === 'suspend' || action === 'delete') && (protectedAccount || actor.id === memberId)) {
      return NextResponse.json({ error: 'The primary admin or your own active account cannot be disabled.' }, { status: 400 })
    }

    if (action === 'reset_password') {
      const origin = new URL(request.url).origin
      const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: member.email!, options: { redirectTo: `${origin}/set-password` } })
      if (error) throw error
      await sendAccountLinkEmail({ to: member.email!, name: String(member.user_metadata?.display_name || member.email), link: data.properties.action_link, kind: 'recovery' })
      await recordMemberAudit(admin, { actor_id: actor.id, target_id: memberId, action: 'password_reset' })
      return NextResponse.json({ message: 'Password reset email sent.' })
    }

    if (action === 'suspend' || action === 'reactivate') {
      const { error } = await admin.auth.admin.updateUserById(memberId, { ban_duration: action === 'suspend' ? '876000h' : 'none' })
      if (error) throw error
      await admin.from('profiles').update({ status: 'offline' }).eq('id', memberId)
      await recordMemberAudit(admin, { actor_id: actor.id, target_id: memberId, action })
      return NextResponse.json({ message: action === 'suspend' ? 'Member suspended.' : 'Member reactivated.' })
    }

    const displayName = String(body.displayName ?? '').trim()
    const jobTitle = String(body.jobTitle ?? '').trim() || 'Teammate'
    const role = body.role ?? member.app_metadata?.role ?? 'member'
    if (!['member', 'admin', 'ceo'].includes(role)) return NextResponse.json({ error: 'Choose a valid workspace role.' }, { status: 400 })
    if (body.channelIds !== undefined && !Array.isArray(body.channelIds)) return NextResponse.json({ error: 'Choose valid public channels.' }, { status: 400 })
    const channelIds = Array.isArray(body.channelIds) ? [...new Set(body.channelIds.map(String))] : undefined
    if (displayName.length < 2) return NextResponse.json({ error: 'Enter the member’s full name.' }, { status: 400 })
    if (protectedAccount && role !== 'admin') return NextResponse.json({ error: 'The primary admin role cannot be removed.' }, { status: 400 })

    // Read and validate channel access before changing authentication or profile data.
    const { data: publicChannels, error: channelError } = await admin.from('channels').select('id').eq('type', 'public').is('archived_at', null)
    if (channelError) throw channelError
    const publicIds = (publicChannels ?? []).map((channel) => channel.id)
    const { data: memberships, error: membershipError } = await admin.from('channel_members').select('channel_id,role').eq('user_id', memberId).in('channel_id', publicIds)
    if (membershipError) throw membershipError
    const current = new Map((memberships ?? []).map((membership) => [membership.channel_id, membership.role]))
    const selectedIds = channelIds === undefined ? [...current.keys()] : publicIds.filter((id) => channelIds.includes(id))
    const desiredRole = channelRoleForWorkspaceRole(role)
    const changes = selectedIds.flatMap((channelId) => {
      const channelRole = current.get(channelId) === 'owner' ? 'owner' : desiredRole
      return current.get(channelId) === channelRole ? [] : [{ channel_id: channelId, user_id: memberId, role: channelRole }]
    })
    const removedIds = [...current.keys()].filter((channelId) => !selectedIds.includes(channelId))

    const { error: userError } = await admin.auth.admin.updateUserById(memberId, {
      app_metadata: { ...member.app_metadata, role },
      user_metadata: { ...member.user_metadata, display_name: displayName },
    })
    if (userError) throw userError
    const { error: profileError } = await admin.from('profiles').update({ display_name: displayName, job_title: jobTitle }).eq('id', memberId)
    if (profileError) throw profileError
    if (changes.length) {
      const { error: insertError } = await admin.from('channel_members').upsert(changes, { onConflict: 'channel_id,user_id' })
      if (insertError) throw insertError
    }
    if (removedIds.length) {
      const { error: deleteError } = await admin.from('channel_members').delete().eq('user_id', memberId).in('channel_id', removedIds)
      if (deleteError) throw deleteError
    }
    await recordMemberAudit(admin, { actor_id: actor.id, target_id: memberId, action: 'update', details: { role, channel_ids: selectedIds } })
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
    if (member.email?.toLowerCase() === PRIMARY_ADMIN_EMAIL || actor.id === memberId) return NextResponse.json({ error: 'The primary admin or your own account cannot be deleted.' }, { status: 400 })
    const { error } = await admin.auth.admin.deleteUser(memberId)
    if (error) throw error
    await recordMemberAudit(admin, { actor_id: actor.id, target_id: null, action: 'delete', details: { email: member.email, deleted_user_id: memberId } })
    return NextResponse.json({ message: 'Member permanently removed.' })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete member.' }, { status: 500 })
  }
}
