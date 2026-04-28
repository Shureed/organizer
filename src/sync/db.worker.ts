/**
 * db.worker.ts — dedicated worker that owns the SQLite DB handle.
 *
 * Uses @sqlite.org/sqlite-wasm with the OPFS SAHPool VFS, which does NOT
 * require crossOriginIsolated (no COOP/COEP headers needed). See plan §4.1.
 *
 * Exposed via Comlink: { exec, select, ready, close }
 * The worker must be instantiated as a module worker:
 *   new Worker(new URL('./db.worker.ts', import.meta.url), { type: 'module' })
 */

import * as Comlink from 'comlink'
import sqlite3InitModule, { type BindingSpec } from '@sqlite.org/sqlite-wasm'
import { runMigrations } from './migrationRunner'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SqlBindings = BindingSpec

export interface DbApi {
  /** Run a SQL statement (INSERT / UPDATE / DELETE / DDL). Does not return rows. */
  exec(sql: string, params?: SqlBindings): Promise<void>
  /** Run a SELECT and return rows as plain objects. */
  select<T = Record<string, unknown>>(sql: string, params?: SqlBindings): Promise<T[]>
  /** Returns true once the DB has been initialised successfully. */
  ready(): Promise<boolean>
  /** Close the DB and release OPFS handles. */
  close(): Promise<void>
}

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

type Sqlite3Module = Awaited<ReturnType<typeof sqlite3InitModule>>
type OO1DB = InstanceType<Sqlite3Module['oo1']['DB']>
type SAHPoolUtil = Awaited<ReturnType<Sqlite3Module['installOpfsSAHPoolVfs']>>

let _db: OO1DB | null = null
let _poolUtil: SAHPoolUtil | null = null

// Single promise that serialises the init path.
let _initPromise: Promise<void> | null = null

const _DB_PATH = '/organizer.db'

// ---------------------------------------------------------------------------
// Migration loader
// ---------------------------------------------------------------------------

// Migrations are imported at build time via Vite's ?raw query. Each module in
// the migrations/ sub-folder is a numbered SQL file (e.g. 001_init.sql).
// The runner is a no-op when no migration modules are registered.

// Build-time import of all migration files. Vite resolves import.meta.glob at
// compile time, so the resulting map is always present even if empty.
const _migrationModules = import.meta.glob<{ default: string }>(
  './migrations/*.sql',
  { query: '?raw', eager: true },
)

function _loadMigrationSources() {
  const entries: Array<{ order: number; name: string; sql: string }> = []
  for (const [filePath, mod] of Object.entries(_migrationModules)) {
    const fileName = filePath.split('/').pop() ?? ''
    const match = /^(\d+)/.exec(fileName)
    if (!match) continue
    entries.push({ order: parseInt(match[1], 10), name: fileName, sql: mod.default })
  }
  entries.sort((a, b) => a.order - b.order)
  return entries.map(({ name, sql }) => ({ name, sql }))
}

function _runMigrations(db: OO1DB): void {
  runMigrations(db, _loadMigrationSources())
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

async function _init(): Promise<void> {
  // Bail early if OPFS is not available in this environment (Safari <17, etc.)
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new InitError('OPFS is not available in this environment (navigator.storage.getDirectory missing)')
  }

  // Surface wasm stdout/stderr only when VITE_SYNC_DEBUG is on. Default is
  // silent — wasm init output is noisy and not actionable in normal runs, but
  // when init fails (OPFS / SAHPool / wasm fetch) the error string only shows
  // up via printErr, so we need a togglable path for diagnostics.
  const _debug = import.meta.env.VITE_SYNC_DEBUG === 'true'
  const sqlite3 = await sqlite3InitModule({
    print: _debug ? (msg: string) => { console.info('[sync:wasm]', msg) } : () => {},
    printErr: _debug ? (msg: string) => { console.error('[sync:wasm]', msg) } : () => {},
  })

  // Install the SAHPool VFS. This does NOT require crossOriginIsolated.
  // 'name' sets the VFS identifier; 'initialCapacity' controls how many OPFS
  // file handles are pre-allocated (default 6 is sufficient for one DB +
  // temp files; keep default here).
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'organizer-pool' })
  _poolUtil = poolUtil

  // Open (or create) the database.
  _db = new poolUtil.OpfsSAHPoolDb(_DB_PATH)

  // Apply PRAGMAs immediately after open.
  _db.exec(`
    PRAGMA journal_mode=MEMORY;
    PRAGMA synchronous=NORMAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
  `)

  // Run any pending migrations.
  _runMigrations(_db)
}

function _ensureReady(): Promise<void> {
  if (_initPromise === null) {
    _initPromise = _init().catch((err: unknown) => {
      // Reset so the next call can retry (but callers see the original error
      // immediately via the rejected promise).
      _initPromise = null
      throw err
    })
  }
  return _initPromise
}

// ---------------------------------------------------------------------------
// Comlink-exposed API
// ---------------------------------------------------------------------------

/**
 * Structured error type surfaced when OPFS / wasm initialisation fails.
 * Callers can `instanceof` check for this to detect fallback conditions.
 */
export class InitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InitError'
  }
}

const api: DbApi = {
  /**
   * Execute a SQL statement (INSERT / UPDATE / DELETE / DDL / PRAGMA).
   * Does not return rows. Use `select` for queries.
   */
  async exec(sql: string, params?: SqlBindings): Promise<void> {
    await _ensureReady()
    const db = _db!
    if (params !== undefined) {
      db.exec({ sql, bind: params })
    } else {
      db.exec(sql)
    }
  },

  /**
   * Execute a SELECT and return all rows as plain objects.
   * Column names become object keys; types are SQLite-native.
   */
  async select<T = Record<string, unknown>>(sql: string, params?: SqlBindings): Promise<T[]> {
    await _ensureReady()
    const db = _db!
    const rows: unknown[] = []
    db.exec({
      sql,
      bind: params,
      rowMode: 'object',
      callback: (row: Record<string, unknown>) => { rows.push(row) },
    })
    return rows as T[]
  },

  /**
   * Returns true if the DB has been successfully initialised.
   * Rejects with InitError if OPFS is unavailable or wasm failed to load.
   */
  async ready(): Promise<boolean> {
    await _ensureReady()
    return true
  },

  /**
   * Close the database AND wipe the OPFS-backed file. SAHPool persists files
   * across `_db.close()` — closing alone leaves /organizer.db on disk, so the
   * next caller's `_init()` re-opens the previous user's data. Unlinking after
   * close is what makes `destroySQLite()` actually destroy.
   */
  async close(): Promise<void> {
    if (_db) {
      _db.close()
      _db = null
    }
    if (_poolUtil) {
      await _poolUtil.unlink(_DB_PATH)
    }
    _initPromise = null
  },
}

Comlink.expose(api)
