/**
 * outbox.ts — Durable write queue (master-P6 PR-B T7 + T8)
 *
 * Provides a persistent mutation queue backed by the local SQLite _outbox
 * table.  Mutations are enqueued optimistically and replayed to Supabase
 * when the network is available.
 *
 * Conflict policy (plan §4.6, T8):
 *   - 2xx success: mark outbox row done, clear _dirty on target row, set
 *     _synced_at from Date.now() (server echo updated_at is applied via the
 *     LWW upsert in pull.ts when realtime fires — PR-C T11).
 *   - 409 / unique violation: treat as idempotent success (server already has
 *     this write); delete outbox entry, clear _dirty.
 *   - Other 4xx (RLS, constraint): mark outbox 'blocked', stop replay loop.
 *     User must discard via discardBlocked() to unblock the queue.
 *   - 5xx / network error: leave 'pending', increment attempts, exit loop.
 *     Retry fires on next online event or next explicit triggerReplay() call.
 *
 * Replay ordering: strict FIFO (created_at ASC).  A blocked head entry stops
 * all subsequent replays until discarded (plan §4.6 "blocking error state").
 *
 * Replay lock: a _meta row keyed 'replay_lock' prevents concurrent replay
 * sessions (e.g. simultaneous online event + manual trigger).
 *
 * Exported surface:
 *   enqueue()          Add a mutation to the outbox.
 *   triggerReplay()    Manually kick the replay loop (also fires on 'online').
 *   pendingCount()     Number of pending/replaying entries (for T14 banner).
 *   discardBlocked()   Remove all blocked entries (user escape hatch, T14).
 *   resetInFlight()    Reset replaying → pending (called on app boot, §8(c)).
 */

import type { SqlBindings } from './db.worker'
import { supabase } from '../lib/supabase'
import { mutate, query } from './client'

/** Cast an array of mixed values to the BindingSpec type SQLite expects. */
function binds(arr: unknown[]): SqlBindings {
  return arr as SqlBindings
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type OutboxTable = 'action_node' | 'inbox' | 'comments'
export type OutboxOp    = 'insert' | 'update' | 'delete'

export interface OutboxEntry {
  /** Client-generated UUID used as idempotency key. */
  id: string
  table_name: OutboxTable
  row_id: string
  op: OutboxOp
  payload: Record<string, unknown>
}

interface OutboxRow {
  id: string
  created_at: number
  table_name: OutboxTable
  op: OutboxOp
  row_id: string
  payload: string
  attempts: number
  status: 'pending' | 'replaying' | 'blocked' | 'done'
  last_error: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Parse a Supabase/PostgREST error into a numeric HTTP status code.
 * Used by the replay loop for conflict-policy routing (plan §4.6, T8).
 *
 *  PostgreSQL code '23505' = unique_violation   → treat as HTTP 409
 *  PostgREST code 'PGRST116' = no rows returned → treat as HTTP 404
 *  everything else                              → treat as HTTP 500
 */
function parseErrorStatus(err: unknown): number {
  if (err == null || typeof err !== 'object') return 500
  const e = err as Record<string, unknown>

  // Supabase REST errors may carry .status directly.
  if (typeof e['status'] === 'number') return e['status']

  // PostgREST wraps the Postgres error code in .code.
  const code = e['code'] as string | undefined
  if (code === '23505') return 409
  if (code === 'PGRST116') return 404

  // message-based heuristic for network failures.
  const msg = String(e['message'] ?? '')
  if (msg.includes('NetworkError') || msg.includes('Failed to fetch')) return 0

  return 500
}

// ── _meta helpers ─────────────────────────────────────────────────────────────

async function setMeta(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await mutate('DELETE FROM _meta WHERE key = ?', binds([key]))
    return
  }
  await mutate(
    'INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    binds([key, value]),
  )
}

async function getMeta(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>('SELECT value FROM _meta WHERE key = ?', binds([key]))
  return rows[0]?.value ?? null
}

// ── Replay lock ───────────────────────────────────────────────────────────────

const REPLAY_LOCK_KEY = 'replay_lock'
const LOCK_STALE_MS   = 30_000  // treat a lock older than 30 s as stale

/** Acquire the replay lock.  Returns true if acquired, false if already held. */
async function acquireLock(): Promise<boolean> {
  const existing = await getMeta(REPLAY_LOCK_KEY)
  if (existing !== null) {
    const age = Date.now() - parseInt(existing, 10)
    if (age < LOCK_STALE_MS) return false // another session holds the lock
    // Stale lock — take it over.
  }
  await setMeta(REPLAY_LOCK_KEY, String(Date.now()))
  return true
}

async function releaseLock(): Promise<void> {
  await setMeta(REPLAY_LOCK_KEY, null)
}

// ── Replay loop state ─────────────────────────────────────────────────────────

let _replayRunning = false
let _retryMs = 2_000
const RETRY_CAP_MS = 60_000

// ── enqueue ───────────────────────────────────────────────────────────────────

/**
 * Add a mutation to the _outbox and mark the target row as dirty.
 *
 * The caller is responsible for having already written the optimistic row to
 * the local table (PR-C T10).  This function only handles the outbox entry
 * and the _dirty flag.
 */
export async function enqueue(entry: OutboxEntry): Promise<void> {
  const now = Date.now()

  await mutate(
    `INSERT INTO _outbox (id, created_at, table_name, op, row_id, payload, attempts, status)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'pending')`,
    binds([
      entry.id,
      now,
      entry.table_name,
      entry.op,
      entry.row_id,
      JSON.stringify(entry.payload),
    ]),
  )

  // Mark the target row dirty so the LWW upsert in pull.ts skips overwriting it.
  if (entry.table_name !== 'comments') {
    await mutate(
      `UPDATE ${entry.table_name} SET _dirty = 1 WHERE id = ?`,
      binds([entry.row_id]),
    )
  }

  // Attempt replay immediately if we're online.
  void triggerReplay()
}

// ── Replay helpers ────────────────────────────────────────────────────────────

/** Execute a single outbox entry against Supabase REST. */
async function replayEntry(row: OutboxRow): Promise<void> {
  const payload = JSON.parse(row.payload) as Record<string, unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = supabase.from(row.table_name) as any

  let error: { message: string; code?: string } | null = null

  if (row.op === 'insert') {
    ;({ error } = await table.insert(payload))
  } else if (row.op === 'update') {
    ;({ error } = await table.update(payload).eq('id', row.row_id))
  } else if (row.op === 'delete') {
    ;({ error } = await table.delete().eq('id', row.row_id))
  }

  if (error) {
    throw Object.assign(new Error(error.message), {
      code: error.code,
      status: (error as unknown as Record<string, unknown>)['status'] ?? 500,
    })
  }
}

/** Clear dirty flag and set _synced_at on a successfully replayed row. */
async function clearDirty(table: OutboxTable, rowId: string): Promise<void> {
  if (table === 'comments') return // append-only; no _dirty lifecycle
  await mutate(
    `UPDATE ${table} SET _dirty = 0, _synced_at = ? WHERE id = ?`,
    binds([Date.now(), rowId]),
  )
}

// ── triggerReplay (exported) ──────────────────────────────────────────────────

/**
 * Kick the replay loop.  Idempotent — concurrent calls collapse to one run.
 * Wired to window 'online' event at module load and called by enqueue().
 * Explicitly callable from PR-C T10 on realtime SUBSCRIBED transition.
 */
export async function triggerReplay(): Promise<void> {
  if (_replayRunning) return
  if (!navigator.onLine) return

  const acquired = await acquireLock()
  if (!acquired) return

  _replayRunning = true

  try {
    for (;;) {
      // Peek at the oldest pending entry.
      const [head] = await query<OutboxRow>(
        `SELECT * FROM _outbox
          WHERE status = 'pending'
          ORDER BY created_at ASC
          LIMIT 1`,
      )
      if (!head) break

      // Mark in-flight.
      await mutate(
        `UPDATE _outbox SET status = 'replaying', attempts = attempts + 1 WHERE id = ?`,
        binds([head.id]),
      )

      try {
        await replayEntry(head)

        // Success — remove from outbox and clear dirty.
        await mutate(`DELETE FROM _outbox WHERE id = ?`, binds([head.id]))
        await clearDirty(head.table_name, head.row_id)

        // Reset backoff on success.
        _retryMs = 2_000

      } catch (err: unknown) {
        const status = parseErrorStatus(err)

        if (status === 409) {
          // Unique violation: server already has this write — idempotent success.
          await mutate(`DELETE FROM _outbox WHERE id = ?`, binds([head.id]))
          await clearDirty(head.table_name, head.row_id)
          continue
        }

        if (status >= 400 && status < 500) {
          // Permanent client error (RLS, constraint, etc.) — block the queue.
          await mutate(
            `UPDATE _outbox SET status = 'blocked', last_error = ? WHERE id = ?`,
            binds([String(err), head.id]),
          )
          break // stop processing further entries until user discards
        }

        // 5xx / network / status 0 — transient; back off and stop this loop.
        await mutate(
          `UPDATE _outbox SET status = 'pending', last_error = ? WHERE id = ?`,
          binds([String(err), head.id]),
        )
        await sleep(_retryMs)
        _retryMs = Math.min(_retryMs * 2, RETRY_CAP_MS)
        break
      }
    }
  } finally {
    _replayRunning = false
    await releaseLock()
  }
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * pendingCount() — total pending + replaying entries.
 * Used by T14 OfflineIndicator banner (PR-D).
 */
export async function pendingCount(): Promise<number> {
  const [row] = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM _outbox WHERE status IN ('pending', 'replaying')`,
  )
  return row?.n ?? 0
}

/**
 * blockedCount() — entries in 'blocked' state.
 * Used by T14 OfflineIndicator banner (PR-D).
 */
export async function blockedCount(): Promise<number> {
  const [row] = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM _outbox WHERE status = 'blocked'`,
  )
  return row?.n ?? 0
}

/**
 * discardBlocked() — remove all blocked entries.
 * Called when the user clicks "Discard" in the T14 banner.
 * Also clears _dirty on the affected rows so they revert to server state
 * on the next delta pull.
 */
export async function discardBlocked(): Promise<void> {
  // Collect affected rows before deleting.
  const blocked = await query<{ table_name: OutboxTable; row_id: string }>(
    `SELECT table_name, row_id FROM _outbox WHERE status = 'blocked'`,
  )

  await mutate(`DELETE FROM _outbox WHERE status = 'blocked'`)

  // Clear dirty flags so the next pull overwrites with server state.
  for (const { table_name, row_id } of blocked) {
    if (table_name !== 'comments') {
      await mutate(`UPDATE ${table_name} SET _dirty = 0 WHERE id = ?`, binds([row_id]))
    }
  }
}

/**
 * resetInFlight() — reset any 'replaying' entries back to 'pending'.
 * Called on app boot to recover from a hard-kill mid-replay (plan §8(c)).
 * This is also handled by the migration SQL, but calling it explicitly on
 * boot ensures correctness even if the migration already ran earlier.
 */
export async function resetInFlight(): Promise<void> {
  await mutate(`UPDATE _outbox SET status = 'pending' WHERE status = 'replaying'`)
  // Release any stale lock left by the previous session.
  await releaseLock()
}

// ── Wire online event ─────────────────────────────────────────────────────────

// Trigger replay whenever the browser regains network connectivity.
// The event is idempotent with the loop guard.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void triggerReplay() })
}
