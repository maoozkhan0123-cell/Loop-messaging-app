import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MessagePane } from '@/components/messages/MessagePane'
import type { ChannelWithMember } from '@/types/database'

interface PageProps {
  params: Promise<{ channelId: string }>
}

export default async function ChannelPage({ params }: PageProps) {
  const { channelId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Verify user is a member of this channel
  const { data: membership } = await supabase
    .from('channel_members')
    .select('*')
    .eq('channel_id', channelId)
    .eq('user_id', user.id)
    .single()

  if (!membership) notFound()

  // Get channel details
  const { data: channel } = await supabase
    .from('channels')
    .select('*')
    .eq('id', channelId)
    .single()

  if (!channel) notFound()
  if (channel.archived_at) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-[#6B7280]">This channel has been archived.</p>
      </div>
    )
  }

  const channelWithMember: ChannelWithMember = {
    ...channel,
    channel_members: [membership],
  }

  return (
    <MessagePane
      channel={channelWithMember}
      currentUserId={user.id}
    />
  )
}
