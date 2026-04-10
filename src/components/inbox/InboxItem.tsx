import { useState } from 'react'
import type { InboxItem as InboxItemType } from '../../store/appState'
import { useMutations } from '../../hooks/useMutations'
import { useDataLoader } from '../../hooks/useDataLoader'
import { SourceBadge } from './SourceBadge'

interface InboxItemProps {
  item: InboxItemType
  onOpenDetail: (id: string) => void
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d ago`
}

export function InboxItem({ item, onOpenDetail }: InboxItemProps) {
  const [dismissing, setDismissing] = useState(false)
  const { archiveInbox } = useMutations()
  const { refreshInbox } = useDataLoader()

  const title = item.title || (item.body ? item.body.slice(0, 60) : 'Untitled')
  const bodyPreview = item.body ?? ''

  const handleDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item.id) return
    setDismissing(true)
    try {
      await archiveInbox(item.id)
      await refreshInbox()
    } finally {
      setDismissing(false)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => item.id && onOpenDetail(item.id)}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && item.id) onOpenDetail(item.id) }}
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        opacity: item.archived ? 0.5 : 1,
        cursor: 'pointer',
      }}
      className="rounded-xl p-3 flex flex-col gap-2 transition-colors hover:border-[#8b949e]/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p
            style={{ color: item.archived ? 'var(--text-muted)' : 'var(--text)' }}
            className="text-sm font-semibold leading-snug truncate"
          >
            {title}
          </p>
        </div>
        {item.archived ? (
          <span
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface2)' }}
            className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
          >
            Archived
          </span>
        ) : (
          <button
            onClick={handleDismiss}
            disabled={dismissing}
            style={{
              color: 'var(--text-muted)',
              backgroundColor: 'var(--surface2)',
              border: '1px solid var(--border)',
            }}
            className="text-[11px] px-2 py-0.5 rounded flex-shrink-0 hover:border-[#8b949e]/60 transition-colors disabled:opacity-50"
          >
            {dismissing ? '…' : 'Dismiss'}
          </button>
        )}
      </div>

      {bodyPreview && (
        <p
          style={{ color: 'var(--text-muted)' }}
          className="text-xs leading-relaxed line-clamp-2"
        >
          {bodyPreview}
        </p>
      )}

      <div className="flex items-center gap-2">
        <SourceBadge source={item.source} />
        <span style={{ color: 'var(--text-muted)' }} className="text-[10px]">
          {timeAgo(item.created_at ?? '')}
        </span>
      </div>
    </div>
  )
}
