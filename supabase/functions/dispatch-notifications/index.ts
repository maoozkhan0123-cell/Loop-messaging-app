import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationPayload {
  messageId: string
  channelId: string
  senderId: string
  body: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const authHeader = req.headers.get('Authorization')
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader?.replace('Bearer ', '') ?? ''
    )
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload: NotificationPayload = await req.json()
    const { messageId, channelId, senderId, body } = payload

    if (!messageId || !channelId || senderId !== user.id) {
      return new Response(JSON.stringify({ error: 'Invalid notification payload' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: sourceMessage } = await supabase
      .from('messages').select('id').eq('id', messageId)
      .eq('channel_id', channelId).eq('user_id', user.id).maybeSingle()
    if (!sourceMessage) {
      return new Response(JSON.stringify({ error: 'Message not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get channel members who should receive notifications
    const { data: members } = await supabase
      .from('channel_members')
      .select('user_id, notification_pref, last_read_at')
      .eq('channel_id', channelId)
      .neq('user_id', senderId)
      .in('notification_pref', ['all', 'mentions'])

    if (!members || members.length === 0) {
      return new Response(JSON.stringify({ dispatched: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get sender profile
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', senderId)
      .single()

    const senderName = senderProfile?.display_name ?? 'Someone'

    // Get channel name
    const { data: channel } = await supabase
      .from('channels')
      .select('name, type')
      .eq('id', channelId)
      .single()

    const channelName = channel?.name ?? 'a channel'
    const isDM = channel?.type === 'dm'

    // In a real implementation, you'd look up push subscriptions from a table
    // and send Web Push notifications using the Web Push API or a service like Expo
    // For now, we log what would be dispatched
    const notifications = members.map((member) => ({
      userId: member.user_id,
      title: isDM ? `${senderName}` : `${senderName} in #${channelName}`,
      body: body.length > 100 ? body.slice(0, 97) + '...' : body,
      url: isDM ? `/dm/${channelId}` : `/channel/${channelId}`,
      tag: `channel-${channelId}`,
    }))

    console.log('Would dispatch notifications:', JSON.stringify(notifications, null, 2))

    return new Response(
      JSON.stringify({ dispatched: notifications.length, notifications }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (err) {
    console.error('Notification dispatch error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
