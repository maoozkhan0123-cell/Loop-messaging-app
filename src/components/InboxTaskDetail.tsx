'use client'

import { useQueryClient } from '@tanstack/react-query'
import { TaskDetailModal } from '@/components/task-details/TaskDetailModal'
import { useProjects, useTaskComments } from '@/hooks/useProjects'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useProfile } from '@/hooks/useProfile'
import type { ProjectTask } from '@/types/database'

/** Shows the full task workspace (details + comments/activity) as a page in the content area. */
export function InboxTaskDetail({ task: initialTask, onClose }: { task: ProjectTask; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { boards, columns, tasks, workspaceTasks, workspaceColumns, createTask, moveTaskToBoard, updateTask, deleteTask, addTaskComment } = useProjects(initialTask.board_id)
  const { data: teamProfiles = [] } = useAllProfiles()
  const { data: currentProfile } = useProfile()
  const { data: comments = [] } = useTaskComments(initialTask.id)

  // Prefer the live copy from the board so edits made in the modal show up immediately.
  const task = tasks.find((item) => item.id === initialTask.id) ?? initialTask
  const close = () => {
    void queryClient.invalidateQueries({ queryKey: ['unified-inbox'] })
    onClose()
  }

  return (
    <TaskDetailModal
      key={task.id}
      task={task}
      columns={columns}
      boards={boards}
      availableTasks={workspaceTasks.length ? workspaceTasks : tasks}
      availableColumns={workspaceColumns.length ? workspaceColumns : columns}
      teamProfiles={Array.from(new Map([...(currentProfile ? [currentProfile] : []), ...teamProfiles].map((profile) => [profile.id, profile])).values())}
      currentProfile={currentProfile || undefined}
      initialComments={comments}
      onClose={close}
      onUpdate={updateTask}
      onDelete={async (id) => { await deleteTask(id); close() }}
      onDuplicate={(source, newTaskId) => createTask({
        id: newTaskId,
        boardId: source.board_id,
        columnId: source.column_id,
        title: `${source.title} (copy)`,
        description: source.description || undefined,
        priority: source.priority,
        assigneeId: source.assignee_id || undefined,
        dueDate: source.due_date || undefined,
        startDate: source.start_date || undefined,
        estimatedHours: source.estimated_hours ?? undefined,
      })}
      onMove={moveTaskToBoard}
      onAddComment={addTaskComment}
      asPage
    />
  )
}
