'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Message, ProjectTask, ScheduledMessage, WorkspaceEvent } from '@/types/database'

export type InboxItem = {
  id: string
  kind: 'mention' | 'message' | 'task'
  title: string
  detail: string
  createdAt: string
  href: string
  unread?: boolean
}

export function useUnifiedInbox(userId?: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['unified-inbox', userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [messagesResult, tasksResult, membershipsResult] = await Promise.all([
        supabase.from('messages').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(80),
        supabase.from('project_tasks').select('*').eq('assignee_id', userId!).order('created_at', { ascending: false }).limit(30),
        supabase.from('channel_members').select('channel_id,last_read_at').eq('user_id', userId!),
      ])
      if (messagesResult.error) throw messagesResult.error
      if (tasksResult.error) throw tasksResult.error
      const memberships = (membershipsResult.data ?? []) as Array<{ channel_id: string; last_read_at: string }>
      const lastRead = new Map<string, string>(memberships.map((row) => [row.channel_id, row.last_read_at]))
      const messages = (messagesResult.data ?? []) as Message[]
      const tasks = (tasksResult.data ?? []) as ProjectTask[]
      const messageItems: InboxItem[] = messages
        .filter((message) => message.user_id !== userId)
        .map((message) => {
          const mention = !!message.body?.toLowerCase().includes('@')
          return {
            id: `message-${message.id}`,
            kind: mention ? 'mention' : 'message',
            title: mention ? 'Mentioned in a conversation' : 'New message',
            detail: message.body || 'Shared an attachment',
            createdAt: message.created_at,
            href: `/channel/${message.channel_id}?message=${message.id}`,
            unread: new Date(message.created_at) > new Date(lastRead.get(message.channel_id) ?? 0),
          }
        })
      const taskItems: InboxItem[] = tasks.map((task) => ({
        id: `task-${task.id}`, kind: 'task', title: 'Task assigned to you', detail: task.title,
        createdAt: task.created_at, href: `/projects?task=${task.id}`, unread: true,
      }))
      return [...messageItems, ...taskItems].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    },
  })
}

export function useWorkspaceEvents(userId?: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['workspace-events', userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('workspace_events').select('*').order('starts_at')
      if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return [] as WorkspaceEvent[]
        throw error
      }
      return (data ?? []) as WorkspaceEvent[]
    },
  })
  const createEvent = useMutation({
    mutationFn: async (input: Omit<WorkspaceEvent, 'id' | 'created_at' | 'creator' | 'attendee_count' | 'my_response'>) => {
      const { data, error } = await supabase.from('workspace_events').insert(input).select().single()
      if (error) throw new Error(error.message)
      return data as WorkspaceEvent
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-events'] }),
  })
  const rsvp = useMutation({
    mutationFn: async ({ eventId, response }: { eventId: string; response: 'accepted' | 'declined' | 'maybe' }) => {
      const { error } = await supabase.from('event_attendees').upsert({ event_id: eventId, user_id: userId, response })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workspace-events'] }),
  })
  return { ...query, createEvent: createEvent.mutateAsync, isCreating: createEvent.isPending, rsvp: rsvp.mutateAsync }
}

export function useScheduledMessages(userId?: string) {
  const supabase = createClient()
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['scheduled-messages', userId], enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('scheduled_messages').select('*').eq('user_id', userId!).eq('status', 'pending').order('scheduled_for')
      if (error && (error.code === '42P01' || error.code === 'PGRST205')) return [] as ScheduledMessage[]
      if (error) throw error
      return (data ?? []) as ScheduledMessage[]
    },
  })
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scheduled_messages').update({ status: 'cancelled' }).eq('id', id).eq('user_id', userId!)
      if (error) throw error
    }, onSuccess: () => qc.invalidateQueries({ queryKey: ['scheduled-messages'] }),
  })
  return { ...query, cancel: cancel.mutateAsync }
}
