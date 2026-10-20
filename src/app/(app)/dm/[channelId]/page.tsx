import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MessagePane } from '@/components/messages/MessagePane'
import type { ChannelWithMember, Profile } from '@/types/database'

interface PageProps {
  params: Promise<{ channelId: string }>
}

export default async function DMPage({ params }: PageProps) {
  const { channelId } = await params
  const supabase = await createClient()

  // Middleware has already validated this request's token.
  const { data: { session } } = await supabase.auth.getSession()
  const user = session?.user

  if (!user) redirect('/login')

  // Verify user is a member
  const [{ data: membership }, { data: channel }, { data: otherMember }] = await Promise.all([
    supabase.from('channel_members').select('*').eq('channel_id', channelId).eq('user_id', user.id).single(),
    supabase.from('channels').select('*').eq('id', channelId).single(),
    supabase.from('channel_members').select('user_id, profiles!inner(*)').eq('channel_id', channelId).neq('user_id', user.id).maybeSingle(),
  ])

  if (!membership) notFound()

  if (!channel) notFound()
  if (channel.type !== 'dm' && channel.type !== 'group_dm') notFound()

  const other_member = (otherMember?.profiles as unknown) as Profile | undefined

  const channelWithMember: ChannelWithMember = {
    ...channel,
    channel_members: [membership],
    other_member,
  }

  return (
    <MessagePane
      channel={channelWithMember}
      currentUserId={user.id}
    />
  )
}
