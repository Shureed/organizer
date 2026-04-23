/**
 * querySources.ts — SQLite SELECT SQL strings for the 9 local slice loaders.
 *
 * These constants are used by:
 *   1. Future sqlite-based slice loaders (queries.ts, PR-C flip-over).
 *   2. The column-presence test (src/sync/__tests__/column-presence.test.ts),
 *      which runs them directly against an in-memory DB.
 *
 * Keeping the SQL in one place means a change to a query is immediately
 * visible in both the runtime loader and the test.
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
  WHERE status IN ('done', 'cancelled')
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
  WHERE type = 'project'
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
  WHERE pinned = 1
    AND status = 'done'
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
  WHERE archived = 0
    AND _deleted = 0
  ORDER BY updated_at DESC
  LIMIT 25
`

