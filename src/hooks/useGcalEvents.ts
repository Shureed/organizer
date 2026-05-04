import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export interface GcalEvent {
  gcal_event_id: string
  calendar_id: string
  title: string | null
  starts_at: string
  ends_at: string
  all_day: boolean
}

type EventsStatus = 'loading' | 'ok' | 'reconnect_required' | 'error'

export interface UseGcalEventsReturn {
  events: GcalEvent[]
  status: EventsStatus
  error: string | null
  refetch: () => void
}

export interface UseGcalEventsArgs {
  start: string | null
  end: string | null
  calendarId?: string
  enabled?: boolean
}

function isReconnectError(err: { message?: string; hint?: string } | null): boolean {
  if (!err) return false
  if (err.hint === 'reconnect_required') return true
  const msg = err.message ?? ''
  return msg.includes('reconnect_required') || msg.includes('no_token_stored')
}

export function useGcalEvents({
  start,
  end,
  calendarId = 'primary',
  enabled = true,
}: UseGcalEventsArgs): UseGcalEventsReturn {
  const [events, setEvents] = useState<GcalEvent[]>([])
  const [status, setStatus] = useState<EventsStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled || !start || !end) {
      setStatus('loading')
      setEvents([])
      return
    }

    let cancelled = false
    setStatus('loading')
    setError(null)

    ;(async () => {
      const { data, error: rpcErr } = await supabase.rpc('fn_gcal_fetch_self', {
        p_start: start,
        p_end: end,
        p_calendar_id: calendarId,
      })
      if (cancelled) return

      if (rpcErr) {
        if (isReconnectError(rpcErr as { message?: string; hint?: string })) {
          setStatus('reconnect_required')
          setEvents([])
          setError(null)
          return
        }
        setStatus('error')
        setError(rpcErr.message ?? String(rpcErr))
        setEvents([])
        return
      }

      setEvents((data as GcalEvent[] | null) ?? [])
      setStatus('ok')
      setError(null)
    })()

    return () => {
      cancelled = true
    }
  }, [start, end, calendarId, enabled, tick])

  return {
    events,
    status,
    error,
    refetch: () => setTick((t) => t + 1),
  }
}
