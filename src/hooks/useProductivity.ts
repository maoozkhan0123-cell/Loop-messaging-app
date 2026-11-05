'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Profile, ProjectTask, ScheduledMessage, WorkspaceEvent } from '@/types/database'

export type InboxActivity = 'assigned' | 'updated' | 'commented'

export type InboxItem = {
  id: string
  task: ProjectTask
  assigner: Profile | null
  done: boolean
  commentsCount: number
  createdAt: string
  /** Latest change made by someone else; drives unread state and the row text. */
  activity: InboxActivity
  activityAt: string
  actor: Profile | null
  href: string
}

const latest = (a: string, b: string) => (Date.parse(a) >= Date.parse(b) ? a : b)

export function useUnifiedInbox(userId?: string) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['unified-inbox', userId],
    enabled: !!userId,
    refetchInterval: 30_000,
    // The inbox only lists tasks assigned to the user; messages live in Messages.
    queryFn: async () => {
      // A task can have several assignees (project_task_assignees, migration 013); assignee_id is the primary one.
      const [primary, extra] = await Promise.all([
        supabase.from('project_tasks').select('*').eq('assignee_id', userId!).order('created_at', { ascending: false }).limit(200),
        supabase.from('project_task_assignees').select('task_id').eq('user_id', userId!),
      ])
      if (primary.error) throw primary.error
      const byId = new Map(((primary.data ?? []) as ProjectTask[]).map((task) => [task.id, task]))
      const extraIds = ((extra.error ? [] : extra.data ?? []) as Array<{ task_id: string }>).map((row) => row.task_id).filter((id) => !byId.has(id))
      if (extraIds.length) {
        const { data, error } = await supabase.from('project_tasks').select('*').in('id', extraIds)
        if (error) throw error
        for (const task of (data ?? []) as ProjectTask[]) byId.set(task.id, task)
      }
      const tasks = [...byId.values()].filter((task) => !task.archived_at)
      if (!tasks.length) return [] as InboxItem[]

      const [columnsResult, commentsResult] = await Promise.all([
        supabase.from('project_columns').select('id,name').in('board_id', [...new Set(tasks.map((task) => task.board_id))]),
        supabase.from('project_task_comments').select('task_id,user_id,created_at').in('task_id', tasks.map((task) => task.id)),
      ])
      const comments = (commentsResult.data ?? []) as Array<{ task_id: string; user_id: string | null; created_at: string }>
      const commentCounts = new Map<string, number>()
      const lastOtherComment = new Map<string, { at: string; by: string | null }>()
      for (const row of comments) {
        commentCounts.set(row.task_id, (commentCounts.get(row.task_id) ?? 0) + 1)
        if (row.user_id === userId) continue
        const previous = lastOtherComment.get(row.task_id)
        if (!previous || Date.parse(row.created_at) > Date.parse(previous.at)) lastOtherComment.set(row.task_id, { at: row.created_at, by: row.user_id })
      }

      const activityOf = (task: ProjectTask): { activity: InboxActivity; at: string; by: string | null } => {
        let result: { activity: InboxActivity; at: string; by: string | null } = { activity: 'assigned', at: task.created_at, by: task.created_by }
        // Changes the user made themselves never mark the task unread.
        if (task.updated_at && task.updated_by && task.updated_by !== userId && Date.parse(task.updated_at) - Date.parse(task.created_at) > 5_000) {
          result = { activity: 'updated', at: task.updated_at, by: task.updated_by }
        }
        const comment = lastOtherComment.get(task.id)
        if (comment && latest(comment.at, result.at) === comment.at) result = { activity: 'commented', at: comment.at, by: comment.by }
        return result
      }
      const activities = new Map(tasks.map((task) => [task.id, activityOf(task)]))

      const profileIds = [...new Set([...tasks.map((task) => task.created_by), ...[...activities.values()].map((item) => item.by)].filter((id): id is string => !!id))]
      const { data: profileRows } = profileIds.length ? await supabase.from('profiles').select('*').in('id', profileIds) : { data: [] }
      const profiles = new Map(((profileRows ?? []) as Profile[]).map((profile) => [profile.id, profile]))
      const doneColumns = new Set(((columnsResult.data ?? []) as Array<{ id: string; name: string }>).filter((column) => /done|complete/i.test(column.name)).map((column) => column.id))

      return tasks.map((task): InboxItem => {
        const activity = activities.get(task.id)!
        return {
          id: task.id,
          task,
          assigner: task.created_by ? profiles.get(task.created_by) ?? null : null,
          done: doneColumns.has(task.column_id),
          commentsCount: commentCounts.get(task.id) ?? 0,
          createdAt: task.created_at,
          activity: activity.activity,
          activityAt: activity.at,
          actor: activity.by ? profiles.get(activity.by) ?? null : null,
          href: `/projects?board=${task.board_id}&task=${task.id}`,
        }
      }).sort((a, b) => Date.parse(b.activityAt) - Date.parse(a.activityAt))
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
