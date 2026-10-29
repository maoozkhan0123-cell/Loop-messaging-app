'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Kanban,
  Plus,
  Search,
  Filter,
  Calendar,
  MessageSquare,
  ChevronRight,
  ChevronLeft,
  Trash2,
  X,
  User,
} from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { GanttChart, ViewSwitcher, type WorkView } from '@/components/ui/WorkViews'
import { useProjects, useTaskComments } from '@/hooks/useProjects'
import { useAllProfiles } from '@/hooks/useProfiles'
import { useProfile } from '@/hooks/useProfile'
import type { ProjectTask, TaskPriority, Profile } from '@/types/database'

const PRIORITY_CONFIG: Record<
  TaskPriority,
  { label: string; bg: string; text: string; border: string }
> = {
  urgent: { label: 'Urgent', bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' },
  high: { label: 'High', bg: '#FFEDD5', text: '#EA580C', border: '#FDBA74' },
  medium: { label: 'Medium', bg: '#E0F2FE', text: '#0284C7', border: '#7DD3FC' },
  low: { label: 'Low', bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB' }
}

export default function ProjectsPage() {
  const router = useRouter()
  const [selectedBoardId, setSelectedBoardId] = useState<string | undefined>(undefined)
  const {
    boards,
    activeBoardId,
    columns,
    tasks,
    isLoading,
    createBoard,
    createColumn,
    createTask,
    moveTask,
    updateTask,
    deleteTask,
    addTaskComment
  } = useProjects(selectedBoardId)

  const { data: teamProfiles = [] } = useAllProfiles()
  const { data: currentProfile } = useProfile()

  // State for Modals
  const [showNewBoardModal, setShowNewBoardModal] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [newBoardDesc, setNewBoardDesc] = useState('')

  const [showNewColumnModal, setShowNewColumnModal] = useState(false)
  const [newColName, setNewColName] = useState('')

  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const [targetColumnId, setTargetColumnId] = useState<string>('')
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDesc, setNewTaskDesc] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium')
  const [newTaskAssignee, setNewTaskAssignee] = useState<string>('')
  const [newTaskDueDate, setNewTaskDueDate] = useState<string>('')

  const [selectedTask, setSelectedTask] = useState<ProjectTask | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<string>('all')
  const [workView, setWorkView] = useState<WorkView>('board')

  useEffect(() => {
    const boardId = new URLSearchParams(window.location.search).get('board')
    if (boardId && boardId !== selectedBoardId) setSelectedBoardId(boardId)
  }, [selectedBoardId])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('newTask') !== '1' || !activeBoardId || !columns[0]) return
    setTargetColumnId(columns[0].id)
    setShowNewTaskModal(true)
    params.delete('newTask')
    const next = params.toString()
    router.replace(next ? `/projects?${next}` : '/projects', { scroll: false })
  }, [activeBoardId, columns, router])

  // Filter tasks by search & priority
  const filteredTasks = tasks.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter
    return matchesSearch && matchesPriority
  })

  // Handlers
  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBoardName.trim()) return
    const board = await createBoard({ name: newBoardName.trim(), description: newBoardDesc.trim() })
    setSelectedBoardId(board.id)
    setNewBoardName('')
    setNewBoardDesc('')
    setShowNewBoardModal(false)
  }

  const handleCreateColumn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newColName.trim() || !activeBoardId) return
    await createColumn({ boardId: activeBoardId, name: newColName.trim() })
    setNewColName('')
    setShowNewColumnModal(false)
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim() || !activeBoardId || !targetColumnId) return
    await createTask({
      boardId: activeBoardId,
      columnId: targetColumnId,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      priority: newTaskPriority,
      assigneeId: newTaskAssignee || undefined,
      dueDate: newTaskDueDate || undefined
    })
    setNewTaskTitle('')
    setNewTaskDesc('')
    setNewTaskPriority('medium')
    setNewTaskAssignee('')
    setNewTaskDueDate('')
    setShowNewTaskModal(false)
  }

  const currentBoard = boards.find((b) => b.id === (activeBoardId || selectedBoardId))

  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get('task')
    if (!taskId || selectedTask) return
    const task = tasks.find((item) => item.id === taskId)
    if (task) setSelectedTask(task)
  }, [tasks, selectedTask])

  const handleCloseTask = () => {
    setSelectedTask(null)
    const params = new URLSearchParams(window.location.search)
    params.delete('task')
    const query = params.toString()
    router.replace(query ? `/projects?${query}` : '/projects', { scroll: false })
  }

  const handleDrop = async (columnId: string) => {
    if (!draggedTaskId) return
    const position = tasks.filter((task) => task.column_id === columnId).length
    await moveTask({ taskId: draggedTaskId, targetColumnId: columnId, newPosition: position })
    setDraggedTaskId(null)
    setDragOverColumnId(null)
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#FAFAFA] overflow-hidden">
      {/* Top Header */}
      <header className="bg-white border-b border-[#E4E4E7] px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-3 sm:gap-4 flex-shrink-0 z-10 shadow-2xs">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-black flex items-center justify-center text-white shadow-sm flex-shrink-0">
            <Kanban size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <select
                value={activeBoardId || ''}
                onChange={(e) => setSelectedBoardId(e.target.value)}
                className="text-base sm:text-lg font-bold text-[#000000] bg-transparent focus:outline-none cursor-pointer border border-transparent hover:border-[#E4E4E7] rounded-lg px-1 sm:px-2 py-0.5 transition-colors max-w-[160px] sm:max-w-none truncate"
              >
                {boards.length === 0 && <option value="">No Project Boards</option>}
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-[#71717A] hidden sm:block">
              {currentBoard?.description || 'Track team tasks and project progress'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {/* Search bar */}
          <div className="relative flex-1 sm:flex-none">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#A1A1AA]" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg w-full sm:w-48 focus:outline-none focus:border-[#000000] focus:bg-white transition-all"
            />
          </div>

          {/* Priority filter */}
          <div className="flex items-center gap-1.5 bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg px-2.5 py-1 text-xs text-[#27272A]">
            <Filter size={13} className="text-[#A1A1AA]" />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="bg-transparent focus:outline-none cursor-pointer font-medium"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <ViewSwitcher value={workView} onChange={setWorkView} includeBoard />

          {/* New Board Button */}
          <button
            type="button"
            onClick={() => setShowNewBoardModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#000000] bg-white hover:bg-[#F4F4F5] border border-[#E4E4E7] rounded-lg transition-colors cursor-pointer"
          >
            <Plus size={14} /> New Board
          </button>

          {/* New Task Button */}
          {activeBoardId && columns.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setTargetColumnId(columns[0]?.id || '')
                setShowNewTaskModal(true)
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-black hover:bg-[#18181B] rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus size={14} /> Add Task
            </button>
          )}
        </div>
      </header>

      {/* Main Board View */}
      <main className="flex-1 p-3 sm:p-6 overflow-x-auto overflow-y-hidden">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-[#9CA3AF] text-sm gap-2">
            <div className="w-5 h-5 border-2 border-[#1E40AF] border-t-transparent rounded-full animate-spin" />
            Loading project board...
          </div>
        ) : boards.length === 0 ? (
          /* Empty state */
          <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto px-4">
            <div className="w-16 h-16 rounded-2xl bg-[#EFF6FF] flex items-center justify-center text-[#1E40AF] mb-4">
              <Kanban size={32} />
            </div>
            <h3 className="text-lg font-bold text-[#0D1F31] mb-1">No Project Boards Yet</h3>
            <p className="text-sm text-[#6B7280] mb-6">
              Create your first project board to track tasks, assign team members, and monitor progress.
            </p>
            <button
              type="button"
              onClick={() => setShowNewBoardModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#1E40AF] hover:bg-[#1D4ED8] rounded-xl shadow-md transition-all cursor-pointer"
            >
              <Plus size={16} /> Create First Board
            </button>
          </div>
        ) : workView === 'list' ? (
          <div className="h-full overflow-y-auto rounded-xl border border-[var(--ui-border)] bg-[var(--surface)]">
            <div className="grid min-w-[720px] grid-cols-[minmax(260px,1fr)_150px_110px_150px_90px] border-b border-[var(--ui-border)] bg-[var(--surface-raised)] px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)]"><span>Task</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Due</span></div>
            {filteredTasks.map((task) => <button key={task.id} type="button" onClick={() => setSelectedTask(task)} className="grid w-full min-w-[720px] grid-cols-[minmax(260px,1fr)_150px_110px_150px_90px] items-center border-b border-[var(--ui-border)] px-4 py-3 text-left last:border-b-0 hover:bg-[var(--surface-muted)]"><span className="min-w-0"><strong className="block truncate text-xs">{task.title}</strong><span className="block truncate text-[10px] text-[var(--muted-foreground)]">{task.description || 'No description'}</span></span><span className="text-xs text-[var(--muted-foreground)]">{columns.find((column) => column.id === task.column_id)?.name || 'Unknown'}</span><span><span className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ background: PRIORITY_CONFIG[task.priority].bg, color: PRIORITY_CONFIG[task.priority].text }}>{PRIORITY_CONFIG[task.priority].label}</span></span><span className="flex items-center gap-2 text-xs">{task.assignee ? <><Avatar src={task.assignee.avatar_url} name={task.assignee.display_name} size={24}/><span className="truncate">{task.assignee.display_name}</span></> : <span className="text-[var(--muted-foreground)]">Unassigned</span>}</span><span className="text-xs text-[var(--muted-foreground)]">{task.due_date ? new Date(task.due_date).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : '—'}</span></button>)}
            {!filteredTasks.length && <div className="grid min-h-48 place-items-center text-sm text-[var(--muted-foreground)]">No tasks match your filters.</div>}
          </div>
        ) : workView === 'gantt' ? (
          <GanttChart items={filteredTasks.map((task) => ({ id: task.id, title: task.title, subtitle: columns.find((column) => column.id === task.column_id)?.name, start: task.start_date || task.created_at, end: task.due_date || task.start_date || task.created_at, color: PRIORITY_CONFIG[task.priority].text, onClick: () => setSelectedTask(task) }))} emptyText="Add tasks to see the project timeline." />
        ) : (
          /* Kanban Board Columns */
          <div className="h-full flex items-start gap-4 sm:gap-5 pb-4">
            {columns.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.column_id === col.id)

              return (
                <div
                  key={col.id}
                  onDragOver={(event) => { event.preventDefault(); setDragOverColumnId(col.id) }}
                  onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverColumnId(null) }}
                  onDrop={(event) => { event.preventDefault(); void handleDrop(col.id) }}
                  className={`w-72 sm:w-80 flex-shrink-0 flex flex-col max-h-full rounded-2xl border shadow-xs transition-all ${dragOverColumnId === col.id ? 'bg-[#EAF7FC] border-[#289ED8] ring-2 ring-[#289ED8]/15' : 'bg-[#F2F7FB] border-[#DDE8F2]'}`}
                >
                  {/* Column Header */}
                  <div className="p-3.5 flex items-center justify-between border-b border-[#E2E8F0] bg-white/60 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-[#0D1F31]">{col.name}</h4>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#E2E8F0] text-[#475569]">
                        {colTasks.length}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setTargetColumnId(col.id)
                        setShowNewTaskModal(true)
                      }}
                      className="p-1 rounded-lg text-[#64748B] hover:text-[#0D1F31] hover:bg-white/80 transition-colors"
                      title="Add task to column"
                    >
                      <Plus size={16} />
                    </button>
                  </div>

                  {/* Task Cards Container */}
                  <div className="flex-1 p-3 overflow-y-auto space-y-3">
                    {colTasks.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[#94A3B8] border-2 border-dashed border-[#CBD5E1] rounded-xl">
                        No tasks here
                      </div>
                    ) : (
                      colTasks.map((task) => {
                        const prio = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.medium

                        return (
                          <div
                            key={task.id}
                            draggable
                            onDragStart={(event) => { setDraggedTaskId(task.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', task.id) }}
                            onDragEnd={() => { setDraggedTaskId(null); setDragOverColumnId(null) }}
                            onClick={() => setSelectedTask(task)}
                            className={`group bg-white p-4 rounded-xl border border-[#DDE8F2] shadow-xs hover:shadow-md hover:border-[#A9D5E9] transition-all cursor-grab active:cursor-grabbing relative ${draggedTaskId === task.id ? 'opacity-45 scale-[.98]' : ''}`}
                          >
                            {/* Priority Badge & Card Header */}
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className="text-[10px] font-bold px-2 py-0.5 rounded-md border"
                                style={{
                                  backgroundColor: prio.bg,
                                  color: prio.text,
                                  borderColor: prio.border
                                }}
                              >
                                {prio.label}
                              </span>

                              {/* Column move controls */}
                              <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                {columns.findIndex((c) => c.id === col.id) > 0 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const prevCol = columns[columns.findIndex((c) => c.id === col.id) - 1]
                                      moveTask({ taskId: task.id, targetColumnId: prevCol.id, newPosition: 0 })
                                    }}
                                    className="p-1 rounded text-[#94A3B8] hover:text-[#0D1F31] hover:bg-[#F1F5F9]"
                                    title="Move Left"
                                  >
                                    <ChevronLeft size={14} />
                                  </button>
                                )}
                                {columns.findIndex((c) => c.id === col.id) < columns.length - 1 && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      const nextCol = columns[columns.findIndex((c) => c.id === col.id) + 1]
                                      moveTask({ taskId: task.id, targetColumnId: nextCol.id, newPosition: 0 })
                                    }}
                                    className="p-1 rounded text-[#94A3B8] hover:text-[#0D1F31] hover:bg-[#F1F5F9]"
                                    title="Move Right"
                                  >
                                    <ChevronRight size={14} />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Task Title */}
                            <h5 className="text-xs font-bold text-[#0D1F31] mb-1 line-clamp-2">
                              {task.title}
                            </h5>

                            {/* Task Description Preview */}
                            {task.description && (
                              <p className="text-[11px] text-[#64748B] mb-3 line-clamp-2 leading-relaxed">
                                {task.description}
                              </p>
                            )}

                            {/* Card Footer: Metadata */}
                            <div className="flex items-center justify-between pt-2 border-t border-[#F1F5F9] text-[11px] text-[#64748B]">
                              <div className="flex items-center gap-2">
                                {task.due_date && (
                                  <span className="flex items-center gap-1 text-[#475569] font-medium">
                                    <Calendar size={12} className="text-[#94A3B8]" />
                                    {new Date(task.due_date).toLocaleDateString(undefined, {
                                      month: 'short',
                                      day: 'numeric'
                                    })}
                                  </span>
                                )}

                                {(task.comments_count || 0) > 0 && (
                                  <span className="flex items-center gap-1">
                                    <MessageSquare size={12} className="text-[#94A3B8]" />
                                    {task.comments_count}
                                  </span>
                                )}
                              </div>

                              {/* Assignee Avatar */}
                              {task.assignee ? (
                                <Avatar
                                  src={task.assignee.avatar_url}
                                  name={task.assignee.display_name}
                                  size={22}
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-[#F1F5F9] border border-[#CBD5E1] flex items-center justify-center text-[#94A3B8]">
                                  <User size={10} />
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}

            {/* Add Column Button */}
            <button
              type="button"
              onClick={() => setShowNewColumnModal(true)}
              className="w-72 flex-shrink-0 p-4 rounded-2xl border-2 border-dashed border-[#CBD5E1] text-[#64748B] hover:text-[#0D1F31] hover:border-[#94A3B8] flex items-center justify-center gap-2 text-sm font-semibold transition-colors bg-white/40 cursor-pointer"
            >
              <Plus size={18} /> Add Column
            </button>
          </div>
        )}
      </main>

      {/* MODAL: New Board */}
      {showNewBoardModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[#E5E7EB]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#0D1F31]">Create New Project Board</h3>
              <button
                onClick={() => setShowNewBoardModal(false)}
                className="text-[#9CA3AF] hover:text-[#0D1F31]"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateBoard} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">Board Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mobile App Redesign"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">Description</label>
                <textarea
                  placeholder="Brief overview of this board's goals..."
                  rows={3}
                  value={newBoardDesc}
                  onChange={(e) => setNewBoardDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewBoardModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[#4B5563] hover:bg-[#F3F4F6] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#1E40AF] hover:bg-[#1D4ED8] rounded-lg shadow-xs"
                >
                  Create Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: New Column */}
      {showNewColumnModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-[#E5E7EB]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#0D1F31]">Add Column</h3>
              <button
                onClick={() => setShowNewColumnModal(false)}
                className="text-[#9CA3AF] hover:text-[#0D1F31]"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateColumn} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">Column Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. QA Testing"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewColumnModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[#4B5563] hover:bg-[#F3F4F6] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#1E40AF] hover:bg-[#1D4ED8] rounded-lg shadow-xs"
                >
                  Add Column
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: New Task */}
      {showNewTaskModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-[#E5E7EB]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[#0D1F31]">Create New Task</h3>
              <button
                onClick={() => setShowNewTaskModal(false)}
                className="text-[#9CA3AF] hover:text-[#0D1F31]"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Implement OAuth Login"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3B82F6]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">Description</label>
                <textarea
                  placeholder="Task details and sub-requirements..."
                  rows={3}
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3B82F6]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#4B5563] mb-1">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3B82F6] bg-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#4B5563] mb-1">Assignee</label>
                  <select
                    value={newTaskAssignee}
                    onChange={(e) => setNewTaskAssignee(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3B82F6] bg-white"
                  >
                    <option value="">Unassigned</option>
                    {currentProfile && (
                      <option value={currentProfile.id}>
                        {currentProfile.display_name} (You)
                      </option>
                    )}
                    {teamProfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4B5563] mb-1">Due Date</label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3B82F6] bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-[#4B5563] hover:bg-[#F3F4F6] rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-[#1E40AF] hover:bg-[#1D4ED8] rounded-lg shadow-xs"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Task Detail & Comments */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          columns={columns}
          teamProfiles={Array.from(new Map([...(currentProfile ? [currentProfile] : []), ...teamProfiles].map((profile) => [profile.id, profile])).values())}
          onClose={handleCloseTask}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onAddComment={addTaskComment}
        />
      )}
    </div>
  )
}

function TaskDetailModal({
  task,
  columns,
  teamProfiles,
  onClose,
  onUpdate,
  onDelete,
  onAddComment
}: {
  task: ProjectTask
  columns: { id: string; name: string }[]
  teamProfiles: Profile[]
  onClose: () => void
  onUpdate: (params: any) => Promise<any>
  onDelete: (id: string) => Promise<any>
  onAddComment: (params: any) => Promise<any>
}) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description || '')
  const [priority, setPriority] = useState<TaskPriority>(task.priority)
  const [columnId, setColumnId] = useState(task.column_id)
  const [assigneeId, setAssigneeId] = useState(task.assignee_id || '')
  const [dueDate, setDueDate] = useState(task.due_date ? task.due_date.split('T')[0] : '')

  const [commentText, setCommentText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isCommenting, setIsCommenting] = useState(false)
  const { data: comments = [], isLoading: commentsLoading } = useTaskComments(task.id)

  const handleSave = async () => {
    if (!title.trim()) {
      setSaveError('Task title is required.')
      return
    }
    setIsSaving(true)
    setSaveError(null)
    try {
      await onUpdate({
        taskId: task.id,
        title: title.trim(),
        description,
        priority,
        columnId,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null
      })
      onClose()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Changes could not be saved.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this task?')) {
      await onDelete(task.id)
      onClose()
    }
  }

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!commentText.trim()) return
    setIsCommenting(true)
    try {
      await onAddComment({ taskId: task.id, comment: commentText.trim() })
      setCommentText('')
    } finally {
      setIsCommenting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-[#E5E7EB] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#E5E7EB]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[#EEEAFB] text-[#5141BF]">
              {columns.find((c) => c.id === columnId)?.name}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="p-1.5 text-[#DC2626] hover:bg-[#FEE2E2] rounded-lg transition-colors"
              title="Delete Task"
            >
              <Trash2 size={16} />
            </button>
            <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#0D1F31]">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-1">
              Task Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-base font-bold text-[#0D1F31] border border-[#E5E7EB] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#3B82F6]"
            />
          </div>

          {/* Controls Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-1">
                Status
              </label>
              <select
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
                className="w-full text-xs bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-[#0D1F31] focus:outline-none focus:border-[#5141BF]"
              >
                {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full text-xs bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-[#0D1F31] focus:outline-none focus:border-[#5141BF]"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-1">
                Assignee
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full text-xs bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-[#0D1F31] focus:outline-none focus:border-[#5141BF]"
              >
                <option value="">Unassigned</option>
                {teamProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full text-xs bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-2.5 py-1.5 text-[#0D1F31] focus:outline-none focus:border-[#5141BF]"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-1">
              Description
            </label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add detailed task requirements..."
                className="w-full text-xs border border-[#E5E7EB] rounded-lg px-3 py-2 focus:outline-none focus:border-[#5141BF] leading-relaxed"
            />
          </div>

          {/* Comments Section */}
          <div className="pt-4 border-t border-[#E5E7EB]">
            <h4 className="text-xs font-bold text-[#0D1F31] mb-3 flex items-center gap-1.5">
              <MessageSquare size={14} className="text-[#3B82F6]" /> Activity & Discussion ({comments.length})
            </h4>

            {/* Existing Comments */}
            <div className="space-y-3 mb-4 max-h-48 overflow-y-auto pr-1">
              {commentsLoading ? (
                <p className="text-xs text-[#9CA3AF]">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-xs text-[#9CA3AF] italic">No comments yet.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5 bg-[#F8FAFC] p-2.5 rounded-xl border border-[#E2E8F0]">
                    <Avatar src={c.profile?.avatar_url} name={c.profile?.display_name || 'User'} size={24} />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0D1F31]">
                          {c.profile?.display_name || 'User'}
                        </span>
                        <span className="text-[10px] text-[#94A3B8]">
                          {new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-[#334155] mt-0.5 leading-relaxed">{c.comment}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Comment Input */}
            <form onSubmit={handleCommentSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                disabled={isCommenting}
                className="flex-1 px-3 py-1.5 text-xs border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#5141BF] disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isCommenting || !commentText.trim()}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#5141BF] hover:bg-[#4133A5] rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCommenting ? 'Sending…' : 'Send'}
              </button>
            </form>
          </div>
        </div>

        {/* Modal Footer */}
        {saveError && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{saveError}</p>}
        <div className="flex justify-end gap-2 pt-3 border-t border-[#E5E7EB]">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-3.5 py-1.5 text-xs font-semibold text-[#4B5563] hover:bg-[#F3F4F6] rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="min-w-28 px-4 py-1.5 text-xs font-semibold text-white bg-[#5141BF] hover:bg-[#4133A5] rounded-lg shadow-xs disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
