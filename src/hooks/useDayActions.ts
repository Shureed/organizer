import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface DayActionItem {
  node_id: string
  node_name: string
  node_type: string
  touched_at: string
  touch_source: 'updated' | 'comment' | 'note'
  chain_origin_id: string | null
  chain_origin_name: string | null
  project_id: string | null
  project_name: string | null
}

export interface UseDayActionsResult {
  items: DayActionItem[]
  loading: boolean
  error: string | null
}

export function useDayActions(day: string | null): UseDayActionsResult {
  const [items, setItems] = useState<DayActionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!day) {
      setItems([])
      setLoading(false)
      setError(null)
      return
    }

    const fetchDayActions = async () => {
      setLoading(true)
      setError(null)
      try {
        // fn_day_activity was added after typegen — cast needed
        const { data, error: rpcError } = await (supabase.rpc as any)('fn_day_activity', {
          p_day: day,
          p_tz: 'America/New_York',
        })

        if (rpcError) throw rpcError

        setItems((data ?? []) as unknown as DayActionItem[])
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchDayActions()
  }, [day])

  return { items, loading, error }
}
