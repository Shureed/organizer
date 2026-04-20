import { useCallback, useEffect, useState } from 'react'
import {
  commentsFor,
  getCommentsCache,
  subscribeComments,
} from './useDataLoader'
import { useMutations } from './useMutations'
import { pullComments } from '../sync/pull'
import { isSqliteAvailable } from '../sync/client'
import type { CommentRow } from '../components/shared/CommentSection'
import type { Database } from '../types/database.types'

type ItemType = Database['public']['Enums']['item_type']
type ActivityActor = Database['public']['Enums']['activity_actor']

const SQLITE_FLAG = import.meta.env.VITE_SQLITE_READS === 'true'

let _sqliteAvailablePromise: Promise<boolean> | null = null
function sqliteReady(): Promise<boolean> {
  if (!SQLITE_FLAG) return Promise.resolve(false)
  return (_sqliteAvailablePromise ??= isSqliteAvailable())
}

export interface UseCommentsResult {
  comments: CommentRow[]
  loading: boolean
  error: string | null
  post: (body: string, opts?: { actor?: ActivityActor }) => Promise<void>
}

/**
 * useComments — read + post comments for a single (entity_type, entity_id).
 *
 * Subscribes to the per-entity comments slice cache; realtime updates from
 * useRealtime.ts (via invalidateCommentsFor) will re-run the loader and
 * notify subscribers.  The SQLite apply.ts path dedups self-posts by id,
 * so an optimistic insert + realtime echo collapse to a single row.
 *
 * On mount: kicks a fire-and-forget pullComments() for server backfill.
 */
export function useComments(
  entityType: ItemType | string,
  entityId: string | null,
): UseCommentsResult {
  const [comments, setComments] = useState<CommentRow[]>(() =>
    entityId ? (getCommentsCache(entityType, entityId) ?? []) : [],
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { postComment } = useMutations()

  // Subscribe to the cache + run the initial load on id change.
  useEffect(() => {
    if (!entityId) return

    const unsub = subscribeComments(entityType, entityId, () => {
      const next = getCommentsCache(entityType, entityId)
      if (next) setComments(next)
    })

    let cancelled = false

    // Defer all state updates to a microtask so no setState fires synchronously
    // inside the effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
      const cached = getCommentsCache(entityType, entityId)
      if (cached) setComments(cached)
    })

    commentsFor(entityType, entityId)
      .then(() => {
        if (cancelled) return
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setLoading(false)
        setError(e instanceof Error ? e.message : 'Failed to load comments')
      })

    // Fire-and-forget server backfill when SQLite is on.  REST path already
    // hits the server directly in commentsFor, so this is only useful for
    // the SQLite branch.
    void (async () => {
      if (await sqliteReady()) {
        try {
          await pullComments(entityType, entityId)
          // Refresh from local after backfill.
          if (!cancelled) await commentsFor(entityType, entityId)
        } catch (e) {
          console.error('[useComments] pullComments failed', e)
        }
      }
    })()

    return () => {
      cancelled = true
      unsub()
    }
  }, [entityType, entityId])

  const post = useCallback(
    async (body: string, opts?: { actor?: ActivityActor }) => {
      const trimmed = body.trim()
      if (!entityId || !trimmed) return
      const actor: ActivityActor = opts?.actor ?? 'shureed'
      const id = crypto.randomUUID()

      // Optimistic render — realtime echo dedups by stable id.
      const optimistic: CommentRow = {
        id,
        actor,
        body: trimmed,
        created_at: new Date().toISOString(),
        pending: true,
      }
      setComments((prev) => [...prev, optimistic])

      try {
        await postComment({
          id,
          entity_type: entityType as ItemType,
          entity_id: entityId,
          actor,
          body: trimmed,
        })
        // Refresh from the authoritative source so the pending flag clears.
        await commentsFor(entityType, entityId)
      } catch (e: unknown) {
        setComments((prev) => prev.filter((c) => c.id !== id))
        setError(e instanceof Error ? e.message : 'Failed to post comment')
        throw e
      }
    },
    [entityType, entityId, postComment],
  )

  return { comments, loading, error, post }
}
