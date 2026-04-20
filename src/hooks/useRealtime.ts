import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Stubs — replaced in T3 / T4
function invalidateFor(_table: string, _payload: unknown): void {
  // no-op until T3 wires the invalidation bus
}

function onRejoin(): void {
  // no-op until T4 wires reconnect reconciliation
}

export function useRealtime(session: Session | null): void {
  // Channel setup — keyed on user.id so token rotation does NOT tear down channels.
  // The second effect below handles token rotation via setAuth.
  useEffect(() => {
    if (!session) return

    supabase.realtime.setAuth(session.access_token)

    const action = supabase
      .channel('rt:action_node')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_node' },
        (p) => invalidateFor('action_node', p),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onRejoin()
      })

    const inbox = supabase
      .channel('rt:inbox')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox' },
        (p) => invalidateFor('inbox', p),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onRejoin()
      })

    return () => {
      supabase.removeChannel(action)
      supabase.removeChannel(inbox)
    }
  }, [session?.user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Token rotation — update realtime auth whenever the session token changes
  // without tearing down the channels established above.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.access_token) supabase.realtime.setAuth(s.access_token)
    })
    return () => subscription.unsubscribe()
  }, [])
}
