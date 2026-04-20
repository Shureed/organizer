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

let _db: OO1DB | null = null

// Single promise that serialises the init path.
let _initPromise: Promise<void> | null = null

// ---------------------------------------------------------------------------
// Migration runner
// ---------------------------------------------------------------------------

// Migrations are imported at build time via Vite's ?raw query. Each module in
// the migrations/ sub-folder is a numbered SQL file (e.g. 001_init.sql).
// At PR-A time the folder is empty (stubbed for T5). The runner is a no-op
// when no migration modules are registered.

type MigrationEntry = { version: number; sql: string }

// Build-time import of all migration files. Vite resolves import.meta.glob at
// compile time, so the resulting map is always present even if empty.
const _migrationModules = import.meta.glob<{ default: string }>(
  './migrations/*.sql',
  { query: '?raw', eager: true },
)

function _loadMigrations(): MigrationEntry[] {
  const entries: MigrationEntry[] = []
  for (const [filePath, mod] of Object.entries(_migrationModules)) {
    // Extract the leading number from the filename, e.g. "001_init.sql" → 1
    const fileName = filePath.split('/').pop() ?? ''
    const match = /^(\d+)/.exec(fileName)
    if (!match) continue
    const version = parseInt(match[1], 10)
    entries.push({ version, sql: mod.default })
  }
  return entries.sort((a, b) => a.version - b.version)
}

function _runMigrations(db: OO1DB): void {
  // Ensure the migrations tracking table exists.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version  INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  const migrations = _loadMigrations()
  if (migrations.length === 0) return

  // Determine which versions have already been applied.
  const applied = new Set<number>()
  db.exec({
    sql: 'SELECT version FROM _migrations',
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => {
      applied.add(row['version'] as number)
    },
  })

  // Apply pending migrations inside a single transaction.
  const pending = migrations.filter((m) => !applied.has(m.version))
  if (pending.length === 0) return

  db.transaction(() => {
    for (const { version, sql } of pending) {
      db.exec(sql)
      db.exec({
        sql: 'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)',
        bind: [version, new Date().toISOString()],
      })
    }
  })
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

async function _init(): Promise<void> {
  // Bail early if OPFS is not available in this environment (Safari <17, etc.)
  if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) {
    throw new InitError('OPFS is not available in this environment (navigator.storage.getDirectory missing)')
  }

  const sqlite3 = await sqlite3InitModule({
    // Suppress the default stdout/stderr output from the wasm module.
    print: () => { /* noop */ },
    printErr: () => { /* noop */ },
  })

  // Install the SAHPool VFS. This does NOT require crossOriginIsolated.
  // 'name' sets the VFS identifier; 'initialCapacity' controls how many OPFS
  // file handles are pre-allocated (default 6 is sufficient for one DB +
  // temp files; keep default here).
  const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'organizer-pool' })

  // Open (or create) the database.
  _db = new poolUtil.OpfsSAHPoolDb('/organizer.db')

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
   * Close the database and release all OPFS file handles.
   * After calling this the worker should be terminated.
   */
  async close(): Promise<void> {
    if (_db) {
      _db.close()
      _db = null
    }
    _initPromise = null
  },
}

Comlink.expose(api)
