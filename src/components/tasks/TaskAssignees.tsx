import { Avatar } from '@/components/ui/Avatar'
import type { Profile, ProjectTask } from '@/types/database'

type TaskAssigneesProps = {
  task: Pick<ProjectTask, 'assignee_id' | 'assignee_ids' | 'assignee'>
  profiles: Profile[]
  size?: number
  max?: number
  showNames?: boolean
}

export function TaskAssignees({ task, profiles, size = 24, max = 3, showNames = false }: TaskAssigneesProps) {
  const ids = Array.from(new Set([...(task.assignee_ids ?? []), ...(task.assignee_id ? [task.assignee_id] : [])]))
  if (!ids.length) return <span className="text-[10px] text-[var(--muted-foreground)]">Unassigned</span>
  const members = ids.map((id) => profiles.find((profile) => profile.id === id) ?? (task.assignee?.id === id ? task.assignee : undefined))
  const names = members.map((member) => member?.display_name || 'Team member')

  return (
    <span className="inline-flex min-w-0 items-center gap-2" aria-label={`Assigned to ${names.join(', ')}`} title={names.join(', ')}>
      <span className="inline-flex shrink-0 -space-x-1.5">
        {members.slice(0, max).map((member, index) => <span key={ids[index]} className="relative inline-flex rounded-full ring-2 ring-[var(--surface)]"><Avatar name={member?.display_name || 'Team member'} src={member?.avatar_url} size={size} /></span>)}
        {ids.length > max && <span className="relative grid shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-[10px] font-semibold text-[var(--primary)] ring-2 ring-[var(--surface)]" style={{ width: size, height: size }}>+{ids.length - max}</span>}
      </span>
      {showNames && <span className="truncate text-xs">{ids.length === 1 ? names[0] : `${ids.length} members`}</span>}
    </span>
  )
}
