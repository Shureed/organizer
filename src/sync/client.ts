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
    .catch(() => {
      console.info('[sync] cold-boot failed — OPFS unavailable, falling back')
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
  if (_clientPromise === null) return
  try {
    const client = await _clientPromise
    await client.close()
  } finally {
    _clientPromise = null
  }
}
