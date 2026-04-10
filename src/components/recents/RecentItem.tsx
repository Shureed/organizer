import type { AppData } from '../../store/appState'
import { StatusChip } from '../shared/StatusChip'
import { TypeBadge } from '../shared/TypeBadge'

type RecentItemData = AppData['recentItems'][number]

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

interface RecentItemProps {
  item: RecentItemData
  onOpen: (id: string) => void
  isLast: boolean
}

export function RecentItem({ item, onOpen, isLast }: RecentItemProps) {
  return (
    <>
      <button
        onClick={() => onOpen(item.id)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left transition-colors"
        style={{ backgroundColor: 'transparent' }}
        onMouseEnter={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--surface2)'
        }}
        onMouseLeave={(e) => {
          ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
        }}
      >
        <TypeBadge type={item.type} />
        <span
          style={{ color: 'var(--text)' }}
          className="flex-1 text-sm truncate text-left"
        >
          {item.name}
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <StatusChip status={item.status} />
          <span style={{ color: 'var(--text-muted)' }} className="text-[10px] whitespace-nowrap">
            {item.updated_at ? timeAgo(item.updated_at) : ''}
          </span>
        </div>
      </button>
      {!isLast && (
        <div style={{ height: '1px', backgroundColor: 'var(--border)' }} className="mx-4" />
      )}
    </>
  )
}
