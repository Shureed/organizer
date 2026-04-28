/**
 * client.ts — main-thread façade for the SQLite DB worker.
 *
 * The worker is loaded lazily on first use (dynamic import) so it does NOT
 * appear in the entry chunk. The wasm binary is fetched only when the first
 * query or mutate call is issued.
 *
 * Usage:
 *   import { query, mutate, isSqliteAvailable } from '@/sync/client'
 *   const tasks = await query<Task>('SELECT * FROM v_active_tasks')
 *
 * The worker/client are not yet wired to any hook — that is PR-C's job.
 */

import * as Comlink from 'comlink'
import type { DbApi, SqlBindings } from './db.worker'

// ---------------------------------------------------------------------------
// Worker lifecycle
// ---------------------------------------------------------------------------

type RemoteDb = Comlink.Remote<DbApi>

let _clientPromise: Promise<RemoteDb> | null = null

/**
 * Lazily instantiate the worker on first call.
 * Returns the Comlink-wrapped remote and waits for the DB to be ready.
 * Rejects (with InitError) if OPFS is unavailable.
 */
function _getClient(): Promise<RemoteDb> {
  if (_clientPromise !== null) return _clientPromise

  _clientPromise = (async () => {
    // Dynamic import ensures the worker stays in a separate chunk and the
    // sqlite wasm is NOT pulled into the entry bundle.
    const WorkerClass = (await import('./db.worker?worker')).default as new () => Worker
    const worker = new WorkerClass()
    const remote = Comlink.wrap<DbApi>(worker)

    // Verify the DB is up before returning.
    await remote.ready()

    return remote
  })().catch((err: unknown) => {
    // Reset so callers can decide whether to retry.
    _clientPromise = null
    throw err
  })

  return _clientPromise
}

// ---------------------------------------------------------------------------
// Cold-boot timing probe (opt-in via VITE_SYNC_DEBUG)
// ---------------------------------------------------------------------------

if (import.meta.env.VITE_SYNC_DEBUG === 'true') {
  const _t0 = performance.now()
  void _getClient()
    .then(() => {
      console.info(`[sync] cold-boot ${Math.round(performance.now() - _t0)} ms`)
    })
    .catch((err: unknown) => {
      console.error('[sync] cold-boot failed:', err)
    })
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a SELECT statement and return rows as typed objects.
 * Initiates the worker on first call.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: SqlBindings,
): Promise<T[]> {
  const client = await _getClient()
  // Comlink.Remote erases the generic on select; cast at the call site.
  return (client.select(sql, params) as unknown as Promise<T[]>)
}

/**
 * Run an INSERT / UPDATE / DELETE / DDL statement.
 * Initiates the worker on first call.
 */
export async function mutate(sql: string, params?: SqlBindings): Promise<void> {
  const client = await _getClient()
  return client.exec(sql, params)
}

/**
 * Returns true if the SQLite DB worker has initialised successfully.
 * Returns false (never rejects) if OPFS is unavailable — use this for
 * feature-flag gating (T9 fallback strategy, plan §4.10).
 */
export async function isSqliteAvailable(): Promise<boolean> {
  try {
    const client = await _getClient()
    return client.ready()
  } catch {
    return false
  }
}

/**
 * Returns true if the DB is ready.
 * Same as isSqliteAvailable but throws instead of swallowing errors.
 */
export async function ready(): Promise<boolean> {
  const client = await _getClient()
  return client.ready()
}

/**
 * Destroy the worker and release all OPFS handles.
 * Called from useAuth's SIGNED_OUT branch in PR-C so sign-out wipes local data.
 */
export async function destroy(): Promise<void> {
  unregisterQuotaCheck()
  if (_clientPromise === null) return
  try {
    const client = await _clientPromise
    await client.close()
  } finally {
    _clientPromise = null
  }
}

// ---------------------------------------------------------------------------
// Quota guard + comment eviction (T15)
// ---------------------------------------------------------------------------

let _quotaCheckTimer: ReturnType<typeof setInterval> | null = null

/**
 * Check storage quota and evict old comments if usage exceeds 80%.
 * Called after initialSync() completion and once per hour via setInterval.
 * Gracefully handles StorageManager unavailability (older browsers).
 */
async function checkQuotaAndEvict(): Promise<void> {
  if (!navigator.storage?.estimate) {
    // StorageManager unavailable — skip silently
    return
  }

  try {
    const { usage, quota } = await navigator.storage.estimate()
    if (usage === undefined || quota === undefined) return

    const ratio = quota > 0 ? usage / quota : 0

    if (ratio > 0.8) {
      // Evict comments older than 90 days
      const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000
      await mutate(
        'DELETE FROM comments WHERE created_at < ?',
        [ninetyDaysAgo] as unknown as SqlBindings,
      )

      if (import.meta.env.VITE_SYNC_DEBUG === 'true') {
        console.info(`[sync] quota eviction: deleted comments older than 90 days`)
      }
    }
  } catch (err) {
    // Silently fail if quota check or eviction fails
    if (import.meta.env.VITE_SYNC_DEBUG === 'true') {
      console.warn('[sync] quota check failed:', err)
    }
  }
}

/**
 * Register hourly quota checks. Called at module init.
 * Call destroy() to unregister.
 */
export function registerQuotaCheck(): void {
  if (_quotaCheckTimer !== null) return

  // Set up hourly interval
  _quotaCheckTimer = setInterval(() => {
    void checkQuotaAndEvict()
  }, 60 * 60 * 1000) // 1 hour
}

/**
 * Unregister quota checks. Called on destroy() or logout.
 */
function unregisterQuotaCheck(): void {
  if (_quotaCheckTimer !== null) {
    clearInterval(_quotaCheckTimer)
    _quotaCheckTimer = null
  }
}

// Export for pull.ts to call after initialSync
export { checkQuotaAndEvict }
