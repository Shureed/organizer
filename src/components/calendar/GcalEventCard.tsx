import { CalendarDays } from 'lucide-react'
import type { GcalEvent } from '../../hooks/useGcalEvents'

interface GcalEventCardProps {
  event: GcalEvent
}

function formatTimeRange(starts: string, ends: string): string {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    const h = d.getHours()
    const m = d.getMinutes()
    const hh = String(h % 12 === 0 ? 12 : h % 12)
    const mm = String(m).padStart(2, '0')
    const ampm = h < 12 ? 'a' : 'p'
    return m === 0 ? `${hh}${ampm}` : `${hh}:${mm}${ampm}`
  }
  return `${fmt(starts)}–${fmt(ends)}`
}

export function GcalEventCard({ event }: GcalEventCardProps) {
  const range = event.all_day ? 'all-day' : formatTimeRange(event.starts_at, event.ends_at)
  return (
    <div
      className="w-full text-left rounded-lg p-2.5 flex items-start gap-2"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)',
      }}
    >
      <CalendarDays size={14} strokeWidth={2} style={{ color: 'var(--accent)', marginTop: 2 }} />
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className="text-sm leading-snug truncate" style={{ color: 'var(--text)' }}>
          {event.title ?? '(Untitled)'}
        </span>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {range}
        </span>
      </div>
    </div>
  )
}
