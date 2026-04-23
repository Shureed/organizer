/**
 * seed.ts — Fixture seed builder for in-process SQLite tests.
 *
 * Exports:
 *   seed(db)             Insert minimum rows per mirrored table.
 *   migrationSources()   Return MigrationSource[] by reading migration SQL
 *                        files from disk (Node-only; test environment only).
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import path from 'path'
import type { MigrationSource } from '../../migrationRunner'

// ---------------------------------------------------------------------------
// Types — use any to avoid coupling to sqlite-wasm's overloaded exec signature
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MinimalDb = any

// ---------------------------------------------------------------------------
// migrationSources — read SQL files from disk (Node/test only)
// ---------------------------------------------------------------------------

/**
 * Return ordered MigrationSource[] by reading migration SQL files from the
 * migrations/ folder at the absolute filesystem path resolved relative to
 * this module.  Uses fs.readFileSync (safe in a Node/Vitest process only).
 */
export async function migrationSources(): Promise<MigrationSource[]> {
  const migrationsDir = path.resolve(
    fileURLToPath(import.meta.url),
    '../../../migrations',
  )

  // Enumerate migration files by naming convention (NNN_*.sql).
  // We use a static list derived from what exists at test time.
  // Adding a new migration file here automatically picks it up.
  const files = ['001_init.sql']

  return files.map((fileName) => ({
    name: fileName,
    sql: readFileSync(path.join(migrationsDir, fileName), 'utf8'),
  }))
}

// ---------------------------------------------------------------------------
// IDs for fixture rows (stable across test runs)
// ---------------------------------------------------------------------------

export const FIXTURE_IDS = {
  PROJECT_ID: 'proj-aaaa-0001',
  TASK1_ID: 'task-aaaa-0001',
  TASK2_ID: 'task-aaaa-0002',
  CLOSED_TASK_ID: 'task-aaaa-0003',
  CLOSED_PROJECT_ID: 'proj-aaaa-0002',
  PINNED_DONE_TASK_ID: 'task-aaaa-0004',
  BRANCHED_FROM_ID: 'task-aaaa-0010',
  BRANCHED_NODE_ID: 'task-aaaa-0011',
  INBOX_ID: 'inbox-aaaa-0001',
  COMMENT_ID: 'comm-aaaa-0001',
} as const

const NOW = '2026-01-01T00:00:00.000Z'
const USER_ID = 'user-test-0001'

// ---------------------------------------------------------------------------
// seed — insert min rows per table
// ---------------------------------------------------------------------------

/**
 * Insert minimum fixture rows into the already-migrated in-memory DB.
 *
 * Covers:
 *   action_node  — project, open tasks, closed task, closed project,
 *                  pinned-done task, branched_from origin + branched node
 *   inbox        — one unarchived inbox item
 *   comments     — one comment row
 *
 * Denormalised join columns (project_name, space_name, space_path) are
 * populated on rows that belong to a project or space so tests catch
 * regressions in those columns.
 */
export function seed(db: MinimalDb): void {
  // ── Project ───────────────────────────────────────────────────────────────
  db.exec({
    sql: `INSERT INTO action_node
      (id, user_id, name, status, type, priority, parent_id, space_id,
       date, bucket, body, completed_at, archived, pinned,
       git_backed, git_pr_url,
       project_name, space_name, space_path,
       created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    bind: [
      FIXTURE_IDS.PROJECT_ID, USER_ID, 'Test Project', 'open', 'project',
      null, null, 'space-001',
      null, null, 'Project body', null, 0, 0,
      0, null,
      null, 'Test Space', 'test/space',
      NOW, NOW, Date.now(),
    ],
  })

  // ── Open task 1 (belongs to project, has space join columns) ──────────────
  db.exec({
    sql: `INSERT INTO action_node
      (id, user_id, name, status, type, priority, parent_id, space_id,
       date, bucket, body, completed_at, archived, pinned,
       git_backed, git_pr_url,
       project_name, space_name, space_path,
       created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    bind: [
      FIXTURE_IDS.TASK1_ID, USER_ID, 'Open Task 1', 'open', 'task',
      'high', FIXTURE_IDS.PROJECT_ID, 'space-001',
      '2026-01-02', 'today', 'Task body', null, 0, 0,
      0, null,
      'Test Project', 'Test Space', 'test/space',
      NOW, NOW, Date.now(),
    ],
  })

  // ── Open task 2 (no project, no space) ────────────────────────────────────
  db.exec({
    sql: `INSERT INTO action_node
      (id, user_id, name, status, type, priority, parent_id, space_id,
       date, bucket, body, completed_at, archived, pinned,
       git_backed, git_pr_url,
       project_name, space_name, space_path,
       created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    bind: [
      FIXTURE_IDS.TASK2_ID, USER_ID, 'Open Task 2', 'open', 'task',
      null, null, null,
      null, null, null, null, 0, 0,
      0, null,
      null, null, null,
      NOW, NOW, Date.now(),
    ],
  })

  // ── Closed task (done, non-archived) ──────────────────────────────────────
  db.exec({
    sql: `INSERT INTO action_node
      (id, user_id, name, status, type, priority, parent_id, space_id,
       date, bucket, body, completed_at, archived, pinned,
       git_backed, git_pr_url,
       project_name, space_name, space_path,
       created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    bind: [
      FIXTURE_IDS.CLOSED_TASK_ID, USER_ID, 'Closed Task', 'done', 'task',
      null, null, null,
      null, null, null, NOW, 0, 0,
      0, null,
      null, null, null,
      NOW, NOW, Date.now(),
    ],
  })

  // ── Closed project (done, non-archived) ───────────────────────────────────
  db.exec({
    sql: `INSERT INTO action_node
      (id, user_id, name, status, type, priority, parent_id, space_id,
       date, bucket, body, completed_at, archived, pinned,
       git_backed, git_pr_url,
       project_name, space_name, space_path,
       created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    bind: [
      FIXTURE_IDS.CLOSED_PROJECT_ID, USER_ID, 'Closed Project', 'done', 'project',
      null, null, null,
      null, null, null, NOW, 0, 0,
      0, null,
      null, null, null,
      NOW, NOW, Date.now(),
    ],
  })

  // ── Pinned done task ──────────────────────────────────────────────────────
  db.exec({
    sql: `INSERT INTO action_node
      (id, user_id, name, status, type, priority, parent_id, space_id,
       date, bucket, body, completed_at, archived, pinned,
       git_backed, git_pr_url,
       project_name, space_name, space_path,
       created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    bind: [
      FIXTURE_IDS.PINNED_DONE_TASK_ID, USER_ID, 'Pinned Done Task', 'done', 'task',
      null, null, null,
      null, null, null, NOW, 0, 1,
      0, null,
      null, null, null,
      NOW, NOW, Date.now(),
    ],
  })

  // ── Origin node (active task that has a branched child) ───────────────────
  db.exec({
    sql: `INSERT INTO action_node
      (id, user_id, name, status, type, priority, parent_id, space_id,
       date, bucket, body, completed_at, archived, pinned,
       git_backed, git_pr_url,
       project_name, space_name, space_path,
       created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    bind: [
      FIXTURE_IDS.BRANCHED_FROM_ID, USER_ID, 'Origin Task', 'open', 'task',
      null, null, null,
      null, null, null, null, 0, 0,
      0, null,
      null, null, null,
      NOW, NOW, Date.now(),
    ],
  })

  // ── Branched node (branched_from origin) ─────────────────────────────────
  db.exec({
    sql: `INSERT INTO action_node
      (id, user_id, name, status, type, priority, parent_id, space_id,
       date, bucket, body, completed_at, archived, pinned,
       git_backed, git_pr_url,
       project_name, space_name, space_path,
       created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    bind: [
      FIXTURE_IDS.BRANCHED_NODE_ID, USER_ID, 'Branched Node', 'open', 'task',
      null, FIXTURE_IDS.BRANCHED_FROM_ID, null,
      null, null, null, null, 0, 0,
      0, null,
      null, null, null,
      NOW, NOW, Date.now(),
    ],
  })

  // ── Inbox item ────────────────────────────────────────────────────────────
  db.exec({
    sql: `INSERT INTO inbox
      (id, user_id, title, body, source, item_id, item_type,
       archived, read, pinned, created_at, updated_at, _synced_at, _dirty, _deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)`,
    bind: [
      FIXTURE_IDS.INBOX_ID, USER_ID, 'Test Inbox Item', 'Inbox body', 'chat',
      null, null,
      0, 0, 0, NOW, NOW, Date.now(),
    ],
  })

  // ── Comment ───────────────────────────────────────────────────────────────
  db.exec({
    sql: `INSERT INTO comments
      (id, user_id, entity_type, entity_id, body, actor,
       parent_comment_id, created_at, _synced_at, _dirty)
      VALUES (?,?,?,?,?,?,?,?,?,0)`,
    bind: [
      FIXTURE_IDS.COMMENT_ID, USER_ID, 'action_node', FIXTURE_IDS.TASK1_ID,
      'Test comment', 'Claude',
      null, NOW, Date.now(),
    ],
  })
}
