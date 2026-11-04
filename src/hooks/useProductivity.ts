'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Profile, ProjectTask, ScheduledMessage, WorkspaceEvent } from '@/types/database'

export type InboxItem = {
  id: string
  task: ProjectTask
  assigner: Profile | null
  done: boolean
  commentsCount: number
  createdAt: string
  href: string
}

export function useUnifiedInbox(userId?: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['unified-inbox', userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    // The inbox only lists tasks assigned to the user; messages live in Messages.
    queryFn: async () => {
      const { data, error } = await supabase.from('project_tasks').select('*').eq('assignee_id', userId!).order('created_at', { ascending: false }).limit(100)
      if (error) throw error
      const tasks = ((data ?? []) as ProjectTask[]).filter((task) => !task.archived_at)
      if (!tasks.length) return [] as InboxItem[]

      const creatorIds = [...new Set(tasks.map((task) => task.created_by).filter((id): id is string => !!id))]
      const [profilesResult, columnsResult, commentsResult] = await Promise.all([
        creatorIds.length ? supabase.from('profiles').select('*').in('id', creatorIds) : Promise.resolve({ data: [] }),
        supabase.from('project_columns').select('id,name').in('board_id', [...new Set(tasks.map((task) => task.board_id))]),
        supabase.from('project_task_comments').select('task_id').in('task_id', tasks.map((task) => task.id)),
      ])
      const profiles = new Map(((profilesResult.data ?? []) as Profile[]).map((profile) => [profile.id, profile]))
      const doneColumns = new Set(((columnsResult.data ?? []) as Array<{ id: string; name: string }>).filter((column) => /done|complete/i.test(column.name)).map((column) => column.id))
      const commentCounts = new Map<string, number>()
      for (const row of (commentsResult.data ?? []) as Array<{ task_id: string }>) commentCounts.set(row.task_id, (commentCounts.get(row.task_id) ?? 0) + 1)

      return tasks.map((task): InboxItem => ({
        id: task.id,
        task,
        assigner: task.created_by ? profiles.get(task.created_by) ?? null : null,
        done: doneColumns.has(task.column_id),
        commentsCount: commentCounts.get(task.id) ?? 0,
        createdAt: task.created_at,
        href: `/projects?board=${task.board_id}&task=${task.id}`,
      }))
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
