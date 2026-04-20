import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { sliceLoaders, loadAll } from './useDataLoader'
import type { SliceKey } from './useDataLoader'

// ── Invalidation bus ────────────────────────────────────────────────────────────
// Broad fan-out over payload diffing: 7 parallel refetches @ ~40 ms each is
// cheap; narrowing by payload.new.type/status risks wrong-slice-skipped
// correctness bugs for ~200 ms saved. Intentional — do not narrow.
const ROUTING: Record<string, SliceKey[]> = {
  action_node: [
    'tasks',
    'projects',
    'closedTasks',
    'closedProjects',
    'pinnedDoneTasks',
    'recentItems',
    'chainStatus',
  ],
  inbox: ['inbox'],
}

// Per-slice debounce timers — coalesces rapid multi-row events into one fetch.
const timers = new Map<SliceKey, number>()

function invalidateFor(table: string, _payload: unknown): void {
  for (const slice of ROUTING[table] ?? []) {
    const prev = timers.get(slice)
    if (prev) clearTimeout(prev)
    timers.set(
      slice,
      window.setTimeout(() => {
        void sliceLoaders[slice](true)
        timers.delete(slice)
      }, 150),
    )
  }
}

// ── Reconnect reconciliation ────────────────────────────────────────────────────
// On channel rejoin we flush all slices once (if we've already subscribed at
// least once — the very first SUBSCRIBED fires during initial mount when data
// is already being loaded by the shell seed, so we skip it).
let hasSubscribedOnce = false

function onRejoin(): void {
  if (hasSubscribedOnce) {
    void loadAll()
  }
  hasSubscribedOnce = true
}

// ── useRealtime ─────────────────────────────────────────────────────────────────
export function useRealtime(session: Session | null): void {
  // Channel setup — keyed on user.id so token rotation does NOT tear down
  // channels. The second effect handles token rotation via setAuth.
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

    // Visibility reconciliation: if the tab was hidden ≥ 60 s, flush all
    // slices on return to avoid stale UI from missed events.
    let hiddenAt: number | null = null

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt >= 60_000) {
          void loadAll()
        }
        hiddenAt = null
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      supabase.removeChannel(action)
      supabase.removeChannel(inbox)
      document.removeEventListener('visibilitychange', onVisibilityChange)
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
