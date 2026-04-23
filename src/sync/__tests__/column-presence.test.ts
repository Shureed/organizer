/**
 * column-presence.test.ts — Phase 2 task 2.4 (updated Phase 4)
 *
 * Boots wasm-SQLite in-process (happy-dom env), runs migrations, seeds
 * fixtures, then for each of the slice loaders asserts:
 *
 *   Forward check: every column in the SELECT clause is present on at least
 *   one returned row (seed guarantees ≥1 row per loader).
 *
 *   Reverse check: every column name appearing in the raw SQL is present in
 *   pragma_table_info for the source table (catches renames in migrations
 *   that aren't reflected in queries).
 *
 * The test does NOT call the real loaders (those go through Comlink/OPFS).
 * Instead it runs the raw SQL strings from querySources.ts directly.
 *
 * Expected runtime: < 5 s.
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeAll } from 'vitest'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { runMigrations } from '../migrationRunner'
import { migrationSources, seed } from './fixtures/seed'
import {
  sqliteTasks,
  sqliteProjects,
  sqliteClosedTasks,
  sqliteClosedProjects,
  sqliteInbox,
  sqlitePinnedDoneTasks,
  sqliteRecentItems,
} from '../querySources'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Sqlite3Module = Awaited<ReturnType<typeof sqlite3InitModule>>
type OO1DB = InstanceType<Sqlite3Module['oo1']['DB']>

// ---------------------------------------------------------------------------
// DB setup (shared across all tests in this file)
// ---------------------------------------------------------------------------

let db: OO1DB

beforeAll(async () => {
  const sqlite3 = await sqlite3InitModule({
    print: () => { /* suppress */ },
    printErr: () => { /* suppress */ },
  })

  db = new sqlite3.oo1.DB(':memory:')

  const sources = await migrationSources()
  runMigrations(db, sources)
  seed(db)
}, 10_000 /* generous timeout for wasm init */)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a SQL string against the shared in-memory DB, return all rows. */
function selectRows(sql: string): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  db.exec({
    sql,
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => { rows.push({ ...row }) },
  })
  return rows
}

/**
 * Return the set of column names present in pragma_table_info for a table
 * or view.  For views, SQLite returns the columns selected by the view query.
 */
function tableColumns(tableOrView: string): Set<string> {
  const rows = selectRows(`SELECT name FROM pragma_table_info('${tableOrView}')`)
  return new Set(rows.map((r) => r['name'] as string))
}

/**
 * Parse bare column names from a SELECT clause.
 *
 * Handles:
 *   - Simple names:          `id, name`
 *   - Aliased expressions:   `open_task_count` (subquery alias), `chain_nodes`
 *   - Table-qualified:       `o.id AS origin_id` → `origin_id`
 *   - Unaliased identifiers: `id` → `id`
 *
 * Strategy: strip SELECT…FROM, remove subquery blocks, then extract
 * identifiers that are either bare names or the alias after AS.
 */
function extractSelectColumns(sql: string): string[] {
  // Grab the content between SELECT and FROM (first occurrence).
  const selectMatch = /SELECT\s+([\s\S]+?)\s+FROM\s/i.exec(sql)
  if (!selectMatch) return []

  const selectClause = selectMatch[1]

  // Remove parenthesised subqueries (e.g. open_task_count correlated query).
  const withoutSubqueries = selectClause.replace(/\([^)]*\)/g, '')

  // Split on commas and parse each item.
  return withoutSubqueries
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      // `foo AS bar` or `t.foo AS bar` → `bar`
      const asMatch = /\bAS\s+(\w+)\s*$/i.exec(item)
      if (asMatch) return asMatch[1]
      // `t.col` → `col`
      const dotMatch = /\.(\w+)\s*$/.exec(item)
      if (dotMatch) return dotMatch[1]
      // bare `col`
      const bareMatch = /^\w+$/.exec(item.trim())
      if (bareMatch) return item.trim()
      return null
    })
    .filter((c): c is string => c !== null)
}

// ---------------------------------------------------------------------------
// Loader definitions
// ---------------------------------------------------------------------------

interface LoaderSpec {
  name: string
  sql: string
  /**
   * For the reverse check we need the primary source table/view to look up
   * schema columns.  Views expose the right column names via pragma_table_info.
   */
  sourceTableOrView: string
}

const LOADERS: LoaderSpec[] = [
  {
    name: 'sqliteTasks',
    sql: sqliteTasks,
    sourceTableOrView: 'v_active_tasks',
  },
  {
    name: 'sqliteProjects',
    sql: sqliteProjects,
    sourceTableOrView: 'v_active_projects',
  },
  {
    name: 'sqliteClosedTasks',
    sql: sqliteClosedTasks,
    sourceTableOrView: 'action_node',
  },
  {
    name: 'sqliteClosedProjects',
    sql: sqliteClosedProjects,
    sourceTableOrView: 'action_node',
  },
  {
    name: 'sqliteInbox',
    sql: sqliteInbox,
    sourceTableOrView: 'v_new_inbox',
  },
  {
    name: 'sqlitePinnedDoneTasks',
    sql: sqlitePinnedDoneTasks,
    sourceTableOrView: 'action_node',
  },
  {
    name: 'sqliteRecentItems',
    sql: sqliteRecentItems,
    sourceTableOrView: 'action_node',
  },
]

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('column-presence — forward check (query returns expected columns)', () => {
  for (const loader of LOADERS) {
    it(`${loader.name}: ≥1 row returned and all SELECT columns present on rows`, () => {
      const rows = selectRows(loader.sql)

      expect(rows.length).toBeGreaterThan(0)

      const expectedCols = extractSelectColumns(loader.sql)
      const firstRow = rows[0]

      for (const col of expectedCols) {
        expect(
          Object.prototype.hasOwnProperty.call(firstRow, col),
          `column "${col}" missing from ${loader.name} result row`,
        ).toBe(true)
      }
    })
  }
})

describe('column-presence — reverse check (query columns exist in schema)', () => {
  for (const loader of LOADERS) {
    it(`${loader.name}: every selected column exists in ${loader.sourceTableOrView}`, () => {
      const schemaCols = tableColumns(loader.sourceTableOrView)
      const selectedCols = extractSelectColumns(loader.sql)

      for (const col of selectedCols) {
        expect(
          schemaCols.has(col),
          `column "${col}" in ${loader.name} SQL not found in schema of ${loader.sourceTableOrView}`,
        ).toBe(true)
      }
    })
  }
})

describe('column-presence — schema invariants', () => {
  it('action_node does NOT have chain_origin_id', () => {
    const cols = tableColumns('action_node')
    expect(cols.has('chain_origin_id')).toBe(false)
  })

  it('action_node has git_backed and git_pr_url', () => {
    const cols = tableColumns('action_node')
    expect(cols.has('git_backed')).toBe(true)
    expect(cols.has('git_pr_url')).toBe(true)
  })

  it('v_chain_status view does NOT exist', () => {
    // If the view doesn't exist, pragma_table_info returns no rows.
    const rows = selectRows(`SELECT name FROM pragma_table_info('v_chain_status')`)
    expect(rows.length).toBe(0)
  })
})
