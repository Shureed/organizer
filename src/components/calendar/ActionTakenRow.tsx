import { TypeBadge } from '../shared/TypeBadge'

export interface ActionTakenRowProps {
  nodeId: string
  nodeName: string
  nodeType: string
  touchedAt: string // ISO timestamp string
  touchSource: 'updated' | 'comment' | 'note'
  onClick: () => void
}

const TOUCH_SOURCE_LABELS: Record<string, string> = {
  updated: 'updated',
  comment: 'commented',
  note: 'noted',
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return ''
  }
}

export function ActionTakenRow({
  nodeName,
  nodeType,
  touchedAt,
  touchSource,
  onClick,
}: ActionTakenRowProps) {
  const timeLabel = formatTime(touchedAt)
  const sourceLabel = TOUCH_SOURCE_LABELS[touchSource] || touchSource

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-[var(--surface)] border border-[var(--border)] rounded px-2 py-1.5 flex items-center gap-2 hover:bg-[var(--surface2)] transition-colors"
    >
      {/* Node name - primary content */}
      <span className="flex-1 text-xs text-[var(--text)] truncate">
        {nodeName || '(Untitled)'}
      </span>

      {/* Type badge */}
      <div className="shrink-0">
        <TypeBadge type={nodeType} />
      </div>

      {/* Touch source indicator */}
      <span className="shrink-0 text-[10px] text-[var(--text-muted)]">
        {sourceLabel}
      </span>

      {/* Formatted time */}
      <span className="shrink-0 text-[10px] text-[var(--text-muted)] whitespace-nowrap">
        {timeLabel}
      </span>
    </button>
  )
}
