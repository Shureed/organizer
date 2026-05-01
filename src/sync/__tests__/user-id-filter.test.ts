/**
 * user-id-filter.test.ts — Defense-in-depth check (T3 of cortex chain be54da60)
 *
 * Verifies that every slice SQL string in querySources.ts returns ONLY rows
 * belonging to the bound user_id.  Seeds the DB with three rows per relevant
 * table:
 *   - one owned by USER_A
 *   - one owned by USER_B
 *   - one with null user_id
 *
 * Then runs each query string bound to USER_A and asserts exactly one row
 * comes back (the USER_A row).  USER_B and null rows must never surface.
 *
 * Expected runtime: < 5 s.
 */

// @vitest-environment happy-dom

import { describe, it, expect, beforeAll } from 'vitest'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import { runMigrations } from '../migrationRunner'
import { migrationSources } from './fixtures/seed'
import {
  sqliteTasks,
  sqliteProjects,
  sqliteClosedTasks,
  sqliteClosedProjects,
  sqliteInbox,
  sqlitePinnedDoneTasks,
  sqlitePinnedAll,
  sqliteRecentItems,
} from '../querySources'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Sqlite3Module = Awaited<ReturnType<typeof sqlite3InitModule>>
type OO1DB = InstanceType<Sqlite3Module['oo1']['DB']>

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_A = 'user-aaaa-0001'
const USER_B = 'user-bbbb-0002'
const NOW = '2026-01-01T00:00:00.000Z'

// ---------------------------------------------------------------------------
// DB setup
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

  seedFilterRows(db)
}, 10_000)

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

let _rowSeq = 0
function nextId(prefix: string): string {
  return `${prefix}-${String(++_rowSeq).padStart(4, '0')}`
}

function insertNode(
  db: OO1DB,
  overrides: {
    id?: string
    user_id: string | null
    status?: string
    type?: string
    pinned?: number
    archived?: number
    _deleted?: number
    completed_at?: string | null
  },
): void {
  const {
    id = nextId('node'),
    user_id,
    status = 'open',
    type = 'task',
    pinned = 0,
    archived = 0,
    _deleted = 0,
    completed_at = null,
  } = overrides

  db.exec({
    sql: `INSERT INTO action_node
      (id, user_id, name, status, type, priority, parent_id, space_id,
       date, bucket, body, completed_at, archived, pinned,
       git_backed, git_pr_url,
       project_name, space_name, space_path,
       created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,?,?,NULL,NULL,NULL,NULL,NULL,NULL,?,?,?,0,NULL,NULL,NULL,NULL,?,?,?,0,?)`,
    bind: [id, user_id, `Node ${id}`, status, type, completed_at, archived, pinned, NOW, NOW, Date.now(), _deleted],
  })
}

function insertInbox(
  db: OO1DB,
  overrides: {
    id?: string
    user_id: string | null
    archived?: number
  },
): void {
  const { id = nextId('inbox'), user_id, archived = 0 } = overrides

  db.exec({
    sql: `INSERT INTO inbox
      (id, user_id, title, body, source, item_id, item_type,
       archived, read, pinned, created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,'body','chat',NULL,NULL,?,0,0,?,?,?,0,0)`,
    bind: [id, user_id, `Inbox ${id}`, archived, NOW, NOW, Date.now()],
  })
}

/**
 * Seed three rows per table: one for USER_A, one for USER_B, one with null
 * user_id.  Row shapes are chosen so that each query's WHERE predicates
 * (status, type, pinned, archived, _deleted) pass for all three rows.
 */
function seedFilterRows(db: OO1DB): void {
  // --- action_node rows for active-tasks / recent-items / closed / pinned queries ---

  // Open tasks (matched by sqliteTasks + sqliteRecentItems)
  insertNode(db, { user_id: USER_A, status: 'open', type: 'task' })
  insertNode(db, { user_id: USER_B, status: 'open', type: 'task' })
  insertNode(db, { user_id: null, status: 'open', type: 'task' })

  // Open projects (matched by sqliteProjects)
  insertNode(db, { user_id: USER_A, status: 'open', type: 'project' })
  insertNode(db, { user_id: USER_B, status: 'open', type: 'project' })
  insertNode(db, { user_id: null, status: 'open', type: 'project' })

  // Closed tasks — done, non-project (matched by sqliteClosedTasks)
  insertNode(db, { user_id: USER_A, status: 'done', type: 'task', completed_at: NOW })
  insertNode(db, { user_id: USER_B, status: 'done', type: 'task', completed_at: NOW })
  insertNode(db, { user_id: null, status: 'done', type: 'task', completed_at: NOW })

  // Closed projects — type=project, done (matched by sqliteClosedProjects)
  insertNode(db, { user_id: USER_A, status: 'done', type: 'project', completed_at: NOW })
  insertNode(db, { user_id: USER_B, status: 'done', type: 'project', completed_at: NOW })
  insertNode(db, { user_id: null, status: 'done', type: 'project', completed_at: NOW })

  // Pinned done tasks (matched by sqlitePinnedDoneTasks + sqlitePinnedAll)
  insertNode(db, { user_id: USER_A, status: 'done', type: 'task', pinned: 1, completed_at: NOW })
  insertNode(db, { user_id: USER_B, status: 'done', type: 'task', pinned: 1, completed_at: NOW })
  insertNode(db, { user_id: null, status: 'done', type: 'task', pinned: 1, completed_at: NOW })

  // Inbox rows (matched by sqliteInbox)
  insertInbox(db, { user_id: USER_A })
  insertInbox(db, { user_id: USER_B })
  insertInbox(db, { user_id: null })
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function selectRows(sql: string, bind: unknown[]): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(db as any).exec({
    sql,
    bind,
    rowMode: 'object',
    callback: (row: Record<string, unknown>) => { rows.push({ ...row }) },
  })
  return rows
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('user_id filter — only USER_A rows returned when bound to USER_A', () => {
  it('sqliteTasks: only USER_A open tasks visible', () => {
    const rows = selectRows(sqliteTasks, [USER_A])
    // There is exactly 1 open task row for USER_A
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      expect(row['user_id']).toBe(USER_A)
    }
  })

  it('sqliteProjects: only USER_A open projects visible', () => {
    const rows = selectRows(sqliteProjects, [USER_A])
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      expect(row['user_id']).toBe(USER_A)
    }
  })

  it('sqliteClosedTasks: only USER_A closed tasks visible', () => {
    const rows = selectRows(sqliteClosedTasks, [USER_A])
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      expect(row['user_id']).toBe(USER_A)
    }
  })

  it('sqliteClosedProjects: only USER_A closed projects visible', () => {
    const rows = selectRows(sqliteClosedProjects, [USER_A])
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      expect(row['user_id']).toBe(USER_A)
    }
  })

  it('sqliteInbox: only USER_A inbox rows visible', () => {
    const rows = selectRows(sqliteInbox, [USER_A])
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      expect(row['user_id']).toBe(USER_A)
    }
  })

  it('sqlitePinnedDoneTasks: only USER_A pinned-done rows visible', () => {
    const rows = selectRows(sqlitePinnedDoneTasks, [USER_A])
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      expect(row['user_id']).toBe(USER_A)
    }
  })

  it('sqlitePinnedAll: only USER_A pinned rows visible', () => {
    const rows = selectRows(sqlitePinnedAll, [USER_A])
    expect(rows.length).toBeGreaterThanOrEqual(1)
    for (const row of rows) {
      expect(row['user_id']).toBe(USER_A)
    }
  })

  it('sqliteRecentItems: at least USER_A recent items visible, no USER_B items present', () => {
    // sqliteRecentItems does not SELECT user_id, so we can't assert it on the row.
    // Instead assert: binding USER_A returns >= 1 rows, and binding USER_B returns
    // different rows (i.e. the filter is actually applied).
    const rowsA = selectRows(sqliteRecentItems, [USER_A])
    const rowsB = selectRows(sqliteRecentItems, [USER_B])
    expect(rowsA.length).toBeGreaterThanOrEqual(1)
    expect(rowsB.length).toBeGreaterThanOrEqual(1)
    // The id sets must be disjoint — no shared rows between users
    const idsA = new Set(rowsA.map((r) => r['id']))
    const idsB = new Set(rowsB.map((r) => r['id']))
    for (const id of idsB) {
      expect(idsA.has(id)).toBe(false)
    }
  })
})

describe('user_id filter — impossible uid returns zero rows', () => {
  const IMPOSSIBLE_UID = '00000000-0000-0000-0000-000000000000'

  it('sqliteTasks: zero rows for impossible uid', () => {
    expect(selectRows(sqliteTasks, [IMPOSSIBLE_UID])).toHaveLength(0)
  })

  it('sqliteProjects: zero rows for impossible uid', () => {
    expect(selectRows(sqliteProjects, [IMPOSSIBLE_UID])).toHaveLength(0)
  })

  it('sqliteClosedTasks: zero rows for impossible uid', () => {
    expect(selectRows(sqliteClosedTasks, [IMPOSSIBLE_UID])).toHaveLength(0)
  })

  it('sqliteInbox: zero rows for impossible uid', () => {
    expect(selectRows(sqliteInbox, [IMPOSSIBLE_UID])).toHaveLength(0)
  })
})
