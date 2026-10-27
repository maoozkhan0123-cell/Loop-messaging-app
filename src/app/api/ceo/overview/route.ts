import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthorizedCEO } from '@/lib/auth/ceo'
import { executiveHealthScore, executiveHealthStatus } from '@/lib/executive'

export async function GET() {
  const auth = await getAuthorizedCEO()
  if (!auth.user) return NextResponse.json({ error: auth.status === 401 ? 'Authentication required.' : 'CEO access required.' }, { status: auth.status })
  try {
    const admin = createAdminClient()
    const [profilesResult, boardsResult, columnsResult, tasksResult, eventsResult, auditResult, milestonesResult, risksResult] = await Promise.all([
      admin.from('profiles').select('*'),
      admin.from('project_boards').select('*').is('archived_at', null).order('created_at', { ascending: false }),
      admin.from('project_columns').select('*').order('position'),
      admin.from('project_tasks').select('*').order('created_at', { ascending: false }),
      admin.from('workspace_events').select('*').gte('ends_at', new Date().toISOString()).order('starts_at').limit(20),
      admin.from('executive_audit_logs').select('*').order('created_at', { ascending: false }).limit(40),
      admin.from('project_milestones').select('*').order('target_date').limit(100),
      admin.from('project_risks').select('*').neq('status', 'resolved').order('created_at', { ascending: false }).limit(100),
    ])
    for (const result of [profilesResult, boardsResult, columnsResult, tasksResult]) if (result.error) throw result.error
    const profiles = profilesResult.data ?? []
    const boards = boardsResult.data ?? []
    const columns = columnsResult.data ?? []
    const tasks = tasksResult.data ?? []
    const columnMap = new Map(columns.map((column) => [column.id, column.name.toLowerCase()]))
    const isCompleted = (task: { column_id: string }) => /done|complete|closed/.test(columnMap.get(task.column_id) ?? '')
    const isBlocked = (task: { column_id: string }) => /block|stuck|hold/.test(columnMap.get(task.column_id) ?? '')
    const now = Date.now()
    const completed = tasks.filter(isCompleted)
    const blocked = tasks.filter(isBlocked)
    const overdue = tasks.filter((task) => task.due_date && +new Date(task.due_date) < now && !isCompleted(task))
    const inProgress = tasks.filter((task) => /progress|doing|active/.test(columnMap.get(task.column_id) ?? ''))
    const upcoming = tasks.filter((task) => task.due_date && +new Date(task.due_date) >= now && +new Date(task.due_date) <= now + 7 * 86400000 && !isCompleted(task))
    const workload = profiles.map((profile) => {
      const assigned = tasks.filter((task) => task.assignee_id === profile.id)
      const active = assigned.filter((task) => !isCompleted(task))
      const estimatedHours = active.reduce((sum, task) => sum + Number(task.estimated_hours ?? 0), 0)
      const capacity = Number(profile.weekly_capacity_hours ?? 0)
      return { ...profile, activeTasks: active.length, completedTasks: assigned.filter(isCompleted).length, overdueTasks: assigned.filter((task) => task.due_date && +new Date(task.due_date) < now && !isCompleted(task)).length, blockedTasks: assigned.filter(isBlocked).length, highPriorityTasks: active.filter((task) => ['high','urgent'].includes(task.priority)).length, estimatedHours, capacityHours: capacity || null, capacityPercent: capacity ? Math.round(estimatedHours / capacity * 100) : null }
    })
    const risks = risksResult.error ? [] : risksResult.data ?? []
    const projectHealth = boards.map((board) => {
      const projectTasks = tasks.filter((task) => task.board_id === board.id)
      const projectOverdue = projectTasks.filter((task) => task.due_date && +new Date(task.due_date) < now && !isCompleted(task)).length
      const projectBlocked = projectTasks.filter(isBlocked).length
      const criticalRisks = risks.filter((risk) => risk.board_id === board.id && ['high','critical'].includes(risk.severity)).length
      const score = executiveHealthScore(projectOverdue, projectBlocked, criticalRisks)
      return { boardId: board.id, score, status: executiveHealthStatus(score), overdue: projectOverdue, blocked: projectBlocked, criticalRisks }
    })
    const alerts = [
      ...(overdue.length ? [{ id: 'overdue', severity: 'critical', title: `${overdue.length} overdue task${overdue.length === 1 ? '' : 's'} need review`, href: '/ceo/tasks?status=overdue' }] : []),
      ...(blocked.length ? [{ id: 'blocked', severity: 'warning', title: `${blocked.length} blocked task${blocked.length === 1 ? '' : 's'} need action`, href: '/ceo/tasks?status=blocked' }] : []),
      ...projectHealth.filter((project) => project.status !== 'healthy').map((project) => ({ id: `project-${project.boardId}`, severity: project.status === 'critical' ? 'critical' : 'warning', title: `${boards.find((board) => board.id === project.boardId)?.name ?? 'Project'} is ${project.status === 'critical' ? 'critical' : 'at risk'}`, href: `/ceo/projects?project=${project.boardId}` })),
      ...workload.filter((person) => person.capacityPercent !== null && person.capacityPercent > 110).map((person) => ({ id: `capacity-${person.id}`, severity: 'warning', title: `${person.display_name} is planned at ${person.capacityPercent}% capacity`, href: `/ceo/employees?employee=${person.id}` })),
    ]
    return NextResponse.json({
      generatedAt: new Date().toISOString(), profiles, boards, columns, tasks,
      events: eventsResult.error ? [] : eventsResult.data ?? [],
      activity: auditResult.error ? [] : auditResult.data ?? [],
      milestones: milestonesResult.error ? [] : milestonesResult.data ?? [],
      risks,
      projectHealth,
      alerts,
      workload,
      metrics: { employees: profiles.length, projects: boards.length, totalTasks: tasks.length, completed: completed.length, inProgress: inProgress.length, pending: tasks.length - completed.length - inProgress.length, overdue: overdue.length, blocked: blocked.length, upcoming: upcoming.length, completionRate: tasks.length ? Math.round(completed.length / tasks.length * 100) : 0 },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load executive overview.' }, { status: 500 })
  }
}
