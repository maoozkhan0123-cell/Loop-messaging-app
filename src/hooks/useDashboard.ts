'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Idea, Profile, ProjectBoard, ProjectColumn, ProjectTask } from '@/types/database'

export type DashboardMessage = {
  id: string
  body: string | null
  created_at: string
  channels: { name: string | null; type: string } | null
  profiles: { display_name: string; avatar_url: string | null } | null
}

export function useDashboard() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    staleTime: 30_000,
    queryFn: async () => {
      const [boards, columns, tasks, profiles, ideas, messages] = await Promise.all([
        supabase.from('project_boards').select('*').is('archived_at', null).order('created_at', { ascending: false }),
        supabase.from('project_columns').select('*').order('position'),
        supabase.from('project_tasks').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').order('display_name'),
        supabase.from('ideas').select('*').neq('status', 'archived').order('created_at', { ascending: false }).limit(5),
        supabase.from('messages').select('id,body,created_at,channels(name,type),profiles!messages_user_id_fkey(display_name,avatar_url)').is('deleted_at', null).order('created_at', { ascending: false }).limit(8),
      ])

      const failed = [boards, columns, tasks, profiles, ideas, messages].find((result) => result.error)
      if (failed?.error) throw failed.error

      return {
        boards: (boards.data ?? []) as ProjectBoard[],
        columns: (columns.data ?? []) as ProjectColumn[],
        tasks: (tasks.data ?? []) as ProjectTask[],
        profiles: (profiles.data ?? []) as Profile[],
        ideas: (ideas.data ?? []) as Idea[],
        messages: (messages.data ?? []) as unknown as DashboardMessage[],
      }
    },
  })

  const completeTaskMutation = useMutation({
    mutationFn: async ({ taskId, boardId }: { taskId: string; boardId: string }) => {
      const { data: columns, error: columnsError } = await supabase
        .from('project_columns')
        .select('id,name,position')
        .eq('board_id', boardId)
        .order('position', { ascending: true })

      if (columnsError) throw columnsError
      const doneColumn = columns?.find((column: Pick<ProjectColumn, 'id' | 'name' | 'position'>) => /done|complete/i.test(column.name))
      if (!doneColumn) throw new Error('This project does not have a Done column.')

      const { error } = await supabase
        .from('project_tasks')
        .update({ column_id: doneColumn.id })
        .eq('id', taskId)

      if (error) throw error
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['project_tasks', variables.boardId] })
    },
  })

  return {
    ...dashboardQuery,
    completeTask: completeTaskMutation.mutateAsync,
    isCompletingTask: completeTaskMutation.isPending,
  }
}
