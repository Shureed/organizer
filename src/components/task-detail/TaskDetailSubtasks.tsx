import { StatusChip } from '../shared/StatusChip'
import type { Database } from '../../types/database.types'

type ItemStatus = Database['public']['Enums']['item_status']

interface SubtaskRow {
  id: string
  name: string
  status: ItemStatus | null
}

interface TaskDetailSubtasksProps {
  subtasks: SubtaskRow[]
  onSelectSubtask: (id: string) => void
}

export function TaskDetailSubtasks({ subtasks, onSelectSubtask }: TaskDetailSubtasksProps) {
  if (subtasks.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2">
      <p style={{ color: 'var(--text-muted)' }} className="text-[11px] font-medium uppercase tracking-wide">
        Subtasks ({subtasks.length})
      </p>
      <div className="flex flex-col gap-1">
        {subtasks.map((sub) => (
          <button
            key={sub.id}
            onClick={() => onSelectSubtask(sub.id)}
            style={{
              backgroundColor: 'var(--surface2)',
              border: '1px solid var(--border)',
            }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:border-[#8b949e]/40 transition-colors"
          >
            <StatusChip status={sub.status} />
            <span style={{ color: 'var(--text)' }} className="text-sm flex-1 min-w-0 truncate">
              {sub.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
