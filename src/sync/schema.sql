-- ============================================================================
-- Local SQLite schema — master-P6 PR-B (T5)
-- ============================================================================
-- This file is the human-readable reference for the full local schema.
-- The canonical schema is the aggregate of all applied migrations (see
-- src/sync/migrations/001_init.sql, which is the sole migration for P6).
--
-- Tables mirror only the columns actually SELECTed in useDataLoader.ts and
-- useMutations.ts.  Three sync-metadata columns are appended to every
-- mirrored table (see plan §4.3):
--   _synced_at INTEGER        Unix-ms timestamp of last server confirmation.
--   _dirty     INTEGER        1 = outbox entry pending; 0 = clean.
--   _deleted   INTEGER        Tombstone for locally-deleted rows (future use).
--
-- All CREATE TABLE / INDEX / VIEW statements live in 001_init.sql and are
-- run by the migration runner in db.worker.ts.  This file is kept in sync
-- for human readability only.
-- ============================================================================

-- ── _meta ──────────────────────────────────────────────────────────────────
-- Key-value store for sync cursors and lock primitives.
-- Keys used at runtime:
--   last_pull_action_node   ISO-8601 timestamp of last delta pull
--   last_pull_inbox         ISO-8601 timestamp of last delta pull
--   last_pull_comments_<id> ISO-8601 timestamp per entity_id (comments)
--   replay_lock             ISO-8601 timestamp of in-progress replay (mutex)
CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ── action_node ────────────────────────────────────────────────────────────
-- Mirrors public.action_node.  Columns match the full row shape returned by
-- useDataLoader SELECT *.  Postgres enums stored as TEXT.
-- updated_at is trigger-maintained server-side; drives LWW conflict policy.
CREATE TABLE IF NOT EXISTS action_node (
  id               TEXT PRIMARY KEY,
  user_id          TEXT,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',
  type             TEXT NOT NULL DEFAULT 'task',
  priority         TEXT,
  parent_id        TEXT,
  space_id         TEXT,
  date             TEXT,
  bucket           TEXT,
  body             TEXT,
  completed_at     TEXT,
  archived         INTEGER NOT NULL DEFAULT 0,
  pinned           INTEGER NOT NULL DEFAULT 0,
  git_backed       INTEGER NOT NULL DEFAULT 0,
  git_pr_url       TEXT,
  -- denormalised join cols (populated by view-pull in pull.ts; NULL for base-table-only rows)
  project_name     TEXT,
  space_name       TEXT,
  space_path       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  -- sync metadata (plan §4.3)
  _synced_at       INTEGER,
  _dirty           INTEGER NOT NULL DEFAULT 0,
  _deleted         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_an_updated_at  ON action_node(updated_at);
CREATE INDEX IF NOT EXISTS idx_an_parent      ON action_node(parent_id);
CREATE INDEX IF NOT EXISTS idx_an_status      ON action_node(status, archived);
CREATE INDEX IF NOT EXISTS idx_an_type        ON action_node(type, archived);
-- Partial index for outbox dirty-scan (SQLite supports WHERE clauses on indexes)
CREATE INDEX IF NOT EXISTS idx_an_dirty       ON action_node(_dirty) WHERE _dirty = 1;

-- ── inbox ──────────────────────────────────────────────────────────────────
-- Mirrors public.inbox.  updated_at added via migration add_updated_at_to_inbox
-- (already landed server-side).  LWW policy identical to action_node.
CREATE TABLE IF NOT EXISTS inbox (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  title      TEXT NOT NULL,
  body       TEXT,
  source     TEXT NOT NULL DEFAULT 'chat',
  item_id    TEXT,
  item_type  TEXT,
  archived   INTEGER NOT NULL DEFAULT 0,
  read       INTEGER NOT NULL DEFAULT 0,
  pinned     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- sync metadata
  _synced_at INTEGER,
  _dirty     INTEGER NOT NULL DEFAULT 0,
  _deleted   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_in_updated_at  ON inbox(updated_at);
CREATE INDEX IF NOT EXISTS idx_in_created     ON inbox(created_at DESC, archived);
CREATE INDEX IF NOT EXISTS idx_in_dirty       ON inbox(_dirty) WHERE _dirty = 1;

-- ── comments ───────────────────────────────────────────────────────────────
-- Append-only.  No updates; no deletes.  No conflict path (plan §1.4 #4).
-- parent_comment_id is stored for completeness but not used by current UI.
CREATE TABLE IF NOT EXISTS comments (
  id                TEXT PRIMARY KEY,
  user_id           TEXT,
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  body              TEXT NOT NULL,
  actor             TEXT NOT NULL,
  parent_comment_id TEXT,
  created_at        TEXT NOT NULL,
  -- sync metadata (no _deleted; append-only)
  _synced_at        INTEGER,
  _dirty            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_c_entity ON comments(entity_type, entity_id);

-- ── _outbox ────────────────────────────────────────────────────────────────
-- Durable write queue (plan §4.7, T7).
-- op:     'insert' | 'update' | 'delete'
-- status: 'pending' | 'replaying' | 'blocked' | 'done'
--
-- 'replaying' is a transient in-flight marker reset to 'pending' on boot
-- so that a hard-kill mid-replay does not permanently strand an entry.
-- 'blocked' means a permanent 4xx prevented replay; user must discard (T14).
-- 'done' entries are deleted immediately after successful replay.
CREATE TABLE IF NOT EXISTS _outbox (
  id          TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  table_name  TEXT NOT NULL CHECK(table_name IN ('action_node', 'inbox', 'comments')),
  op          TEXT NOT NULL CHECK(op IN ('insert', 'update', 'delete')),
  row_id      TEXT NOT NULL,
  payload     TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'pending'
                CHECK(status IN ('pending', 'replaying', 'blocked', 'done')),
  last_error  TEXT
);

CREATE INDEX IF NOT EXISTS idx_outbox_pending ON _outbox(status, created_at)
  WHERE status IN ('pending', 'replaying');

-- ── Local views (mirrors of Supabase server views) ─────────────────────────
-- Each view is annotated with the original Postgres definition from
-- pg_get_viewdef() for drift detection (plan §4.4, risk §8(e)).
--
-- NOTE on v_chain_status / chain_nodes:
--   Server returns TEXT[] (Postgres array_agg).  SQLite json_group_array()
--   returns a JSON array string.  src/sync/queries.ts (PR-C) parses it with
--   JSON.parse() before dispatching to the Zustand store.
--
-- NOTE on v_active_projects / open_task_count:
--   Server view includes a correlated sub-query for open_task_count (count of
--   non-archived, non-done/cancelled child tasks).  Replicated as a scalar
--   sub-query here — semantics are identical.
--
-- NOTE on joins to spaces / v_space_tree:
--   Server views LEFT JOIN spaces and v_space_tree to populate space_name and
--   space_path.  In the local DB we store space_name and space_path directly
--   on action_node rows (denormalised by the pull engine when upserted from
--   the server view payload — see pull.ts T6).  Local views therefore read
--   those columns directly without a join.

-- v_active_tasks
-- Server (Postgres):
--   SELECT t.id, t.user_id, t.name, t.status, t.type, t.priority,
--          t.parent_id, t.space_id, t.date, t.bucket, t.body, t.completed_at,
--          t.archived, t.created_at, t.updated_at,
--          p.name AS project_name, s.name AS space_name, vst.path AS space_path,
--          t.pinned, t.git_pr_url, t.git_backed
--   FROM action_node t
--   LEFT JOIN action_node p ON t.parent_id = p.id AND p.type = 'project'
--   LEFT JOIN spaces s ON t.space_id = s.id
--   LEFT JOIN v_space_tree vst ON t.space_id = vst.id
--   WHERE NOT t.archived
--     AND t.status NOT IN ('done','cancelled')
--     AND t.type <> 'project';
CREATE VIEW IF NOT EXISTS v_active_tasks AS
  SELECT
    id, user_id, name, status, type, priority, parent_id, space_id,
    date, bucket, body, completed_at, archived, created_at, updated_at,
    project_name, space_name, space_path, pinned, git_pr_url, git_backed
  FROM action_node
  WHERE archived = 0
    AND status NOT IN ('done', 'cancelled')
    AND type != 'project'
    AND _deleted = 0;

-- v_active_projects
-- Server (Postgres):
--   SELECT p.id, p.user_id, p.name, p.status, p.space_id, p.body,
--          p.archived, p.created_at, p.updated_at,
--          s.name AS space_name, vst.path AS space_path,
--          (SELECT count(*) FROM action_node t
--           WHERE t.parent_id = p.id AND NOT t.archived
--             AND t.status NOT IN ('done','cancelled') AND t.type <> 'project')
--            AS open_task_count
--   FROM action_node p
--   LEFT JOIN spaces s ON p.space_id = s.id
--   LEFT JOIN v_space_tree vst ON p.space_id = vst.id
--   WHERE NOT p.archived
--     AND p.status NOT IN ('done','cancelled')
--     AND p.type = 'project';
CREATE VIEW IF NOT EXISTS v_active_projects AS
  SELECT
    id, user_id, name, status, space_id, body, archived, created_at, updated_at,
    space_name, space_path,
    (SELECT COUNT(*)
       FROM action_node t
      WHERE t.parent_id = p.id
        AND t.archived = 0
        AND t.status NOT IN ('done', 'cancelled')
        AND t.type != 'project'
        AND t._deleted = 0
    ) AS open_task_count
  FROM action_node p
  WHERE p.archived = 0
    AND p.status NOT IN ('done', 'cancelled')
    AND p.type = 'project'
    AND p._deleted = 0;

-- v_new_inbox
-- Server (Postgres):
--   SELECT id, user_id, title, body, source, item_id, item_type,
--          archived, created_at, read, pinned
--   FROM inbox
--   WHERE NOT archived
--   ORDER BY pinned DESC, created_at DESC;
CREATE VIEW IF NOT EXISTS v_new_inbox AS
  SELECT
    id, user_id, title, body, source, item_id, item_type,
    archived, created_at, updated_at, read, pinned
  FROM inbox
  WHERE archived = 0
    AND _deleted = 0
  ORDER BY pinned DESC, created_at DESC;

