'use client'

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type {
  ProjectBoard,
  ProjectColumn,
  ProjectTask,
  ProjectTaskComment,
  TaskPriority,
  Profile
} from '@/types/database'

export function useProjects(selectedBoardId?: string) {
  const supabase = createClient()
  const queryClient = useQueryClient()

  // 1. Fetch all boards
  const boardsQuery = useQuery({
    queryKey: ['project_boards'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_boards')
        .select('*')
        .is('archived_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as ProjectBoard[]
    }
  })

  const activeBoardId = selectedBoardId || boardsQuery.data?.[0]?.id

  // 2. Fetch columns for active board
  const columnsQuery = useQuery({
    queryKey: ['project_columns', activeBoardId],
    enabled: !!activeBoardId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_columns')
        .select('*')
        .eq('board_id', activeBoardId)
        .order('position', { ascending: true })

      if (error) throw error
      return (data ?? []) as ProjectColumn[]
    }
  })

  // 3. Fetch tasks for active board
  const tasksQuery = useQuery({
    queryKey: ['project_tasks', activeBoardId],
    enabled: !!activeBoardId,
    queryFn: async () => {
      const { data: tasksData, error: tasksErr } = await supabase
        .from('project_tasks')
        .select('*')
        .eq('board_id', activeBoardId)
        .order('position', { ascending: true })

      if (tasksErr) throw tasksErr

      if (!tasksData || tasksData.length === 0) return []

      const typedTasks = tasksData as ProjectTask[]

      // Fetch profiles for assignees
      const assigneeIds = Array.from(
        new Set(typedTasks.map((t: ProjectTask) => t.assignee_id).filter(Boolean))
      ) as string[]

      let profilesMap: Record<string, Profile> = {}
      if (assigneeIds.length > 0) {
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('*')
          .in('id', assigneeIds)
        if (profilesData) {
          const typedProfiles = profilesData as Profile[]
          profilesMap = Object.fromEntries(typedProfiles.map((p: Profile) => [p.id, p]))
        }
      }

      // Fetch comments count for each task
      const taskIds = typedTasks.map((t: ProjectTask) => t.id)
      const { data: commentsData } = await supabase
        .from('project_task_comments')
        .select('task_id')
        .in('task_id', taskIds)

      const commentsCountMap: Record<string, number> = {}
      if (commentsData) {
        (commentsData as Array<{ task_id: string }>).forEach((c) => {
          commentsCountMap[c.task_id] = (commentsCountMap[c.task_id] || 0) + 1
        })
      }

      return typedTasks.map((t: ProjectTask) => ({
        ...t,
        assignee: t.assignee_id ? profilesMap[t.assignee_id] : undefined,
        comments_count: commentsCountMap[t.id] || 0
      })) as ProjectTask[]
    }
  })

  // Realtime subscription for live task updates
  useEffect(() => {
    if (!activeBoardId) return

    const channel = supabase
      .channel(`project_board_${activeBoardId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_tasks', filter: `board_id=eq.${activeBoardId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['project_tasks', activeBoardId] })
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_columns', filter: `board_id=eq.${activeBoardId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['project_columns', activeBoardId] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeBoardId, supabase, queryClient])

  // Mutation: Create a new Board (with default columns)
  const createBoardMutation = useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: board, error: boardErr } = await supabase
        .from('project_boards')
        .insert({ name, description, created_by: user.id })
        .select()
        .single()

      if (boardErr) throw boardErr

      // Add default columns: To Do, In Progress, Review, Done
      const defaultCols = [
        { board_id: board.id, name: 'To Do', position: 0 },
        { board_id: board.id, name: 'In Progress', position: 1 },
        { board_id: board.id, name: 'Review', position: 2 },
        { board_id: board.id, name: 'Done', position: 3 }
      ]

      await supabase.from('project_columns').insert(defaultCols)
      return board as ProjectBoard
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_boards'] })
    }
  })

  // Mutation: Create a Column
  const createColumnMutation = useMutation({
    mutationFn: async ({ boardId, name }: { boardId: string; name: string }) => {
      const currentCols = columnsQuery.data || []
      const nextPos = currentCols.length

      const { data, error } = await supabase
        .from('project_columns')
        .insert({ board_id: boardId, name, position: nextPos })
        .select()
        .single()

      if (error) throw error
      return data as ProjectColumn
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project_columns', vars.boardId] })
    }
  })

  // Mutation: Create Task
  const createTaskMutation = useMutation({
    mutationFn: async ({
      boardId,
      columnId,
      title,
      description,
      priority = 'medium',
      assigneeId,
      dueDate
    }: {
      boardId: string
      columnId: string
      title: string
      description?: string
      priority?: TaskPriority
      assigneeId?: string
      dueDate?: string
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const columnTasks = (tasksQuery.data || []).filter((t) => t.column_id === columnId)
      const nextPos = columnTasks.length

      const { data, error } = await supabase
        .from('project_tasks')
        .insert({
          board_id: boardId,
          column_id: columnId,
          title,
          description: description || null,
          priority,
          assignee_id: assigneeId || null,
          due_date: dueDate || null,
          created_by: user?.id || null,
          position: nextPos
        })
        .select()
        .single()

      if (error) throw error
      return data as ProjectTask
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project_tasks', vars.boardId] })
    }
  })

  // Mutation: Move Task (update column and/or position)
  const moveTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      targetColumnId,
      newPosition
    }: {
      taskId: string
      targetColumnId: string
      newPosition: number
    }) => {
      const { data, error } = await supabase
        .from('project_tasks')
        .update({ column_id: targetColumnId, position: newPosition })
        .eq('id', taskId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onMutate: async ({ taskId, targetColumnId, newPosition }) => {
      await queryClient.cancelQueries({ queryKey: ['project_tasks', activeBoardId] })
      const previous = queryClient.getQueryData<ProjectTask[]>(['project_tasks', activeBoardId])

      if (previous) {
        queryClient.setQueryData<ProjectTask[]>(
          ['project_tasks', activeBoardId],
          previous.map((t) => (t.id === taskId ? { ...t, column_id: targetColumnId, position: newPosition } : t))
        )
      }
      return { previous }
    },
    onError: (_, __, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['project_tasks', activeBoardId], ctx.previous)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['project_tasks', activeBoardId] })
    }
  })

  // Mutation: Update Task Details
  const updateTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      title,
      description,
      priority,
      assigneeId,
      dueDate
    }: {
      taskId: string
      title?: string
      description?: string
      priority?: TaskPriority
      assigneeId?: string | null
      dueDate?: string | null
    }) => {
      const updates: Record<string, unknown> = {}
      if (title !== undefined) updates.title = title
      if (description !== undefined) updates.description = description
      if (priority !== undefined) updates.priority = priority
      if (assigneeId !== undefined) updates.assignee_id = assigneeId
      if (dueDate !== undefined) updates.due_date = dueDate

      const { data, error } = await supabase
        .from('project_tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_tasks', activeBoardId] })
    }
  })

  // Mutation: Delete Task
  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase.from('project_tasks').delete().eq('id', taskId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_tasks', activeBoardId] })
    }
  })

  // Mutation: Add Task Comment
  const addTaskCommentMutation = useMutation({
    mutationFn: async ({ taskId, comment }: { taskId: string; comment: string }) => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data, error } = await supabase
        .from('project_task_comments')
        .insert({ task_id: taskId, user_id: user.id, comment: comment.trim() })
        .select()
        .single()

      if (error) throw error
      return data as ProjectTaskComment
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['project_task_comments', vars.taskId] })
      queryClient.invalidateQueries({ queryKey: ['project_tasks', activeBoardId] })
    }
  })

  return {
    boards: boardsQuery.data || [],
    activeBoardId,
    columns: columnsQuery.data || [],
    tasks: tasksQuery.data || [],
    isLoading: boardsQuery.isLoading || columnsQuery.isLoading || tasksQuery.isLoading,
    createBoard: createBoardMutation.mutateAsync,
    createColumn: createColumnMutation.mutateAsync,
    createTask: createTaskMutation.mutateAsync,
    moveTask: moveTaskMutation.mutateAsync,
    updateTask: updateTaskMutation.mutateAsync,
    deleteTask: deleteTaskMutation.mutateAsync,
    addTaskComment: addTaskCommentMutation.mutateAsync
  }
}

export function useTaskComments(taskId?: string) {
  const supabase = createClient()

  return useQuery({
    queryKey: ['project_task_comments', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })

      if (error) throw error
      if (!data || data.length === 0) return []

      const typedData = data as ProjectTaskComment[]
      const userIds = Array.from(new Set(typedData.map((c: ProjectTaskComment) => c.user_id).filter(Boolean))) as string[]

      let profilesMap: Record<string, Profile> = {}
      if (userIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', userIds)
        if (profiles) {
          const typedProfiles = profiles as Profile[]
          profilesMap = Object.fromEntries(typedProfiles.map((p: Profile) => [p.id, p]))
        }
      }

      return typedData.map((c: ProjectTaskComment) => ({
        ...c,
        profile: c.user_id ? profilesMap[c.user_id] : undefined
      })) as ProjectTaskComment[]
    }
  })
}
