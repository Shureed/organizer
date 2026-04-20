import { useEffect, useState } from 'react'

interface SyncProgressEvent extends Event {
  detail?: { table: string; fetched: number; total?: number }
}

/**
 * T13 — First-run backfill progress UI.
 *
 * Displays a centered overlay showing "Syncing N of M rows…" with a spinner.
 * Only shown during initialSync() on first-ever backfill (when OPFS is empty
 * and user just signed in). Auto-hides when initialSync() resolves.
 *
 * Mounted at top-level in App.tsx, conditioned on isSqliteAvailable() and
 * empty OPFS detection.
 */
export function SyncProgress() {
  const [visible, setVisible] = useState(false)
  const [fetched, setFetched] = useState(0)
  const [total, setTotal] = useState<number | null>(null)

  useEffect(() => {
    const handleProgress = (event: Event) => {
      const e = event as SyncProgressEvent
      const detail = e.detail
      if (!detail) return
      setVisible(true)
      setFetched(detail.fetched)
      if (detail.total) setTotal(detail.total)
    }

    const handleSyncComplete = () => {
      setVisible(false)
      setFetched(0)
      setTotal(null)
    }

    window.addEventListener('sync-progress', handleProgress)
    window.addEventListener('sync-complete', handleSyncComplete)

    return () => {
      window.removeEventListener('sync-progress', handleProgress)
      window.removeEventListener('sync-complete', handleSyncComplete)
    }
  }, [])

  if (!visible) return null

  const displayText = total
    ? `Syncing ${fetched} of ${total} rows…`
    : `Syncing ${fetched} rows…`

  return (
    <div
      role="status"
      className="fixed inset-0 flex items-center justify-center z-50 bg-black/20"
    >
      <div
        className="flex flex-col items-center gap-4 rounded-lg p-6"
        style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-3">
          <div className="animate-spin">
            <div
              className="w-5 h-5 rounded-full"
              style={{
                borderTop: '2px solid var(--accent)',
                borderRight: '2px solid transparent',
                borderBottom: '2px solid transparent',
                borderLeft: '2px solid transparent',
              }}
            />
          </div>
          <span style={{ color: 'var(--text)' }} className="text-sm">
            {displayText}
          </span>
        </div>
      </div>
    </div>
  )
}
