import { useEffect, useState } from 'react'

export function OfflineIndicator() {
  const [online, setOnline] = useState(() => navigator.onLine)
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
  if (online) return null
  return (
    <div role="status" className="bg-amber-950/60 text-amber-200 border-b border-amber-900 py-1.5 px-3 text-xs text-center">
      Offline — showing last-known data
    </div>
  )
}
