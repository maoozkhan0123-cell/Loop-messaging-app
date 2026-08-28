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

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verify user is a member
  const { data: membership } = await supabase
    .from('channel_members')
    .select('*')
    .eq('channel_id', channelId)
    .eq('user_id', user.id)
    .single()

  if (!membership) notFound()

  // Get channel
  const { data: channel } = await supabase
    .from('channels')
    .select('*')
    .eq('id', channelId)
    .single()

  if (!channel) notFound()
  if (channel.type !== 'dm' && channel.type !== 'group_dm') notFound()

  // Get other member's profile via the security-definer-backed policy
  const { data: otherMember } = await supabase
    .from('channel_members')
    .select('user_id, profiles!inner(*)')
    .eq('channel_id', channelId)
    .neq('user_id', user.id)
    .maybeSingle()

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
