import { useEffect, useState } from 'react'
import { pendingCount, blockedCount, discardBlocked } from '../sync/outbox'

export function OfflineIndicator() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [pending, setPending] = useState(0)
  const [blocked, setBlocked] = useState(0)

  // Handle online/offline events
  useEffect(() => {
    const on = () => { setOnline(true) }
    const off = () => { setOnline(false) }
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  // Poll pending count every 2s
  useEffect(() => {
    const checkPending = async () => {
      try {
        const p = await pendingCount()
        const b = await blockedCount()
        setPending(p)
        setBlocked(b)
      } catch {
        // SQLite may not be available yet
      }
    }

    const interval = setInterval(checkPending, 2000)
    // Check immediately once on mount
    void checkPending()

    return () => clearInterval(interval)
  }, [])

  const handleDiscard = async () => {
    try {
      await discardBlocked()
      setBlocked(0)
    } catch {
      // Silently fail
    }
  }

  // Show banner if offline OR has pending changes
  const showBanner = !online || pending > 0

  if (!showBanner) return null

  return (
    <div role="status" className="bg-amber-950/60 text-amber-200 border-b border-amber-900 py-1.5 px-3 text-xs text-center flex items-center justify-center gap-2">
      {!online ? (
        <>
          Offline — showing last-known data
          {pending > 0 && <span className="text-amber-100 font-semibold">{pending} change{pending !== 1 ? 's' : ''} pending</span>}
        </>
      ) : pending > 0 ? (
        <>
          <span className="text-amber-100 font-semibold">{pending} change{pending !== 1 ? 's' : ''} pending sync</span>
        </>
      ) : null}

      {blocked > 0 && (
        <button
          onClick={handleDiscard}
          className="ml-auto underline hover:no-underline"
        >
          Discard
        </button>
      )}
    </div>
  )
}
