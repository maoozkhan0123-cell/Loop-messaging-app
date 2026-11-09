'use client'

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { createDashboardTask, type CreateDashboardTaskInput } from '@/lib/createDashboardTask'
import type { Profile, ProjectBoard, ProjectColumn, ProjectTask } from '@/types/database'

export type { CreateDashboardTaskInput, CreateTaskChecklistInput } from '@/lib/createDashboardTask'

export function useDashboard() {
  const supabase = createClient()
  const queryClient = useQueryClient()

  const dashboardQuery = useQuery({
    queryKey: ['dashboard'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const userId = session?.user.id
      // The database already limits every list to what this user may see.
      const [boards, columns, tasks, profiles, assignments] = await Promise.all([
        supabase.from('project_boards').select('*').is('archived_at', null).order('created_at', { ascending: false }),
        supabase.from('project_columns').select('*').order('position'),
        supabase.from('project_tasks').select('*').is('archived_at', null).order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').order('display_name'),
        userId ? supabase.from('project_task_assignees').select('task_id,user_id') : Promise.resolve({ data: [], error: null }),
      ])

      const failed = [boards, columns, tasks, profiles].find((result) => result.error)
      if (failed?.error) throw failed.error
      // Legacy projects can still display their primary assignee before migration 017.
      // Creation never falls back: the atomic RPC remains required for every write.
      if (assignments.error && assignments.error.code !== '42P01' && assignments.error.code !== 'PGRST205') throw assignments.error

      const liveBoards = (boards.data ?? []) as ProjectBoard[]
      const boardIds = new Set(liveBoards.map((board) => board.id))
      const assigneesByTask = new Map<string, string[]>()
      for (const assignment of (assignments.error ? [] : assignments.data ?? []) as Array<{ task_id: string; user_id: string }>) {
        const userIds = assigneesByTask.get(assignment.task_id) ?? []
        userIds.push(assignment.user_id)
        assigneesByTask.set(assignment.task_id, userIds)
      }
      const liveTasks = ((tasks.data ?? []) as ProjectTask[]).filter((task) => boardIds.has(task.board_id)).map((task) => ({
        ...task,
        assignee_ids: Array.from(new Set([...(task.assignee_id ? [task.assignee_id] : []), ...(assigneesByTask.get(task.id) ?? [])])),
      }))
      const myTaskIds = new Set(liveTasks.filter((task) => userId && task.assignee_ids.includes(userId)).map((task) => task.id))

      return {
        userId,
        boards: liveBoards,
        columns: (columns.data ?? []) as ProjectColumn[],
        tasks: liveTasks,
        myTaskIds,
        profiles: (profiles.data ?? []) as Profile[],
      }
    },
  })

  const userId = dashboardQuery.data?.userId
  useEffect(() => {
    if (!userId) return
    const refreshTasks = () => {
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['unified-inbox'] })
      void queryClient.invalidateQueries({ queryKey: ['project_task_assignees'] })
    }
    const channel = supabase.channel(`dashboard_tasks_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_tasks' }, refreshTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_task_assignees' }, refreshTasks)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [queryClient, supabase, userId])

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
      queryClient.invalidateQueries({ queryKey: ['unified-inbox'] })
    },
  })

  const createTaskMutation = useMutation({
    mutationFn: async (input: CreateDashboardTaskInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Your session has expired. Please sign in again.')
      const currentTasks = dashboardQuery.data?.tasks.filter((task) => task.column_id === input.columnId) ?? []
      return createDashboardTask(supabase, input, currentTasks.length)
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['project_tasks', task.board_id] })
      queryClient.invalidateQueries({ queryKey: ['project_tasks_workspace'] })
      queryClient.invalidateQueries({ queryKey: ['project_task_assignees'] })
      queryClient.invalidateQueries({ queryKey: ['unified-inbox'] })
    },
  })

  return {
    ...dashboardQuery,
    completeTask: completeTaskMutation.mutateAsync,
    isCompletingTask: completeTaskMutation.isPending,
    createTask: createTaskMutation.mutateAsync,
    isCreatingTask: createTaskMutation.isPending,
  }
}
