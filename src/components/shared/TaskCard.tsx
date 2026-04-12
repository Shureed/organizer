import { useState } from 'react'
import type { ActiveTask } from '../../store/appState'
import { useMutations } from '../../hooks/useMutations'
import { StatusChip } from './StatusChip'
import { TypeBadge } from './TypeBadge'
import { PriorityDot } from './PriorityDot'
import { PinIcon } from './PinIcon'

interface TaskCardProps {
  task: ActiveTask
  onClick?: () => void
  showProject?: boolean
  showDate?: boolean
  dimmed?: boolean
}

function formatDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  if (dateStr === todayStr) return 'Today'

  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function TaskCard({ task, onClick, showProject = false, showDate = false, dimmed = false }: TaskCardProps) {
  const [pinning, setPinning] = useState(false)
  const { toggleTaskPin } = useMutations()
  const formattedDate = showDate ? formatDate(task.date) : null

  const handlePin = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!task.id) return
    setPinning(true)
    try {
      await toggleTaskPin(task.id, !task.pinned)
    } finally {
      setPinning(false)
    }
  }

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      style={{
        backgroundColor: 'var(--surface)',
        border: task.pinned ? '1px solid var(--accent)' : '1px solid var(--border)',
        opacity: dimmed ? 0.5 : 1,
        cursor: onClick ? 'pointer' : 'default',
      }}
      className={`rounded-xl p-3 flex flex-col gap-2 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40 ${onClick ? 'card-interactive' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={handlePin}
          disabled={pinning}
          style={{ color: task.pinned ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0, marginTop: '1px' }}
          className="hover:text-[var(--accent)] transition-colors disabled:opacity-50"
          aria-label={task.pinned ? 'Unpin' : 'Pin to today'}
        >
          <PinIcon filled={!!task.pinned} />
        </button>
        <PriorityDot priority={task.priority} />
        <span
          style={{ color: 'var(--text)' }}
          className="text-sm leading-snug flex-1 min-w-0"
        >
          {task.name}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <StatusChip status={task.status} />
        <TypeBadge type={task.type} />
        {showProject && task.project_name && (
          <span
            style={{ color: 'var(--text-muted)' }}
            className="text-[10px] leading-none"
          >
            {task.project_name}
          </span>
        )}
        {formattedDate && (
          <span
            style={{ color: 'var(--text-muted)' }}
            className="text-[10px] leading-none ml-auto font-mono-data"
          >
            {formattedDate}
          </span>
        )}
      </div>
    </div>
  )
}
