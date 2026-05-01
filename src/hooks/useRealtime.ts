import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { sliceLoaders, loadAll, invalidateCommentsFor } from './useDataLoader'
import { syncAll } from '../sync/pull'
import { applyBroadcastChanges, type BroadcastChangesPayload } from '../sync/apply'
import { isSqliteAvailable } from '../sync/client'
import type { SliceKey } from './useDataLoader'

// ── Flag helpers ─────────────────────────────────────────────────────────────

const SQLITE_FLAG = import.meta.env.VITE_SQLITE_READS === 'true'

let _sqliteAvailablePromise: Promise<boolean> | null = null
function sqliteReady(): Promise<boolean> {
  if (!SQLITE_FLAG) return Promise.resolve(false)
  return (_sqliteAvailablePromise ??= isSqliteAvailable())
}

// ── Invalidation bus ────────────────────────────────────────────────────────────────
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
    'pinnedAll',
    'recentItems',
    'activeContainers',
  ],
  inbox: ['inbox'],
}

// Exported for routing-completeness tests only — not part of the public API.
export const ROUTING_FOR_TEST = ROUTING

// Per-slice debounce timers — coalesces rapid multi-row events into one fetch.
const timers = new Map<SliceKey, number>()

// Per-comments-slice debounce timers — keyed dynamically per (entity_type, entity_id).
const commentsTimers = new Map<string, number>()

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function invalidateFor(table: string, _payload?: unknown): void {
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

/**
 * Comments slice invalidation — the slice key is per (entity_type, entity_id),
 * so we extract those from the realtime payload (new or old row) and debounce
 * per key.  A single debounce map scoped to comments avoids collisions with
 * the top-level SliceKey timers.
 */
function invalidateComments(payload: {
  new: Record<string, unknown>
  old: Record<string, unknown>
}): void {
  const row = (payload.new && Object.keys(payload.new).length > 0) ? payload.new : payload.old
  const entityType = row?.['entity_type'] as string | undefined
  const entityId = row?.['entity_id'] as string | undefined
  if (!entityType || !entityId) return

  const key = `comments:${entityType}:${entityId}`
  const prev = commentsTimers.get(key)
  if (prev) clearTimeout(prev)
  commentsTimers.set(
    key,
    window.setTimeout(() => {
      void invalidateCommentsFor(entityType, entityId)
      commentsTimers.delete(key)
    }, 150),
  )
}

/**
 * When the SQLite flag is on: apply the payload directly to local DB, then
 * trigger the affected slice loaders (150 ms debounced, same as before).
 * Skip the REST refetch path entirely.
 *
 * When the flag is off: fall through to the existing invalidateFor path.
 */
async function handleBroadcastEvent(
  table: string,
  envelope: BroadcastChangesPayload,
): Promise<void> {
  // The invalidation helpers below want the legacy {new, old} shape (they read
  // entity_type/entity_id off the row). Reshape once at this boundary so the
  // rest of the file is unchanged.
  const inner = envelope.payload
  const legacyShape = {
    new: (inner?.record ?? {}) as Record<string, unknown>,
    old: (inner?.old_record ?? {}) as Record<string, unknown>,
  }

  if (await sqliteReady()) {
    await applyBroadcastChanges(envelope)
    // Trigger affected slice loaders after local DB is updated.
    if (table === 'comments') {
      invalidateComments(legacyShape)
    } else {
      invalidateFor(table, legacyShape)
    }
    return
  }
  // Flag off: REST-invalidation path.
  if (table === 'comments') {
    invalidateComments(legacyShape)
  } else {
    invalidateFor(table, legacyShape)
  }
}

// ── Reconnect reconciliation ────────────────────────────────────────────────────────
// On channel rejoin we flush all slices once if we've already subscribed at
// least once — the very first SUBSCRIBED fires during initial mount when data
// is already being loaded by the shell seed, so we skip it.
//
// hasSubscribedOnce is a ref-like value scoped inside the effect so it resets
// correctly when the effect re-runs (e.g. user signs out and back in, producing
// a different user.id and therefore a new channel lifecycle). Module-level state
// would persist across re-mounts and incorrectly trigger loadAll on first login.

// ── useRealtime ─────────────────────────────────────────────────────────────────
export function useRealtime(session: Session | null): void {
  // Channel setup — keyed on user.id so token rotation does NOT tear down
  // channels. The second effect handles token rotation via setAuth.
  useEffect(() => {
    if (!session) return

    supabase.realtime.setAuth(session.access_token)

    // Scoped to this effect run so it resets on sign-out / user change.
    let hasSubscribedOnce = false

    const onRejoin = async () => {
      if (hasSubscribedOnce) {
        // When SQLite flag is on, use syncAll() (delta pull) instead of loadAll()
        // to reconcile missed events during disconnection.
        if (await sqliteReady()) {
          void syncAll().then(() => loadAll())
        } else {
          void loadAll()
        }
      }
      hasSubscribedOnce = true
    }

    // Realtime delivery via broadcast_changes + private channels (cortex node
    // ccfb06b7). Topic is `user:{uid}:{table}`; the server-side trigger
    // (realtime_broadcast_user_changes) only ever sends to topics matching the
    // owning user, and the RLS policy on realtime.messages enforces that a
    // subscriber can only read topics matching their own JWT sub. Security
    // boundary is now server-side; no client filter needed.
    const uid = session.user.id

    const action = supabase
      .channel(`user:${uid}:action_node`, { config: { private: true } })
      .on(
        'broadcast',
        { event: '*' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => void handleBroadcastEvent('action_node', p as BroadcastChangesPayload),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void onRejoin()
      })

    const inbox = supabase
      .channel(`user:${uid}:inbox`, { config: { private: true } })
      .on(
        'broadcast',
        { event: '*' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => void handleBroadcastEvent('inbox', p as BroadcastChangesPayload),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void onRejoin()
      })

    // Comments: same per-user topic. entity_type/entity_id routing still
    // happens in invalidateComments off the row payload.
    const comments = supabase
      .channel(`user:${uid}:comments`, { config: { private: true } })
      .on(
        'broadcast',
        { event: '*' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => void handleBroadcastEvent('comments', p as BroadcastChangesPayload),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void onRejoin()
      })

    // Visibility reconciliation: if the tab was hidden ≥ 60 s, flush all
    // slices on return to avoid stale UI from missed realtime events.
    // When SQLite is on, run syncAll() first then loadAll() so the local DB
    // is refreshed before the store is repopulated.
    let hiddenAt: number | null = null

    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
      } else {
        if (hiddenAt !== null && Date.now() - hiddenAt >= 60_000) {
          void (async () => {
            if (await sqliteReady()) {
              await syncAll()
            }
            void loadAll()
          })()
        }
        hiddenAt = null
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      supabase.removeChannel(action)
      supabase.removeChannel(inbox)
      supabase.removeChannel(comments)
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
