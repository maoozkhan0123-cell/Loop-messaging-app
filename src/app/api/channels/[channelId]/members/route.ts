import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const PRIMARY_ADMIN = 'loop@bytechsol.com'

// Channel members (and workspace admins) can see and add people. Removing someone else
// needs a workspace admin, the channel creator, or a channel owner/admin; anyone can remove themselves.
async function authorize(channelId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Please sign in again.' }, { status: 401 }) }

  const admin = createAdminClient()
  const { data: channel, error } = await admin.from('channels').select('id,type,archived_at,created_by').eq('id', channelId).maybeSingle()
  if (error) throw error
  if (!channel || channel.archived_at) return { response: NextResponse.json({ error: 'Channel not found.' }, { status: 404 }) }
  if (channel.type === 'dm' || channel.type === 'group_dm') return { response: NextResponse.json({ error: 'People can only be managed in channels.' }, { status: 400 }) }

  const isWorkspaceAdmin = user.app_metadata?.role === 'admin' || user.email === PRIMARY_ADMIN
  const { data: membership } = await admin.from('channel_members').select('role').eq('channel_id', channelId).eq('user_id', user.id).maybeSingle()
  if (!isWorkspaceAdmin && !membership) return { response: NextResponse.json({ error: 'Only members of this channel can manage its people.' }, { status: 403 }) }
  const canRemove = isWorkspaceAdmin || channel.created_by === user.id || membership?.role === 'owner' || membership?.role === 'admin'
  return { admin, userId: user.id, canRemove }
}

export async function GET(_request: Request, context: { params: Promise<{ channelId: string }> }) {
  try {
    const { channelId } = await context.params
    const auth = await authorize(channelId)
    if (auth.response) return auth.response
    const { data, error } = await auth.admin.from('channel_members').select('user_id').eq('channel_id', channelId)
    if (error) throw error
    return NextResponse.json({ memberIds: (data ?? []).map((row) => row.user_id), canRemove: auth.canRemove, currentUserId: auth.userId })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load channel members.' }, { status: 500 })
  }
}

export async function POST(request: Request, context: { params: Promise<{ channelId: string }> }) {
  try {
    const { channelId } = await context.params
    const auth = await authorize(channelId)
    if (auth.response) return auth.response
    const body = await request.json()
    const userIds = Array.isArray(body.userIds) ? [...new Set(body.userIds.map(String))] : []
    if (!userIds.length) return NextResponse.json({ error: 'Choose at least one person.' }, { status: 400 })

    const { error } = await auth.admin
      .from('channel_members')
      .upsert(userIds.map((userId) => ({ channel_id: channelId, user_id: userId, role: 'member' })), { onConflict: 'channel_id,user_id', ignoreDuplicates: true })
    if (error) throw error
    return NextResponse.json({ message: `${userIds.length} ${userIds.length === 1 ? 'person' : 'people'} added.` })
  } catch (error: unknown) {
    console.error('Add channel members error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to add people.' }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ channelId: string }> }) {
  try {
    const { channelId } = await context.params
    const auth = await authorize(channelId)
    if (auth.response) return auth.response
    const body = await request.json()
    const userId = String(body.userId ?? '')
    if (!userId) return NextResponse.json({ error: 'Choose a person to remove.' }, { status: 400 })
    if (userId !== auth.userId && !auth.canRemove) {
      return NextResponse.json({ error: 'Only workspace admins or channel owners can remove people.' }, { status: 403 })
    }

    const { error } = await auth.admin.from('channel_members').delete().eq('channel_id', channelId).eq('user_id', userId)
    if (error) throw error
    return NextResponse.json({ message: userId === auth.userId ? 'You left the channel.' : 'Removed from the channel.' })
  } catch (error: unknown) {
    console.error('Remove channel member error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to remove this person.' }, { status: 500 })
  }
}
