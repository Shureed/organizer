import { useEffect, useState } from 'react'
import { onUpdateAvailable, applyUpdateAndReload } from '../lib/pwa'

export function UpdatePrompt() {
  const [show, setShow] = useState(false)
  useEffect(() => onUpdateAvailable(() => { setShow(true) }), [])
  if (!show) return null
  return (
    <div
      role="alert"
      className="fixed bottom-16 right-4 z-50 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm shadow-lg"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      <span>New version available</span>
      <button
        onClick={() => { void applyUpdateAndReload() }}
        className="rounded-md px-2.5 py-1 text-xs font-medium"
        style={{ background: 'var(--accent)', color: '#0d1117' }}
      >
        Reload
      </button>
      <button onClick={() => { setShow(false) }} aria-label="Dismiss" className="text-muted-foreground">×</button>
    </div>
  )
}
