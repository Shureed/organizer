/**
 * sqlite-wasm-spike.test.ts — Phase 2 task 2.1 SPIKE
 *
 * Goal: determine whether @sqlite.org/sqlite-wasm can boot in-process under
 * Vitest, so the column-presence test in task 2.4 can run in CI without
 * Playwright.
 *
 * Approach
 * --------
 * The production driver (db.worker.ts) is fully gated through:
 *   1. Comlink (requires a Web Worker)
 *   2. OPFS SAHPool VFS (requires navigator.storage.getDirectory)
 *
 * Neither is available in happy-dom or plain Node.  We therefore test two
 * paths:
 *
 *   Suite A — happy-dom (default Vitest env)
 *     Import sqlite3InitModule and try to call it.  happy-dom provides a
 *     partial browser environment but OPFS is absent.  We expect InitError /
 *     OPFS-unavailable behaviour, and separately try the oo1 in-memory DB
 *     which does NOT need OPFS.
 *
 *   Suite B — Node environment (via @vitest-environment node comment)
 *     The package exposes a node.mjs entry (sqlite3-node.mjs) which Node
 *     resolves automatically via the "node" export condition.  In Node there
 *     is no OPFS but oo1.DB(':memory:') should work.
 *
 * Neither suite tries to use OPFS.  We open ':memory:' (in-memory DB) which
 * the sqlite-wasm oo1 layer supports on all platforms.
 *
 * Read before editing
 * -------------------
 *   src/sync/db.worker.ts   — OPFS path; Comlink API; InitError class
 *   src/sync/apply.ts       — always goes through client.ts (Comlink)
 *   src/sync/queries.ts     — all queries go through client.query()
 *
 * Result: see docs/test-sqlite-spike.md
 */

// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function migrationSql(): string {
  const dir = path.resolve(
    fileURLToPath(import.meta.url),
    '../../migrations',
  )
  return readFileSync(path.join(dir, '001_init.sql'), 'utf8')
}

// ---------------------------------------------------------------------------
// Suite A: happy-dom environment
// ---------------------------------------------------------------------------

describe('Suite A — happy-dom: @sqlite.org/sqlite-wasm import + in-memory boot', () => {
  it('A1: can import sqlite3InitModule without throwing', async () => {
    // If the import itself fails (e.g. Worker API missing, wasm fetch failure),
    // this test surfaces the exact error.
    let importError: unknown = null
    let sqlite3InitModule: unknown = null
    try {
      const mod = await import('@sqlite.org/sqlite-wasm')
      sqlite3InitModule = mod.default
    } catch (err) {
      importError = err
    }

    // Record the outcome for diagnostic purposes — we do not .skip here so CI
    // always reports the concrete result.
    console.log('[A1] importError:', importError)
    console.log('[A1] sqlite3InitModule type:', typeof sqlite3InitModule)

    // The test passes if the import resolves (even if the module itself is a
    // no-op function — that would be caught in A2).
    expect(importError).toBeNull()
    expect(typeof sqlite3InitModule).toBe('function')
  })

  it('A2: sqlite3InitModule() resolves and returns an oo1 constructor', async () => {
    const { default: sqlite3InitModule } = await import('@sqlite.org/sqlite-wasm')

    let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>> | null = null
    let initError: unknown = null

    try {
      sqlite3 = await sqlite3InitModule({
        print: () => { /* suppress */ },
        printErr: () => { /* suppress */ },
      })
    } catch (err) {
      initError = err
    }

    console.log('[A2] initError:', initError)
    console.log('[A2] sqlite3 keys:', sqlite3 ? Object.keys(sqlite3) : 'N/A')

    expect(initError).toBeNull()
    expect(sqlite3).not.toBeNull()
    // oo1 is the object-oriented layer that db.worker.ts uses
    expect(sqlite3?.oo1?.DB).toBeDefined()
  })

  it('A3: can open an in-memory DB and run SELECT 1', async () => {
    const { default: sqlite3InitModule } = await import('@sqlite.org/sqlite-wasm')
    const sqlite3 = await sqlite3InitModule({
      print: () => { /* suppress */ },
      printErr: () => { /* suppress */ },
    })

    const db = new sqlite3.oo1.DB(':memory:')
    const rows: unknown[] = []
    db.exec({
      sql: 'SELECT 1 AS val',
      rowMode: 'object',
      callback: (row: Record<string, unknown>) => { rows.push(row) },
    })
    db.close()

    console.log('[A3] SELECT 1 result:', rows)
    expect(rows).toHaveLength(1)
    expect((rows[0] as Record<string, unknown>)['val']).toBe(1)
  })

  it('A4: can apply 001_init.sql migration on an in-memory DB', async () => {
    const { default: sqlite3InitModule } = await import('@sqlite.org/sqlite-wasm')
    const sqlite3 = await sqlite3InitModule({
      print: () => { /* suppress */ },
      printErr: () => { /* suppress */ },
    })

    const db = new sqlite3.oo1.DB(':memory:')
    let migrationError: unknown = null
    try {
      db.exec(migrationSql())
    } catch (err) {
      migrationError = err
    }

    console.log('[A4] migrationError:', migrationError)

    if (migrationError === null) {
      // Verify a representative table exists (as task 2.4 will check columns)
      const rows: unknown[] = []
      db.exec({
        sql: `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
        rowMode: 'object',
        callback: (row: Record<string, unknown>) => { rows.push(row) },
      })
      const tableNames = (rows as Array<{ name: string }>).map((r) => r.name)
      console.log('[A4] tables after migration:', tableNames)
      expect(tableNames).toContain('action_node')
    }

    db.close()
    expect(migrationError).toBeNull()
  })

  it('A5: representative column-presence SELECT (mirrors task 2.4 intent)', async () => {
    const { default: sqlite3InitModule } = await import('@sqlite.org/sqlite-wasm')
    const sqlite3 = await sqlite3InitModule({
      print: () => { /* suppress */ },
      printErr: () => { /* suppress */ },
    })

    const db = new sqlite3.oo1.DB(':memory:')
    db.exec(migrationSql())

    // This is the kind of query task 2.4 will use to assert column presence.
    const rows: unknown[] = []
    db.exec({
      sql: `SELECT name FROM pragma_table_info('action_node') ORDER BY name`,
      rowMode: 'object',
      callback: (row: Record<string, unknown>) => { rows.push(row) },
    })
    const colNames = (rows as Array<{ name: string }>).map((r) => r.name)
    console.log('[A5] action_node columns:', colNames)

    db.close()

    // Spot-check a few columns that queries.ts references
    expect(colNames).toContain('id')
    expect(colNames).toContain('name')
    expect(colNames).toContain('status')
    expect(colNames).toContain('_dirty')
    expect(colNames).toContain('_deleted')
    expect(colNames).toContain('_synced_at')
  })
})
