'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Profile, ProjectBoard, ProjectColumn, ProjectTask, TaskPriority } from '@/types/database'

export type CreateDashboardTaskInput = {
  boardId: string
  columnId: string
  title: string
  description?: string
  priority: TaskPriority
  assigneeId?: string
  dueDate: string
}

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
        userId ? supabase.from('project_task_assignees').select('task_id').eq('user_id', userId) : Promise.resolve({ data: [], error: null }),
      ])

      const failed = [boards, columns, tasks, profiles].find((result) => result.error)
      if (failed?.error) throw failed.error

      const liveBoards = (boards.data ?? []) as ProjectBoard[]
      const boardIds = new Set(liveBoards.map((board) => board.id))
      const liveTasks = ((tasks.data ?? []) as ProjectTask[]).filter((task) => boardIds.has(task.board_id))
      // Tasks assigned to me: primary assignee, or one of several (project_task_assignees).
      const assignedIds = new Set(((assignments.error ? [] : assignments.data ?? []) as Array<{ task_id: string }>).map((row) => row.task_id))
      const myTaskIds = new Set(liveTasks.filter((task) => task.assignee_id === userId || assignedIds.has(task.id)).map((task) => task.id))

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
      const { data, error } = await supabase.from('project_tasks').insert({
        board_id: input.boardId,
        column_id: input.columnId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        priority: input.priority,
        assignee_id: input.assigneeId || null,
        due_date: input.dueDate,
        created_by: user.id,
        position: currentTasks.length,
      }).select().single()
      if (error) throw error
      return data as ProjectTask
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      queryClient.invalidateQueries({ queryKey: ['project_tasks', task.board_id] })
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
