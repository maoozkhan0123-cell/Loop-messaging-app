import { ListChecks } from 'lucide-react'
import { parseTaskSharedMetadata } from '@/lib/taskMetadata'
import type { ProjectTask } from '@/types/database'

export function TaskCardSummary({ task, className = '' }: { task: ProjectTask; className?: string }) {
  const metadata = parseTaskSharedMetadata(task.task_metadata)
  const labels = task.labels ?? metadata?.labels.map(label => label.name) ?? []
  const items = metadata?.checklists.flatMap(checklist => checklist.items) ?? []
  const completed = items.filter(item => item.completed).length
  if (!labels.length && !items.length) return null

  return <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
    {labels.slice(0, 3).map(label => <span key={label} title={label} className="max-w-28 truncate rounded-md bg-[var(--primary-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]">{label}</span>)}
    {labels.length > 3 && <span className="text-[10px] text-[var(--muted-foreground)]">+{labels.length - 3}</span>}
    {items.length > 0 && <span aria-label={`${completed} of ${items.length} checklist items complete`} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${completed === items.length ? 'bg-emerald-50 text-emerald-700' : 'bg-[var(--surface-muted)] text-[var(--muted-foreground)]'}`}><ListChecks size={12} />{completed}/{items.length}</span>}
  </span>
}
