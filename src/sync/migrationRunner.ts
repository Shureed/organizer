/**
 * migrationRunner.ts — pure migration runner, usable from both the browser
 * worker and Node/Vitest test environments.
 *
 * The caller is responsible for opening the DB and providing SQL strings.
 * No filesystem access happens inside this module.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single migration record: a unique name and the SQL to execute. */
export interface MigrationSource {
  name: string
  sql: string
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Internal DB interface (duck-typed to avoid coupling to sqlite-wasm types)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any

/**
 * Run pending migrations against an already-opened sqlite-wasm oo1 DB.
 *
 * Tracks applied migrations in a `_migrations` table (version key = name).
 * Executes all pending entries in declaration order inside a single
 * transaction.  Safe to call on a freshly-opened DB and on a DB that already
 * has some migrations applied (idempotent for already-applied entries).
 *
 * @param db              An open sqlite-wasm `oo1.DB` instance (typed as any
 *                        to avoid coupling to the sqlite-wasm type overloads).
 * @param migrationSources  Ordered list of {name, sql} records.
 */
export function runMigrations(
  db: AnyDb,
  migrationSources: MigrationSource[],
): void {
  // Ensure the tracking table exists.
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `)

  if (migrationSources.length === 0) return

  // Determine which names have already been applied.
  const applied = new Set<string>()
  db.exec({
    sql: 'SELECT name FROM _migrations',
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => {
      applied.add(row['name'] as string)
    },
  })

  // Filter to pending migrations.
  const pending = migrationSources.filter((m) => !applied.has(m.name))
  if (pending.length === 0) return

  // Apply all pending migrations inside a single transaction.
  db.transaction(() => {
    for (const { name, sql } of pending) {
      db.exec(sql)
      db.exec({
        sql: 'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
        bind: [name, new Date().toISOString()],
      })
    }
  })
}
