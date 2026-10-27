'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Profile, ProjectBoard, ProjectColumn, ProjectMilestone, ProjectRisk, ProjectTask, WorkspaceEvent } from '@/types/database'

export type ExecutiveWorkload = Profile & { activeTasks: number; completedTasks: number; overdueTasks: number; blockedTasks: number; highPriorityTasks: number; estimatedHours: number; capacityHours: number | null; capacityPercent: number | null }
export type ExecutiveOverview = {
  generatedAt: string
  profiles: Profile[]
  boards: ProjectBoard[]
  columns: ProjectColumn[]
  tasks: ProjectTask[]
  events: WorkspaceEvent[]
  workload: ExecutiveWorkload[]
  milestones: ProjectMilestone[]
  risks: ProjectRisk[]
  projectHealth: Array<{ boardId: string; score: number; status: 'healthy' | 'at_risk' | 'critical'; overdue: number; blocked: number; criticalRisks: number }>
  alerts: Array<{ id: string; severity: 'critical' | 'warning'; title: string; href: string }>
  activity: Array<{ id: string; actor_id: string | null; action: string; entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string }>
  metrics: { employees: number; projects: number; totalTasks: number; completed: number; inProgress: number; pending: number; overdue: number; blocked: number; upcoming: number; completionRate: number }
}

async function fetchOverview() {
  const response = await fetch('/api/ceo/overview', { cache: 'no-store' })
  const payload = await response.json()
  if (!response.ok) throw new Error(payload.error ?? 'Unable to load executive data.')
  return payload as ExecutiveOverview
}

export function useCEOOverview() {
  return useQuery({ queryKey: ['ceo-overview'], queryFn: fetchOverview, refetchInterval: 30_000, staleTime: 15_000 })
}

export function useRefreshCEO() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ['ceo-overview'] })
}
