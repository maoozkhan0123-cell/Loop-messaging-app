import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAccountLinkEmail } from '@/lib/email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) }
  if (user.app_metadata?.role !== 'admin' && user.email !== 'loop@bytechsol.com') {
    return { error: NextResponse.json({ error: 'Only workspace admins can manage members.' }, { status: 403 }) }
  }
  return { user }
}

export async function GET() {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error
    const admin = createAdminClient()
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (error) throw error
    const { data: channelMembers } = await admin.from('channel_members').select('user_id, channel_id, channels!inner(type)').eq('channels.type', 'public')
    return NextResponse.json({ members: data.users.map((member) => ({
      id: member.id,
      email: member.email,
      role: member.app_metadata?.role === 'admin' ? 'admin' : 'member',
      suspended: Boolean(member.banned_until && new Date(member.banned_until) > new Date()),
      lastSignInAt: member.last_sign_in_at,
      createdAt: member.created_at,
      channelIds: (channelMembers ?? []).filter((row) => row.user_id === member.id).map((row) => row.channel_id),
    })) })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load members.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin()
    if (auth.error) return auth.error

    const body = await request.json()
    const displayName = String(body.displayName ?? '').trim()
    const email = String(body.email ?? '').trim().toLowerCase()
    const jobTitle = String(body.jobTitle ?? 'Teammate').trim() || 'Teammate'
    const accessRole = body.accessRole === 'admin' ? 'admin' : 'member'
    const requestedChannelIds = Array.isArray(body.channelIds) ? body.channelIds.map(String) : []

    if (displayName.length < 2) {
      return NextResponse.json({ error: 'Enter the member’s full name.' }, { status: 400 })
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
    }
    const admin = createAdminClient()
    const origin = new URL(request.url).origin
    const { data: created, error: createError } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        data: { display_name: displayName, role: accessRole },
        redirectTo: `${origin}/set-password`,
      },
    })

    if (createError) {
      const duplicate = /already|registered|exists/i.test(createError.message)
      return NextResponse.json(
        { error: duplicate ? 'A member with this email already exists.' : createError.message },
        { status: duplicate ? 409 : 400 }
      )
    }

    const memberId = created.user.id
    await admin.auth.admin.updateUserById(memberId, { app_metadata: { role: accessRole } })
    const { error: profileError } = await admin.from('profiles').upsert({
      id: memberId,
      email,
      display_name: displayName,
      job_title: jobTitle,
      status: 'offline',
    }, { onConflict: 'id' })

    if (profileError) {
      await admin.auth.admin.deleteUser(memberId)
      throw profileError
    }

    const { data: publicChannels, error: channelError } = await admin
      .from('channels')
      .select('id')
      .eq('type', 'public')
      .is('archived_at', null)
    if (channelError) throw channelError

    const selected = requestedChannelIds.length
      ? publicChannels?.filter((channel) => requestedChannelIds.includes(channel.id))
      : publicChannels
    if (selected?.length) {
      const { error: memberError } = await admin.from('channel_members').upsert(
        selected.map((channel) => ({
          channel_id: channel.id,
          user_id: memberId,
          role: accessRole,
        })),
        { onConflict: 'channel_id,user_id' }
      )
      if (memberError) throw memberError
    }

    try {
      await sendAccountLinkEmail({
        to: email,
        name: displayName,
        link: created.properties.action_link,
        kind: 'invite',
      })
    } catch (mailError) {
      await admin.auth.admin.deleteUser(memberId)
      throw mailError
    }

    await admin.from('member_audit_logs').insert({ actor_id: auth.user.id, target_id: memberId, action: 'invite', details: { email, role: accessRole, channel_ids: selected?.map((channel) => channel.id) ?? [] } }).then(() => undefined)

    return NextResponse.json({
      member: { id: memberId, displayName, email, jobTitle, accessRole },
      message: 'Invitation sent successfully.',
    }, { status: 201 })
  } catch (error: unknown) {
    console.error('Create member error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create member.' },
      { status: 500 }
    )
  }
}
