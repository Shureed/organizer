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

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
    </svg>
  )
}

export function InboxItem({ item, onOpenDetail }: InboxItemProps) {
  const [dismissing, setDismissing] = useState(false)
  const [pinning, setPinning] = useState(false)
  const { archiveInbox, togglePin } = useMutations()
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

  const handlePin = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item.id) return
    setPinning(true)
    try {
      await togglePin(item.id, !item.pinned)
    } finally {
      setPinning(false)
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
        border: item.pinned ? '1px solid var(--accent)' : '1px solid var(--border)',
        cursor: 'pointer',
      }}
      className="rounded-xl p-3 flex flex-col gap-2 transition-colors hover:border-[#8b949e]/40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
    >
      <div className="flex items-start gap-2.5">
        {/* Pin button — left side */}
        <button
          onClick={handlePin}
          disabled={pinning}
          style={{
            color: item.pinned ? 'var(--accent)' : 'var(--text-muted)',
            flexShrink: 0,
            marginTop: '1px',
          }}
          className="hover:text-[var(--accent)] transition-colors disabled:opacity-50"
          aria-label={item.pinned ? 'Unpin' : 'Pin'}
        >
          <PinIcon filled={!!item.pinned} />
        </button>

        <div className="flex-1 min-w-0">
          <p
            style={{ color: 'var(--text)' }}
            className="text-sm font-medium leading-snug truncate"
          >
            {title}
          </p>
        </div>

        {/* Dismiss button */}
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
