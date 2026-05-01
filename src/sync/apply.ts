/**
 * apply.ts — Realtime direct-apply to SQLite.
 *
 * applyBroadcastChanges(envelope) is the public entry: it reshapes a Supabase
 * `realtime.broadcast_changes` payload (per cortex node ccfb06b7) and delegates
 * to applyRealtime, which applies the row to the local SQLite DB with the LWW
 * guard from pull.ts (plan §4.7).
 *
 * INSERT / UPDATE: UPSERT with LWW WHERE clause (excluded.updated_at > local
 * OR local._dirty = 0).  Dirty local rows with a later optimistic updated_at
 * survive the upsert.
 *
 * T9.5 fix: after an action_node INSERT/UPDATE, fire-and-forget
 * pullActiveJoinsFor([id]) to refresh join cols (project_name / space_name /
 * space_path) from the server view.  This ensures the local row has the join
 * cols populated even when the realtime payload comes from the base table
 * (which doesn't carry those cols).
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
import { upsertFromServer, upsertCommentFromServer, pullActiveJoinsFor } from './pull'
import type { SyncTable } from './pull'

// ── Types ─────────────────────────────────────────────────────────────────────

type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE'

interface RealtimePayload {
  eventType: RealtimeEventType
  table: string
  schema: string
  new: Record<string, unknown>
  old: Record<string, unknown>
}

// ── applyBroadcastChanges (public entry — cortex node ccfb06b7) ──────────────
//
// Supabase Realtime's broadcast_changes envelope:
//   - top level: { event, meta, payload, type }
//   - inner:     { id, table, record, schema, operation, old_record }
// where `record` ≡ NEW row and `old_record` ≡ OLD row (null on INSERT).
// Reshapes to the internal RealtimePayload contract and delegates to the SQLite
// apply logic (LWW guard, join-col refresh, soft-delete).

export interface BroadcastChangesPayload {
  event: string
  payload: {
    id?: string
    table: string
    schema: string
    operation: 'INSERT' | 'UPDATE' | 'DELETE'
    record: Record<string, unknown> | null
    old_record: Record<string, unknown> | null
  }
}

export async function applyBroadcastChanges(p: BroadcastChangesPayload): Promise<void> {
  const inner = p.payload
  if (!inner || !inner.operation || !inner.table) return
  await applyRealtime({
    eventType: inner.operation,
    table: inner.table,
    schema: inner.schema,
    new: inner.record ?? {},
    old: inner.old_record ?? {},
  })
}

async function applyRealtime(payload: RealtimePayload): Promise<void> {
  try {
    const available = await isSqliteAvailable()
    if (!available) return

    const rawTable = payload.table
    if (rawTable !== 'action_node' && rawTable !== 'inbox' && rawTable !== 'comments') return

    // Comments: append-only, no _deleted column, no join-col refresh.
    if (rawTable === 'comments') {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const row = payload.new
        if (!row || !row['id']) return
        await upsertCommentFromServer(row)
        return
      }
      if (payload.eventType === 'DELETE') {
        const rowId = (payload.old?.['id'] ?? payload.new?.['id']) as string | undefined
        if (!rowId) return
        // Comments table has no _deleted column; hard-delete on server-echo DELETE.
        await mutate('DELETE FROM comments WHERE id = ?', [rowId] as never[])
      }
      return
    }

    const table = rawTable as SyncTable

    if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
      const row = payload.new
      if (!row || !row['id']) return
      await upsertFromServer(table, row)

      // T9.5 fix: fire-and-forget join-col refresh for action_node rows so
      // project_name / space_name / space_path are populated even when the
      // realtime payload comes from the base table (no join cols in payload).
      if (table === 'action_node') {
        void pullActiveJoinsFor([row['id'] as string]).catch(() => { /* best-effort */ })
      }
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
