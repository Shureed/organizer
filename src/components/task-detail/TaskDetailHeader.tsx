import { useTaskDetail } from '../../hooks/useTaskDetail'
import { PinIcon } from '../shared/PinIcon'
import {
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

interface TaskDetailHeaderProps {
  taskId: string | null
}

export function TaskDetailHeader({ taskId }: TaskDetailHeaderProps) {
  const {
    task,
    loading,
    pinning,
    actions,
  } = useTaskDetail(taskId)

  return (
    <DialogHeader>
      <DialogTitle style={{ color: 'var(--text)' }} className="text-base font-semibold pr-6">
        {loading ? 'Loading...' : (task?.name ?? 'Task')}
      </DialogTitle>
      {!loading && task && (
        <div className="flex items-center gap-2 mt-1">
          <span
            style={{ backgroundColor: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}
            className="text-[10px] rounded px-1.5 py-0.5 font-medium"
          >
            {task.type}
          </span>
          <button
            onClick={actions.handleTogglePin}
            disabled={pinning}
            style={{ color: task.pinned ? 'var(--accent)' : 'var(--text-muted)' }}
            className="hover:text-[var(--accent)] transition-colors disabled:opacity-50"
            aria-label={task.pinned ? 'Unpin from today' : 'Pin to today'}
            title={task.pinned ? 'Unpin from today' : 'Pin to today'}
          >
            <PinIcon filled={task.pinned} />
          </button>
        </div>
      )}
    </DialogHeader>
  )
}
