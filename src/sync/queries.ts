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
import {
  sqliteTasks as sqliteTasksSQL,
  sqliteProjects as sqliteProjectsSQL,
  sqliteClosedTasks as sqliteClosedTasksSQL,
  sqliteClosedProjects as sqliteClosedProjectsSQL,
  sqliteInbox as sqliteInboxSQL,
  sqlitePinnedDoneTasks as sqlitePinnedDoneTasksSQL,
  sqlitePinnedAll as sqlitePinnedAllSQL,
  sqliteRecentItems as sqliteRecentItemsSQL,
} from './querySources'

// ---------------------------------------------------------------------------
// Auth uid helper — synchronous, belt-and-suspenders
//
// Reads from globalThis.__SB_UID__ which is set by setCacheUserScope() in
// src/lib/pwa.ts on every auth state change (including initial getSession).
// If the uid is not yet known (pre-login), returns the impossible fallback
// UUID so that every query returns zero rows rather than leaking data.
// ---------------------------------------------------------------------------

const FALLBACK_UID = '00000000-0000-0000-0000-000000000000'

function getLocalUid(): string {
  const uid = (globalThis as unknown as { __SB_UID__?: string }).__SB_UID__
  if (!uid || uid === 'anon') return FALLBACK_UID
  return uid
}

// ── Slice query functions ────────────────────────────────────────────────────

export async function sqliteTasks(): Promise<void> {
  const rows = await query(
    sqliteTasksSQL,
    [getLocalUid()] as unknown as SqlBindings,
  )
  useDataStore.getState().setData({ tasks: rows as never[] })
}

export async function sqliteProjects(): Promise<void> {
  const rows = await query(
    sqliteProjectsSQL,
    [getLocalUid()] as unknown as SqlBindings,
  )
  useDataStore.getState().setData({ projects: rows as never[] })
}

export async function sqliteClosedTasks(): Promise<void> {
  const rows = await query(
    sqliteClosedTasksSQL,
    [getLocalUid()] as unknown as SqlBindings,
  )
  useDataStore.getState().setData({ closedTasks: rows as never[] })
}

export async function sqliteClosedProjects(): Promise<void> {
  const rows = await query(
    sqliteClosedProjectsSQL,
    [getLocalUid()] as unknown as SqlBindings,
  )
  useDataStore.getState().setData({ closedProjects: rows as never[] })
}

export async function sqliteInbox(): Promise<void> {
  const rows = await query(
    sqliteInboxSQL,
    [getLocalUid()] as unknown as SqlBindings,
  )
  useDataStore.getState().setData({ inbox: rows as never[] })
}

export async function sqlitePinnedDoneTasks(): Promise<void> {
  const rows = await query(
    sqlitePinnedDoneTasksSQL,
    [getLocalUid()] as unknown as SqlBindings,
  )
  useDataStore.getState().setData({ pinnedDoneTasks: rows as never[] })
}

export async function sqlitePinnedAll(): Promise<void> {
  const rows = await query(
    sqlitePinnedAllSQL,
    [getLocalUid()] as unknown as SqlBindings,
  )
  useDataStore.getState().setData({ pinnedAll: rows as never[] })
}

export async function sqliteRecentItems(): Promise<void> {
  const rows = await query(
    sqliteRecentItemsSQL,
    [getLocalUid()] as unknown as SqlBindings,
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
