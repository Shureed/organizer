import type { ActiveTask } from '../../store/appState'
import { TypeBadge } from '../shared/TypeBadge'
import { PhaseBadge } from '../shared/PhaseBadge'
import type { NodePhase } from '../shared/PhaseBadge'
import { StatusChip } from '../shared/StatusChip'
import { PriorityDot } from '../shared/PriorityDot'

interface IssueCardProps {
  task: ActiveTask
  phase?: NodePhase | null
  onClick: () => void
}

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function IssueCard({ task, phase, onClick }: IssueCardProps) {
  const formattedDate = formatDate(task.date)

  return (
    <button
      onClick={onClick}
      className="w-full text-left"
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
        }}
        className="rounded-xl p-3 space-y-2 hover:brightness-110 transition-all active:scale-[0.99]"
      >
        {/* Top row: TypeBadge + PhaseBadge */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <TypeBadge type={task.type} />
            <PhaseBadge phase={phase} />
          </div>
          <PriorityDot priority={task.priority} />
        </div>

        {/* Name */}
        <p
          style={{ color: 'var(--text)' }}
          className="font-semibold text-sm leading-snug"
        >
          {task.name}
        </p>

        {/* Bottom row: status chip + meta */}
        <div className="flex items-center gap-2 flex-wrap">
          <StatusChip status={task.status} />
          {task.project_name && (
            <span
              style={{ color: 'var(--text-muted)' }}
              className="text-[11px]"
            >
              {task.project_name}
            </span>
          )}
          {formattedDate && (
            <span
              style={{ color: 'var(--text-muted)' }}
              className="text-[11px] ml-auto"
            >
              {formattedDate}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
