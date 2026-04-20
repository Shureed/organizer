/**
 * apply.ts — Realtime direct-apply to SQLite (master-P6 PR-C T11)
 *
 * applyRealtime(payload) receives a postgres_changes payload from Supabase
 * realtime and applies it to the local SQLite DB with the LWW guard from
 * pull.ts (plan §4.7).
 *
 * INSERT / UPDATE: UPSERT with LWW WHERE clause (excluded.updated_at > local
 * OR local._dirty = 0).  Dirty local rows with a later optimistic updated_at
 * survive the upsert.
 *
 * DELETE: Set _deleted = 1 for rows originating from the server (origin =
 * pull or apply); hard-DELETE for rows that were never synced (no _synced_at).
 * In practice, the current mutation set has no deletes, so _deleted is
 * future-proofing (plan §4.3).
 *
 * The caller (useRealtime.ts) triggers the relevant sliceLoaders[slice](true)
 * after this function resolves, still 150 ms debounced.
 */

import { isSqliteAvailable, mutate } from './client'
import { upsertFromServer } from './pull'
import type { SyncTable } from './pull'

// ── Types ─────────────────────────────────────────────────────────────────────

type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE'

export interface RealtimePayload {
  eventType: RealtimeEventType
  table: string
  schema: string
  new: Record<string, unknown>
  old: Record<string, unknown>
}

// ── applyRealtime ──────────────────────────────────────────────────────────────

/**
 * Apply a Supabase postgres_changes payload directly to the local SQLite DB.
 *
 * Returns silently if:
 *  - SQLite is not available (flag off or OPFS failed)
 *  - The table is not one we mirror (e.g. notes, people)
 *
 * Never throws — all errors are swallowed so realtime is best-effort.
 */
export async function applyRealtime(payload: RealtimePayload): Promise<void> {
  try {
    const available = await isSqliteAvailable()
    if (!available) return

    const table = payload.table as SyncTable
    if (table !== 'action_node' && table !== 'inbox') return

    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = payload.new
      if (!row || !row['id']) return
      await upsertFromServer(table, row)
      return
    }

    if (payload.eventType === 'DELETE') {
      const rowId = (payload.old?.['id'] ?? payload.new?.['id']) as string | undefined
      if (!rowId) return

      // Prefer soft-delete (tombstone) so the LWW guard can reconcile later.
      // If the row was never synced from the server (_synced_at IS NULL), it
      // was client-only and we can hard-delete it.
      await mutate(
        `UPDATE ${table}
            SET _deleted = 1
          WHERE id = ?
            AND _synced_at IS NOT NULL`,
        [rowId] as never[],
      )
      await mutate(
        `DELETE FROM ${table}
          WHERE id = ?
            AND _synced_at IS NULL`,
        [rowId] as never[],
      )
    }
  } catch {
    // Intentional: realtime apply is best-effort; errors must not break the UI.
  }
}
