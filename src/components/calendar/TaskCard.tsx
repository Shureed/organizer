import type { Database } from '../../types/database.types'
import { StatusChip } from '../shared/StatusChip'

type ItemStatus = Database['public']['Enums']['item_status']

export interface TaskCardTask {
  id: string | null
  name: string | null
  status: ItemStatus | null
}

interface TaskCardProps {
  task: TaskCardTask
  onClick: () => void
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[var(--surface)] border border-[var(--border)] rounded-lg p-2.5 flex items-start gap-2 hover:bg-[var(--surface2)] transition-colors"
    >
      <span className="flex-1 text-sm text-[var(--text)] leading-snug truncate">
        {task.name ?? '(Untitled)'}
      </span>
      <div className="shrink-0 mt-0.5">
        <StatusChip status={task.status} />
      </div>
    </button>
  )
}
