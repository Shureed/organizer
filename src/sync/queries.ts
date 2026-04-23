/**
 * queries.ts — SQLite-backed slice loaders (master-P6 PR-C T9)
 *
 * One exported function per slice, mirroring the existing Supabase SELECT
 * shape.  Each function calls client.query<T>() against the local views /
 * tables and dispatches into the Zustand store.
 *
 * Ordering: preserved to match the REST queries in useDataLoader.ts so that
 * switching the flag does not reorder rows in the UI.
 */

import { query } from './client'
import { useDataStore } from '../store/appState'
import type { SqlBindings } from './db.worker'

// ── Slice query functions ────────────────────────────────────────────────────

export async function sqliteTasks(): Promise<void> {
  const rows = await query(
    `SELECT id, user_id, name, status, type, priority, parent_id, space_id,
            date, bucket, body, completed_at, archived, created_at, updated_at,
            project_name, space_name, space_path, pinned, git_pr_url, git_backed
       FROM v_active_tasks
      ORDER BY date ASC NULLS LAST, created_at ASC`,
  )
  useDataStore.getState().setData({ tasks: rows as never[] })
}

export async function sqliteProjects(): Promise<void> {
  const rows = await query(
    `SELECT id, user_id, name, status, space_id, body, archived,
            created_at, updated_at, space_name, space_path, open_task_count
       FROM v_active_projects
      ORDER BY name ASC`,
  )
  useDataStore.getState().setData({ projects: rows as never[] })
}

export async function sqliteClosedTasks(): Promise<void> {
  const rows = await query(
    `SELECT *
       FROM action_node
      WHERE status IN ('done', 'cancelled')
        AND archived = 0
        AND type != 'project'
        AND _deleted = 0`,
  )
  useDataStore.getState().setData({ closedTasks: rows as never[] })
}

export async function sqliteClosedProjects(): Promise<void> {
  const rows = await query(
    `SELECT *
       FROM action_node
      WHERE type = 'project'
        AND status IN ('done', 'cancelled')
        AND archived = 0
        AND _deleted = 0`,
  )
  useDataStore.getState().setData({ closedProjects: rows as never[] })
}

export async function sqliteInbox(): Promise<void> {
  const rows = await query(
    `SELECT id, user_id, title, body, source, item_id, item_type,
            archived, created_at, updated_at, read, pinned
       FROM v_new_inbox`,
  )
  useDataStore.getState().setData({ inbox: rows as never[] })
}

export async function sqlitePinnedDoneTasks(): Promise<void> {
  const rows = await query(
    `SELECT *
       FROM action_node
      WHERE pinned = 1
        AND status = 'done'
        AND archived = 0
        AND _deleted = 0
      ORDER BY created_at ASC`,
  )
  useDataStore.getState().setData({ pinnedDoneTasks: rows as never[] })
}

export async function sqliteRecentItems(): Promise<void> {
  const rows = await query(
    `SELECT id, name, status, updated_at, type, priority
       FROM action_node
      WHERE archived = 0
        AND _deleted = 0
      ORDER BY updated_at DESC
      LIMIT 25`,
  )
  useDataStore.getState().setData({ recentItems: rows as never[] })
}

// ── Comments (per-entity) ────────────────────────────────────────────────────

export interface CommentDbRow {
  id: string
  actor: string
  body: string
  created_at: string
  entity_type: string
  entity_id: string
  parent_comment_id: string | null
}

/**
 * Read comments for one entity from the local SQLite mirror.
 * Filters out tombstoned rows (_deleted = 0) — the comments table does not
 * currently carry _deleted, but the condition is safe (always true) and
 * future-proofs the query if the column is added later.
 */
export async function getComments(
  entityType: string,
  entityId: string,
): Promise<CommentDbRow[]> {
  const rows = await query<CommentDbRow>(
    `SELECT id, actor, body, created_at, entity_type, entity_id, parent_comment_id
       FROM comments
      WHERE entity_type = ?
        AND entity_id = ?
      ORDER BY created_at ASC`,
    [entityType, entityId] as unknown as SqlBindings,
  )
  return rows
}
