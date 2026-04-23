-- ============================================================================
-- Migration 001 — Initial local schema (master-P6 PR-B T5)
-- ============================================================================
-- Applied by the migration runner in db.worker.ts on first boot.
-- Safe to re-apply — all statements use IF NOT EXISTS.
-- See src/sync/schema.sql for the full annotated reference.
-- ============================================================================

-- ── _meta ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS _meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ── action_node ────────────────────────────────────────────────────────────
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
  -- Denormalised join columns: pulled from server view payload (plan §4.4).
  -- Populated by pull.ts when upserting rows from v_active_tasks /
  -- v_active_projects server payloads.
  project_name     TEXT,
  space_name       TEXT,
  space_path       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  _synced_at       INTEGER,
  _dirty           INTEGER NOT NULL DEFAULT 0,
  _deleted         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_an_updated_at ON action_node(updated_at);
CREATE INDEX IF NOT EXISTS idx_an_parent     ON action_node(parent_id);
CREATE INDEX IF NOT EXISTS idx_an_status     ON action_node(status, archived);
CREATE INDEX IF NOT EXISTS idx_an_type       ON action_node(type, archived);
CREATE INDEX IF NOT EXISTS idx_an_dirty      ON action_node(_dirty) WHERE _dirty = 1;

-- ── inbox ──────────────────────────────────────────────────────────────────
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
  _synced_at INTEGER,
  _dirty     INTEGER NOT NULL DEFAULT 0,
  _deleted   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_in_updated_at ON inbox(updated_at);
CREATE INDEX IF NOT EXISTS idx_in_created    ON inbox(created_at DESC, archived);
CREATE INDEX IF NOT EXISTS idx_in_dirty      ON inbox(_dirty) WHERE _dirty = 1;

-- ── comments ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS comments (
  id                TEXT PRIMARY KEY,
  user_id           TEXT,
  entity_type       TEXT NOT NULL,
  entity_id         TEXT NOT NULL,
  body              TEXT NOT NULL,
  actor             TEXT NOT NULL,
  parent_comment_id TEXT,
  created_at        TEXT NOT NULL,
  _synced_at        INTEGER,
  _dirty            INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_c_entity ON comments(entity_type, entity_id);

-- ── _outbox ────────────────────────────────────────────────────────────────
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

-- ── Views ───────────────────────────────────────────────────────────────────

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

CREATE VIEW IF NOT EXISTS v_active_projects AS
  SELECT
    p.id, p.user_id, p.name, p.status, p.space_id, p.body,
    p.archived, p.created_at, p.updated_at,
    p.space_name, p.space_path,
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

CREATE VIEW IF NOT EXISTS v_new_inbox AS
  SELECT
    id, user_id, title, body, source, item_id, item_type,
    archived, created_at, updated_at, read, pinned
  FROM inbox
  WHERE archived = 0
    AND _deleted = 0
  ORDER BY pinned DESC, created_at DESC;

-- ── Boot-time cleanup ───────────────────────────────────────────────────────
-- Reset any rows stuck in 'replaying' state from a previous hard-kill.
-- This runs as part of the migration (safe: no rows exist on first run;
-- idempotent on subsequent runs).
UPDATE _outbox SET status = 'pending' WHERE status = 'replaying';
