import { useState, useEffect } from 'react'

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

interface GcalFetchResponse {
  items?: GcalEvent[]
  error?: string
  detail?: unknown
}

// Calls the gcal-fetch edge function directly. The SQL wrapper fn_gcal_fetch
// uses pg_net + net._await_response which polls via pg_sleep — that exceeds
// the authenticated role's statement timeout when the edge fn takes more than
// a few seconds. Raw fetch (not supabase.functions.invoke) so we can read the
// structured error body on non-2xx; invoke consumes it.
async function fetchEvents(start: string, end: string, calendarId: string): Promise<GcalFetchResponse> {
  const base = (import.meta.env.VITE_SUPABASE_URL as string).replace(/\/$/, '')
  const res = await fetch(`${base}/functions/v1/gcal-fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, end, calendar_id: calendarId }),
  })
  try {
    return (await res.json()) as GcalFetchResponse
  } catch {
    return { error: 'fetch_failed', detail: `HTTP ${res.status} (non-JSON body)` }
  }
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
    if (!enabled || !start || !end) return

    let cancelled = false

    ;(async () => {
      setStatus('loading')
      setError(null)
      try {
        const res = await fetchEvents(start, end, calendarId)
        if (cancelled) return

        if (res.error === 'reconnect_required') {
          setStatus('reconnect_required')
          setEvents([])
          setError(null)
          return
        }
        if (res.error) {
          setStatus('error')
          setError(`${res.error}: ${typeof res.detail === 'string' ? res.detail : JSON.stringify(res.detail)}`)
          setEvents([])
          return
        }
        setEvents(res.items ?? [])
        setStatus('ok')
        setError(null)
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : String(err))
        setEvents([])
      }
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
