/**
 * querySources.ts — SQLite SELECT SQL strings for the local slice loaders.
 *
 * These constants are used by:
 *   1. The sqlite-based slice loaders (queries.ts).
 *   2. The column-presence test (src/sync/__tests__/column-presence.test.ts),
 *      which runs them directly against an in-memory DB.
 *
 * Keeping the SQL in one place means a change to a query is immediately
 * visible in both the runtime loader and the test.
 *
 * Defense-in-depth: every SELECT carries an explicit `AND user_id = ?`
 * predicate (positional bind parameter).  The caller (queries.ts) must
 * supply the current auth uid as the last binding.  If the uid is unknown
 * (pre-login) callers bind '00000000-0000-0000-0000-000000000000' so zero
 * rows are returned instead of leaking another user's data.
 *
 * This is belt-and-suspenders on top of RLS / security_invoker views — it
 * must NOT replace any other check and must never be removed.
 */

// ---------------------------------------------------------------------------
// Active tasks (mirrors v_active_tasks view)
// ---------------------------------------------------------------------------
export const sqliteTasks = `
  SELECT
    id, user_id, name, status, type, priority, parent_id, space_id,
    date, bucket, body, completed_at, archived, created_at, updated_at,
    project_name, space_name, space_path, pinned, git_pr_url, git_backed
  FROM v_active_tasks
  WHERE user_id = ?
  ORDER BY date ASC NULLS LAST, created_at ASC
`

// ---------------------------------------------------------------------------
// Active projects (mirrors v_active_projects view)
// ---------------------------------------------------------------------------
export const sqliteProjects = `
  SELECT
    id, user_id, name, status, space_id, body,
    archived, created_at, updated_at,
    space_name, space_path, open_task_count
  FROM v_active_projects
  WHERE user_id = ?
  ORDER BY name ASC
`

// ---------------------------------------------------------------------------
// Closed tasks (done/cancelled, non-archived, non-project)
// ---------------------------------------------------------------------------
export const sqliteClosedTasks = `
  SELECT
    id, user_id, name, status, type, priority, parent_id, space_id,
    date, bucket, body, completed_at, archived, pinned,
    git_backed, git_pr_url,
    project_name, space_name, space_path,
    created_at, updated_at, _synced_at, _dirty, _deleted
  FROM action_node
  WHERE user_id = ?
    AND status IN ('done', 'cancelled')
    AND archived = 0
    AND type != 'project'
    AND _deleted = 0
`

// ---------------------------------------------------------------------------
// Closed projects (done/cancelled, non-archived)
// ---------------------------------------------------------------------------
export const sqliteClosedProjects = `
  SELECT
    id, user_id, name, status, type, priority, parent_id, space_id,
    date, bucket, body, completed_at, archived, pinned,
    git_backed, git_pr_url,
    project_name, space_name, space_path,
    created_at, updated_at, _synced_at, _dirty, _deleted
  FROM action_node
  WHERE user_id = ?
    AND type = 'project'
    AND status IN ('done', 'cancelled')
    AND archived = 0
    AND _deleted = 0
`

// ---------------------------------------------------------------------------
// Inbox items (mirrors v_new_inbox view)
// ---------------------------------------------------------------------------
export const sqliteInbox = `
  SELECT
    id, user_id, title, body, source, item_id, item_type,
    archived, created_at, updated_at, read, pinned
  FROM v_new_inbox
  WHERE user_id = ?
  ORDER BY pinned DESC, created_at DESC
`

// ---------------------------------------------------------------------------
// Pinned done tasks
// ---------------------------------------------------------------------------
export const sqlitePinnedDoneTasks = `
  SELECT
    id, user_id, name, status, type, priority, parent_id, space_id,
    date, bucket, body, completed_at, archived, pinned,
    git_backed, git_pr_url,
    project_name, space_name, space_path,
    created_at, updated_at, _synced_at, _dirty, _deleted
  FROM action_node
  WHERE user_id = ?
    AND pinned = 1
    AND status = 'done'
    AND archived = 0
    AND _deleted = 0
  ORDER BY created_at ASC
`

// ---------------------------------------------------------------------------
// All pinned items (active, any status)
// ---------------------------------------------------------------------------
export const sqlitePinnedAll = `
  SELECT
    id, user_id, name, status, type, priority, parent_id, space_id,
    date, bucket, body, completed_at, archived, pinned,
    git_backed, git_pr_url,
    project_name, space_name, space_path,
    created_at, updated_at, _synced_at, _dirty, _deleted
  FROM action_node
  WHERE user_id = ?
    AND pinned = 1
    AND archived = 0
    AND _deleted = 0
  ORDER BY created_at ASC
`

// ---------------------------------------------------------------------------
// Recent items
// ---------------------------------------------------------------------------
export const sqliteRecentItems = `
  SELECT id, name, status, updated_at, type, priority
  FROM action_node
  WHERE user_id = ?
    AND archived = 0
    AND _deleted = 0
  ORDER BY updated_at DESC
  LIMIT 25
`

