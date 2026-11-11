'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Message, Profile } from '@/types/database'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const unavailable = 'This message is unavailable or you no longer have access to it.'
const SELECT = '*, reactions(*), attachments(*)'
const CONTEXT_SIDE = 15

/** Exact, bounded lookups keep old/reply permalinks useful without scanning the conversation. */
export async function fetchLinkedMessage(supabase: ReturnType<typeof createClient>, channelId: string, messageId: string) {
  if (!UUID.test(messageId)) throw new Error('This message link is invalid.')
  const read = async (id: string) => {
    const { data, error } = await supabase.from('messages').select(SELECT)
      .eq('channel_id', channelId).eq('id', id).is('deleted_at', null).maybeSingle()
    if (error || !data) throw new Error(unavailable)
    return data as Message
  }
  const target = await read(messageId)
  const root = target.parent_id ? await read(target.parent_id) : target
  if (root.parent_id) throw new Error(unavailable)
  const contextAround = async (message: Message) => {
    const side = (before: boolean) => {
      let query = supabase.from('messages').select(SELECT).eq('channel_id', channelId).is('deleted_at', null)
      query = message.parent_id ? query.eq('parent_id', message.parent_id) : query.is('parent_id', null)
      const comparison = before ? 'lt' : 'gt'
      return query.or(`created_at.${comparison}.${message.created_at},and(created_at.eq.${message.created_at},id.${comparison}.${message.id})`)
        .order('created_at', { ascending: !before }).order('id', { ascending: !before }).limit(CONTEXT_SIDE)
    }
    const [before, after] = await Promise.all([side(true), side(false)])
    if (before.error || after.error) throw new Error(unavailable)
    return [...((before.data ?? []) as Message[]).reverse(), message, ...((after.data ?? []) as Message[])]
  }
  const [rootContext, replyContext] = await Promise.all([
    contextAround(root), target.parent_id ? contextAround(target) : Promise.resolve(undefined),
  ])
  const messages = [...rootContext, ...(replyContext ?? [])]
  const userIds = [...new Set(messages.map((message) => message.user_id).filter((id): id is string => Boolean(id)))]
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('*').in('id', userIds)
    : { data: [] }
  const people = new Map(((profiles ?? []) as Profile[]).map((profile) => [profile.id, profile]))
  const enrich = (message: Message) => ({ ...message, profiles: people.get(message.user_id ?? '') })
  return { target: enrich(target), root: enrich(root), rootContext: rootContext.map(enrich), replyContext: replyContext?.map(enrich) }
}

export function useMessageLink(channelId: string, messageId: string | null) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['message-link', channelId, messageId],
    enabled: Boolean(messageId),
    queryFn: () => fetchLinkedMessage(supabase, channelId, messageId!),
    staleTime: 0,
    retry: 1,
  })
}
