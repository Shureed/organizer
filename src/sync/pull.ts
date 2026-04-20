/**
 * pull.ts — Pull engine (master-P6 PR-B T6 + T8; extended in PR-C fix T9.5)
 *
 * Three pull paths (plan §4.5):
 *   fullBackfill(table)      Keyset-paginated REST GET until < limit rows returned.
 *   deltaPull(table, since)  Updated-at-filtered pull for incremental sync.
 *   targetedCommentsPull()   Comments for a specific entity_id (on modal open).
 *
 * PR-C fix additions (T9.5):
 *   fullBackfillFromView(view)  Pull from server view (includes join cols).
 *   deltaPullFromView(view)     Delta from server view keyed on updated_at.
 *   pullActiveJoinsFor(ids)     Refresh join cols for specific ids after a
 *                               base-table delta batch.
 *
 * Conflict policy (plan §4.6, T8):
 *   All upserts use LWW via SQLite "ON CONFLICT DO UPDATE … WHERE excluded.updated_at
 *   > <table>.updated_at".  Server state wins when the server row is newer;
 *   a locally-dirty row with a later optimistic updated_at survives the upsert.
 *
 * inbox and action_node follow the SAME LWW path — inbox.updated_at was added
 * server-side (migration add_updated_at_to_inbox) before PR-B was written.
 *
 * Exported surface (plan §4.5 names reconciled with plan §0 T6):
 *   initialSync()            fullBackfill, then view overlays, update _meta cursors.
 *   syncAll()                deltaPull both tables + view refreshes.
 *   pullComments()           Targeted comments pull for one entity.
 */

import type { SqlBindings } from './db.worker'
import { supabase } from '../lib/supabase'
import { mutate, query } from './client'

/** Cast an array of mixed values to the BindingSpec array type SQLite expects. */
function binds(arr: unknown[]): SqlBindings {
  return arr as SqlBindings
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000

// Tables that support LWW via updated_at.
export type SyncTable = 'action_node' | 'inbox'

// ── _meta helpers ────────────────────────────────────────────────────────────

async function getMeta(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(
    'SELECT value FROM _meta WHERE key = ?',
    binds([key]),
  )
  return rows[0]?.value ?? null
}

async function setMeta(key: string, value: string): Promise<void> {
  await mutate(
    'INSERT INTO _meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    binds([key, value]),
  )
}

// ── LWW upsert helper (T8 + T9.5) ────────────────────────────────────────────

/**
 * Build and execute an LWW upsert for a single row into the given table.
 *
 * The WHERE clause on the DO UPDATE branch ensures that a locally-dirty row
 * whose optimistic updated_at is later than the incoming server row is NOT
 * overwritten.  This is the core of the Last-Write-Wins conflict policy
 * described in plan §4.6.
 *
 * inbox and action_node share the same upsert path — both have updated_at.
 *
 * T9.5 addition: two upsert variants for action_node:
 *   - base-table upsert: join cols bound as NULL, preserved via COALESCE so
 *     a base-table pull never clobbers join cols set by a prior view-pull.
 *   - view upsert: join cols bound from the server view row, overwritten unconditionally.
 */

type UpsertMode = 'base' | 'view'

function buildUpsertSql(table: SyncTable, mode: UpsertMode = 'base'): string {
  if (table === 'action_node') {
    if (mode === 'view') {
      // View upsert — overwrite join cols unconditionally (they come from the server view).
      return `
        INSERT INTO action_node (
          id, user_id, name, status, type, priority, parent_id, space_id,
          date, bucket, body, completed_at, archived, pinned,
          chain_origin_id, git_backed, git_pr_url,
          project_name, space_name, space_path,
          created_at, updated_at, _synced_at, _dirty, _deleted
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, 0, 0
        )
        ON CONFLICT(id) DO UPDATE SET
          user_id         = excluded.user_id,
          name            = excluded.name,
          status          = excluded.status,
          type            = excluded.type,
          priority        = excluded.priority,
          parent_id       = excluded.parent_id,
          space_id        = excluded.space_id,
          date            = excluded.date,
          bucket          = excluded.bucket,
          body            = excluded.body,
          completed_at    = excluded.completed_at,
          archived        = excluded.archived,
          pinned          = excluded.pinned,
          chain_origin_id = excluded.chain_origin_id,
          git_backed      = excluded.git_backed,
          git_pr_url      = excluded.git_pr_url,
          project_name    = excluded.project_name,
          space_name      = excluded.space_name,
          space_path      = excluded.space_path,
          created_at      = excluded.created_at,
          updated_at      = excluded.updated_at,
          _synced_at      = excluded._synced_at,
          _dirty          = 0,
          _deleted        = 0
        WHERE excluded.updated_at > action_node.updated_at
           OR action_node._dirty = 0
      `
    }
    // Base-table upsert — join cols bound as NULL; use COALESCE to preserve any
    // existing join col values set by a prior view-pull.
    return `
      INSERT INTO action_node (
        id, user_id, name, status, type, priority, parent_id, space_id,
        date, bucket, body, completed_at, archived, pinned,
        chain_origin_id, git_backed, git_pr_url,
        project_name, space_name, space_path,
        created_at, updated_at, _synced_at, _dirty, _deleted
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        NULL, NULL, NULL,
        ?, ?, ?, 0, 0
      )
      ON CONFLICT(id) DO UPDATE SET
        user_id         = excluded.user_id,
        name            = excluded.name,
        status          = excluded.status,
        type            = excluded.type,
        priority        = excluded.priority,
        parent_id       = excluded.parent_id,
        space_id        = excluded.space_id,
        date            = excluded.date,
        bucket          = excluded.bucket,
        body            = excluded.body,
        completed_at    = excluded.completed_at,
        archived        = excluded.archived,
        pinned          = excluded.pinned,
        chain_origin_id = excluded.chain_origin_id,
        git_backed      = excluded.git_backed,
        git_pr_url      = excluded.git_pr_url,
        project_name    = COALESCE(action_node.project_name, excluded.project_name),
        space_name      = COALESCE(action_node.space_name,   excluded.space_name),
        space_path      = COALESCE(action_node.space_path,   excluded.space_path),
        created_at      = excluded.created_at,
        updated_at      = excluded.updated_at,
        _synced_at      = excluded._synced_at,
        _dirty          = 0,
        _deleted        = 0
      WHERE excluded.updated_at > action_node.updated_at
         OR action_node._dirty = 0
    `
  }
  // inbox
  return `
    INSERT INTO inbox (
      id, user_id, title, body, source, item_id, item_type,
      archived, read, pinned, created_at, updated_at, _synced_at, _dirty, _deleted
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, 0, 0
    )
    ON CONFLICT(id) DO UPDATE SET
      user_id    = excluded.user_id,
      title      = excluded.title,
      body       = excluded.body,
      source     = excluded.source,
      item_id    = excluded.item_id,
      item_type  = excluded.item_type,
      archived   = excluded.archived,
      read       = excluded.read,
      pinned     = excluded.pinned,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      _synced_at = excluded._synced_at,
      _dirty     = 0,
      _deleted   = 0
    WHERE excluded.updated_at > inbox.updated_at
       OR inbox._dirty = 0
  `
}

/** Map a raw server row for action_node (base-table) to the SQLite bind array. */
function actionNodeBinds(row: Record<string, unknown>, now: number): SqlBindings {
  return binds([
    row['id'],
    row['user_id'] ?? null,
    row['name'],
    row['status'] ?? 'open',
    row['type'] ?? 'task',
    row['priority'] ?? null,
    row['parent_id'] ?? null,
    row['space_id'] ?? null,
    row['date'] ?? null,
    row['bucket'] ?? null,
    row['body'] ?? null,
    row['completed_at'] ?? null,
    boolToInt(row['archived']),
    boolToInt(row['pinned']),
    row['chain_origin_id'] ?? null,
    boolToInt(row['git_backed']),
    row['git_pr_url'] ?? null,
    // project_name / space_name / space_path are NULL for base-table rows;
    // COALESCE in the upsert preserves any previously-set view-pull values.
    row['created_at'],
    row['updated_at'],
    now,
  ])
}

/**
 * Map a raw server VIEW row for action_node to the SQLite bind array.
 * Includes the 3 denormalized join cols that the server view populates.
 */
function actionNodeViewBinds(row: Record<string, unknown>, now: number): SqlBindings {
  return binds([
    row['id'],
    row['user_id'] ?? null,
    row['name'],
    row['status'] ?? 'open',
    row['type'] ?? 'task',
    row['priority'] ?? null,
    row['parent_id'] ?? null,
    row['space_id'] ?? null,
    row['date'] ?? null,
    row['bucket'] ?? null,
    row['body'] ?? null,
    row['completed_at'] ?? null,
    boolToInt(row['archived']),
    boolToInt(row['pinned']),
    row['chain_origin_id'] ?? null,
    boolToInt(row['git_backed']),
    row['git_pr_url'] ?? null,
    row['project_name'] ?? null,
    row['space_name'] ?? null,
    row['space_path'] ?? null,
    row['created_at'],
    row['updated_at'],
    now,
  ])
}

/** Map a raw server row for inbox to the SQLite bind array. */
function inboxBinds(row: Record<string, unknown>, now: number): SqlBindings {
  return binds([
    row['id'],
    row['user_id'] ?? null,
    row['title'],
    row['body'] ?? null,
    row['source'] ?? 'chat',
    row['item_id'] ?? null,
    row['item_type'] ?? null,
    boolToInt(row['archived']),
    boolToInt(row['read']),
    boolToInt(row['pinned']),
    row['created_at'],
    row['updated_at'],
    now,
  ])
}

function boolToInt(v: unknown): number {
  return v ? 1 : 0
}

// ── Row application ───────────────────────────────────────────────────────────

/**
 * Upsert a batch of server rows into the local table (one transaction per call).
 * Uses LWW WHERE clause — see buildUpsertSql() and plan §4.6.
 *
 * mode='base' (default): join cols bound as NULL + COALESCE to preserve existing values.
 * mode='view': join cols bound from server view payload, overwritten unconditionally.
 */
async function applyRows(
  table: SyncTable,
  rows: Record<string, unknown>[],
  mode: UpsertMode = 'base',
): Promise<void> {
  if (rows.length === 0) return

  const sql = buildUpsertSql(table, mode)
  const now = Date.now()

  let bindsFn: (row: Record<string, unknown>, now: number) => SqlBindings
  if (table === 'action_node') {
    bindsFn = mode === 'view' ? actionNodeViewBinds : actionNodeBinds
  } else {
    bindsFn = inboxBinds
  }

  // Execute all upserts in a single transaction for atomicity.
  await mutate('BEGIN')
  try {
    for (const row of rows) {
      await mutate(sql, bindsFn(row, now))
    }
    await mutate('COMMIT')
  } catch (err) {
    await mutate('ROLLBACK')
    throw err
  }
}

// ── upsertFromServer (exported for apply.ts in PR-C T11) ────────────────────

/**
 * Apply a single server row (e.g. from a realtime postgres_changes payload)
 * using the same LWW upsert as applyRows.
 *
 * inbox and action_node follow the same path (plan §4.6, §1.4 #3).
 * mode='base' by default; pass 'view' if the row came from a server view.
 */
export async function upsertFromServer(
  table: SyncTable,
  row: Record<string, unknown>,
  mode: UpsertMode = 'base',
): Promise<void> {
  await applyRows(table, [row], mode)
}

// ── Full backfill ─────────────────────────────────────────────────────────────

/**
 * Keyset-paginated full backfill for a single table.
 * Uses id as the keyset cursor (plan §4.5).
 * Treats empty DB as cold-start — no error on first page (Safari 7-day eviction).
 */
async function fullBackfill(table: SyncTable): Promise<void> {
  let cursor: string | null = null

  for (;;) {
    let builder = supabase
      .from(table)
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (cursor !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      builder = (builder as any).gt('id', cursor)
    }

    const { data, error } = await builder
    if (error) throw error

    const rows = (data ?? []) as Record<string, unknown>[]
    await applyRows(table, rows)

    if (rows.length < PAGE_SIZE) break // last page

    // Advance cursor to the id of the last row on this page.
    cursor = rows[rows.length - 1]?.['id'] as string ?? null
    if (cursor === null) break
  }
}

// ── Delta pull ────────────────────────────────────────────────────────────────

/**
 * Incremental pull: fetches rows where updated_at > <last_pull cursor>.
 * Drains until less than PAGE_SIZE rows are returned (plan §4.5).
 *
 * inbox and action_node use the same path (plan §4.6 note on inbox.updated_at).
 */
async function deltaPull(table: SyncTable): Promise<void> {
  const metaKey = `last_pull_${table}` as const
  const since = await getMeta(metaKey) ?? '1970-01-01T00:00:00.000Z'

  let lastUpdatedAt = since

  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .gt('updated_at' as any, lastUpdatedAt)
      .order('updated_at', { ascending: true })
      .limit(PAGE_SIZE)

    if (error) throw error

    const rows = (data ?? []) as Record<string, unknown>[]
    await applyRows(table, rows)

    if (rows.length === 0) break

    // Advance cursor to the updated_at of the last row.
    lastUpdatedAt = rows[rows.length - 1]?.['updated_at'] as string ?? lastUpdatedAt

    if (rows.length < PAGE_SIZE) break
  }

  // Persist the cursor even if we got 0 rows (to record the attempt time).
  await setMeta(metaKey, lastUpdatedAt)
}

// ── Comments pull ─────────────────────────────────────────────────────────────

/**
 * Fetch all comments for a specific entity (on TaskDetailModal open).
 * Batched by entity_id. Append-only: no LWW needed, just INSERT OR IGNORE.
 */
export async function pullComments(
  entityType: string,
  entityId: string,
): Promise<void> {
  const metaKey = `last_pull_comments_${entityId}`
  const since = await getMeta(metaKey)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let builder = (supabase as any)
    .from('comments')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: true })

  if (since) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    builder = (builder as any).gt('created_at', since)
  }

  const { data, error } = await builder
  if (error) throw error

  const rows = (data ?? []) as Record<string, unknown>[]
  if (rows.length === 0) return

  const now = Date.now()
  await mutate('BEGIN')
  try {
    for (const row of rows) {
      await mutate(
        `INSERT OR IGNORE INTO comments
          (id, user_id, entity_type, entity_id, body, actor, parent_comment_id, created_at, _synced_at, _dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        binds([
          row['id'],
          row['user_id'] ?? null,
          row['entity_type'],
          row['entity_id'],
          row['body'],
          row['actor'],
          row['parent_comment_id'] ?? null,
          row['created_at'],
          now,
        ]),
      )
    }
    await mutate('COMMIT')
  } catch (err) {
    await mutate('ROLLBACK')
    throw err
  }

  // Advance cursor to the created_at of the last comment.
  const lastCreatedAt = rows[rows.length - 1]?.['created_at'] as string
  if (lastCreatedAt) await setMeta(metaKey, lastCreatedAt)
}

// ── View-based pulls (T9.5 PR-C fix) ─────────────────────────────────────────

/** The two active server views that return denormalized join cols. */
export type ActiveView = 'v_active_tasks' | 'v_active_projects'

/**
 * fullBackfillFromView — keyset-paginated full pull from a server view.
 * Unlike fullBackfill (base table), this reads from the server VIEW which
 * returns project_name / space_name / space_path baked in.  Upserts with
 * mode='view' to overwrite the join cols unconditionally.
 *
 * Server views have updated_at passthrough from action_node, so keyset by id
 * works identically to the base table.  This should be called AFTER
 * fullBackfill('action_node') so the target rows already exist and the UPSERT
 * lands as an UPDATE (join col overlay).
 */
export async function fullBackfillFromView(view: ActiveView): Promise<void> {
  let cursor: string | null = null

  for (;;) {
    let builder = supabase
      .from(view)
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)

    if (cursor !== null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      builder = (builder as any).gt('id', cursor)
    }

    const { data, error } = await builder
    if (error) throw error

    const rows = (data ?? []) as Record<string, unknown>[]
    await applyRows('action_node', rows, 'view')

    if (rows.length < PAGE_SIZE) break

    cursor = rows[rows.length - 1]?.['id'] as string ?? null
    if (cursor === null) break
  }
}

/**
 * deltaPullFromView — incremental pull from a server view keyed on updated_at.
 * Called after deltaPull('action_node') to refresh join cols on recently-changed rows.
 * Uses the same _meta cursor as the base table (same updated_at field).
 */
export async function deltaPullFromView(view: ActiveView): Promise<void> {
  const metaKey = 'last_pull_action_node'
  const since = await getMeta(metaKey) ?? '1970-01-01T00:00:00.000Z'

  let lastUpdatedAt = since

  for (;;) {
    const { data, error } = await supabase
      .from(view)
      .select('*')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .gt('updated_at' as any, lastUpdatedAt)
      .order('updated_at', { ascending: true })
      .limit(PAGE_SIZE)

    if (error) throw error

    const rows = (data ?? []) as Record<string, unknown>[]
    await applyRows('action_node', rows, 'view')

    if (rows.length === 0) break

    lastUpdatedAt = rows[rows.length - 1]?.['updated_at'] as string ?? lastUpdatedAt

    if (rows.length < PAGE_SIZE) break
  }
}

/** Maximum ids per chunked IN query to avoid SQLite/HTTP limits. */
const ACTIVE_JOIN_CHUNK = 50

/**
 * pullActiveJoinsFor — lightweight follow-up after a base-table delta batch.
 * For each id in the batch that might satisfy v_active_tasks, fetches the row
 * from the server view and updates join cols.  Fire-and-forget safe (called
 * from apply.ts without await).
 *
 * Batches ids in chunks of ACTIVE_JOIN_CHUNK to stay within URL length limits.
 */
export async function pullActiveJoinsFor(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  for (let i = 0; i < ids.length; i += ACTIVE_JOIN_CHUNK) {
    const chunk = ids.slice(i, i + ACTIVE_JOIN_CHUNK)

    // Fetch from both active views; rows that don't match a view simply return 0 results.
    const views: ActiveView[] = ['v_active_tasks', 'v_active_projects']
    for (const view of views) {
      const { data, error } = await supabase
        .from(view)
        .select('*')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .in('id' as any, chunk)

      if (error) {
        console.error('[pullActiveJoinsFor] failed for', view, error)
        continue
      }

      const rows = (data ?? []) as Record<string, unknown>[]
      if (rows.length > 0) {
        await applyRows('action_node', rows, 'view')
      }
    }
  }
}

// ── Public sync API ───────────────────────────────────────────────────────────

/**
 * initialSync() — run a full backfill for action_node and inbox, then overlay
 * join cols from the server active views.
 *
 * Order matters (T9.5):
 *   1. fullBackfill('action_node') — base rows land first (UPSERT targets exist)
 *   2. fullBackfillFromView('v_active_tasks') — join cols overlaid for active tasks
 *   3. fullBackfillFromView('v_active_projects') — join cols overlaid for active projects
 *   4. fullBackfill('inbox') — inbox rows
 *
 * Called when the local DB is empty (first run or Safari 7-day eviction).
 */
export async function initialSync(): Promise<void> {
  await fullBackfill('action_node')
  await fullBackfillFromView('v_active_tasks')
  await fullBackfillFromView('v_active_projects')
  await fullBackfill('inbox')

  const now = new Date().toISOString()
  await setMeta('last_pull_action_node', now)
  await setMeta('last_pull_inbox', now)
}

/**
 * syncAll() — delta pull for both tables + view join-col refreshes.
 * Called on reconnect and on visibility-regain ≥ 60 s (wired in PR-C).
 * Returns per-table metadata for diagnostics.
 */
export async function syncAll(): Promise<{ action_node: string; inbox: string }> {
  await deltaPull('action_node')
  await deltaPullFromView('v_active_tasks')
  await deltaPullFromView('v_active_projects')
  await deltaPull('inbox')
  return {
    action_node: (await getMeta('last_pull_action_node')) ?? '',
    inbox: (await getMeta('last_pull_inbox')) ?? '',
  }
}

// ── T8 race probe (for manual smoke-testing) ─────────────────────────────────

/**
 * __raceProbe(rowId) — documented per plan §0 T8 for manual smoke-testing.
 *
 * How to use (dev console):
 *   1. Go offline.
 *   2. Mutate the row (triggers outbox enqueue, sets _dirty=1).
 *   3. Call __raceProbe(id) — returns { local, outboxEntry }.
 *   4. Simulate an external write landing (e.g. via Supabase Studio).
 *   5. Go online — outbox replays.
 *   6. Call __raceProbe(id) again — verify _dirty=0 and updated_at matches server.
 *
 * Expected outcome: if the external write has a later updated_at the LWW upsert
 * during deltaPull will overwrite the local row; the outbox replay then lands
 * our value, which has an even later updated_at (since we set it optimistically
 * to now()), restoring our mutation as the winner.  If the external write wins
 * (later server timestamp), the echo from our replay will carry the server-echo
 * updated_at and the local row converges.  See plan §4.6.
 */
export async function __raceProbe(rowId: string): Promise<{
  actionNode: Record<string, unknown> | null
  outboxEntry: Record<string, unknown> | null
}> {
  const [anRows, outboxRows] = await Promise.all([
    query<Record<string, unknown>>(
      'SELECT id, updated_at, _dirty, _synced_at FROM action_node WHERE id = ?',
      binds([rowId]),
    ),
    query<Record<string, unknown>>(
      'SELECT * FROM _outbox WHERE row_id = ? ORDER BY created_at ASC LIMIT 1',
      binds([rowId]),
    ),
  ])
  return {
    actionNode: anRows[0] ?? null,
    outboxEntry: outboxRows[0] ?? null,
  }
}
