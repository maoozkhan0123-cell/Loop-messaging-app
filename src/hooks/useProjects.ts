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
    staleTime: 60_000,
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
    staleTime: 60_000,
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
    staleTime: 30_000,
    queryFn: async () => {
      const { data: tasksData, error: tasksErr } = await supabase
        .from('project_tasks')
        .select('*')
        .eq('board_id', activeBoardId)
        .is('archived_at', null)
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

  // Lightweight workspace catalog for cross-project dependencies, hierarchy,
  // and task linking. Board rendering continues to use the enriched active
  // query above, while the modal can search every active task by stable ID.
  const workspaceTasksQuery=useQuery({
    queryKey:['project_tasks_workspace'],
    staleTime:60_000,
    queryFn:async () => {
      const {data,error}=await supabase.from('project_tasks').select('*').is('archived_at',null).order('created_at',{ascending:false})
      if (error) throw error
      return (data??[]) as ProjectTask[]
    },
  })
  const workspaceColumnsQuery=useQuery({
    queryKey:['project_columns_workspace'],
    staleTime:60_000,
    queryFn:async () => {
      const {data,error}=await supabase.from('project_columns').select('*').order('position',{ascending:true})
      if (error) throw error
      return (data??[]) as ProjectColumn[]
    },
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

  useEffect(() => {
    const channel=supabase.channel('project_workspace_catalog').on(
      'postgres_changes',
      {event:'*',schema:'public',table:'project_tasks'},
      () => { queryClient.invalidateQueries({queryKey:['project_tasks_workspace']}) },
    ).on(
      'postgres_changes',
      {event:'*',schema:'public',table:'project_columns'},
      () => { queryClient.invalidateQueries({queryKey:['project_columns_workspace']}) },
    ).subscribe()
    return () => { void supabase.removeChannel(channel) }
  },[queryClient,supabase])

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
      queryClient.invalidateQueries({queryKey:['project_columns_workspace']})
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
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
      queryClient.invalidateQueries({queryKey:['project_columns_workspace']})
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    }
  })

  // Mutation: Create Task
  const createTaskMutation = useMutation({
    mutationFn: async ({
      id,
      boardId,
      columnId,
      title,
      description,
      priority = 'medium',
      assigneeId,
      dueDate,
      startDate,
      estimatedHours,
    }: {
      id?: string
      boardId: string
      columnId: string
      title: string
      description?: string
      priority?: TaskPriority
      assigneeId?: string
      dueDate?: string
      startDate?: string
      estimatedHours?:number
    }) => {
      const { data: { user } } = await supabase.auth.getUser()
      const columnTasks = (tasksQuery.data || []).filter((t) => t.column_id === columnId)
      const nextPos = columnTasks.length

      const { data, error } = await supabase
        .from('project_tasks')
        .insert({
          ...(id ? { id } : {}),
          board_id: boardId,
          column_id: columnId,
          title,
          description: description || null,
          priority,
          assignee_id: assigneeId || null,
          due_date: dueDate || null,
          start_date:startDate||null,
          estimated_hours:estimatedHours??null,
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
      queryClient.invalidateQueries({queryKey:['project_tasks_workspace']})
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
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
      queryClient.invalidateQueries({queryKey:['project_tasks_workspace']})
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    }
  })

  // Mutation: Move a task to another project/board using its first workflow column.
  // Destination columns are resolved at action time so the modal never presents a
  // fake move control for boards whose columns were not already loaded.
  const moveTaskToBoardMutation = useMutation({
    mutationFn: async ({ taskId, destinationBoardId }: { taskId: string; destinationBoardId: string }) => {
      const { data: destinationColumns, error: columnsError } = await supabase
        .from('project_columns')
        .select('*')
        .eq('board_id', destinationBoardId)
        .order('position', { ascending: true })
        .limit(1)
      if (columnsError) throw columnsError
      const destinationColumn = (destinationColumns?.[0] ?? null) as ProjectColumn | null
      if (!destinationColumn) throw new Error('The destination project has no workflow columns.')

      const { count, error: countError } = await supabase
        .from('project_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('column_id', destinationColumn.id)
      if (countError) throw countError

      const { data, error } = await supabase
        .from('project_tasks')
        .update({ board_id: destinationBoardId, column_id: destinationColumn.id, position: count ?? 0 })
        .eq('id', taskId)
        .select()
        .single()
      if (error) throw error
      return data as ProjectTask
    },
    onMutate:async ({taskId}) => {
      await queryClient.cancelQueries({queryKey:['project_tasks',activeBoardId]})
      const previous=queryClient.getQueryData<ProjectTask[]>(['project_tasks',activeBoardId])
      if (previous) queryClient.setQueryData<ProjectTask[]>(['project_tasks',activeBoardId],previous.filter((task) => task.id!==taskId))
      return {previous}
    },
    onError:(_error,_variables,context) => {
      if (context?.previous) queryClient.setQueryData(['project_tasks',activeBoardId],context.previous)
    },
    onSuccess: (task) => {
      queryClient.invalidateQueries({ queryKey: ['project_tasks', activeBoardId] })
      queryClient.invalidateQueries({ queryKey: ['project_tasks', task.board_id] })
      queryClient.invalidateQueries({queryKey:['project_tasks_workspace']})
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    }
  })

  // Mutation: Update Task Details
  const updateTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      title,
      description,
      priority,
      columnId,
      assigneeId,
      dueDate,
      startDate,
      estimatedHours,
      archivedAt
    }: {
      taskId: string
      title?: string
      description?: string
      priority?: TaskPriority
      columnId?: string
      assigneeId?: string | null
      dueDate?: string | null
      startDate?: string | null
      estimatedHours?: number | null
      archivedAt?: string | null
    }) => {
      const updates: Record<string, unknown> = {}
      if (title !== undefined) updates.title = title
      if (description !== undefined) updates.description = description
      if (priority !== undefined) updates.priority = priority
      if (columnId !== undefined) updates.column_id = columnId
      if (assigneeId !== undefined) updates.assignee_id = assigneeId
      if (dueDate !== undefined) updates.due_date = dueDate
      if (startDate !== undefined) updates.start_date = startDate
      if (estimatedHours !== undefined) updates.estimated_hours = estimatedHours
      if (archivedAt !== undefined) updates.archived_at = archivedAt

      const { data, error } = await supabase
        .from('project_tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onMutate: async (variables) => {
      await queryClient.cancelQueries({queryKey:['project_tasks',activeBoardId]})
      const previous=queryClient.getQueryData<ProjectTask[]>(['project_tasks',activeBoardId])
      if (previous) {
        queryClient.setQueryData<ProjectTask[]>(['project_tasks',activeBoardId],previous.map((task) => task.id!==variables.taskId?task:{
          ...task,
          ...(variables.title!==undefined?{title:variables.title}:{}),
          ...(variables.description!==undefined?{description:variables.description}:{}),
          ...(variables.priority!==undefined?{priority:variables.priority}:{}),
          ...(variables.columnId!==undefined?{column_id:variables.columnId}:{}),
          ...(variables.assigneeId!==undefined?{assignee_id:variables.assigneeId}:{}),
          ...(variables.dueDate!==undefined?{due_date:variables.dueDate}:{}),
          ...(variables.startDate!==undefined?{start_date:variables.startDate}:{}),
          ...(variables.estimatedHours!==undefined?{estimated_hours:variables.estimatedHours}:{}),
          ...(variables.archivedAt!==undefined?{archived_at:variables.archivedAt}:{}),
        }).filter((task) => !task.archived_at))
      }
      return {previous}
    },
    onError: (_error,_variables,context) => {
      if (context?.previous) queryClient.setQueryData(['project_tasks',activeBoardId],context.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['project_tasks', activeBoardId] })
      queryClient.invalidateQueries({queryKey:['project_tasks_workspace']})
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
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
      queryClient.invalidateQueries({queryKey:['project_tasks_workspace']})
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
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
    workspaceTasks:workspaceTasksQuery.data||[],
    workspaceColumns:workspaceColumnsQuery.data||[],
    isLoading: boardsQuery.isLoading || columnsQuery.isLoading || tasksQuery.isLoading,
    createBoard: createBoardMutation.mutateAsync,
    createColumn: createColumnMutation.mutateAsync,
    createTask: createTaskMutation.mutateAsync,
    moveTask: moveTaskMutation.mutateAsync,
    moveTaskToBoard: moveTaskToBoardMutation.mutateAsync,
    updateTask: updateTaskMutation.mutateAsync,
    deleteTask: deleteTaskMutation.mutateAsync,
    addTaskComment: addTaskCommentMutation.mutateAsync
  }
}

export function useTaskComments(taskId?: string) {
  const supabase = createClient()
  const queryClient=useQueryClient()

  useEffect(() => {
    if (!taskId) return
    const channel=supabase.channel(`project_task_comments_${taskId}`).on(
      'postgres_changes',
      {event:'*',schema:'public',table:'project_task_comments',filter:`task_id=eq.${taskId}`},
      () => { queryClient.invalidateQueries({queryKey:['project_task_comments',taskId]}) },
    ).subscribe()
    return () => { void supabase.removeChannel(channel) }
  },[queryClient,supabase,taskId])

  return useQuery({
    queryKey: ['project_task_comments', taskId],
    enabled: !!taskId,
    staleTime: 30_000,
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
