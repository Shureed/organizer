-- ============================================================================
-- Migration 003 — Drop chain_origin_id column and v_chain_status view
--                 (Cortex simplify Phase 4)
-- ============================================================================
-- chain_origin_id was the pre-Phase-1 chain mechanism, replaced by the
-- branched_from + phase columns on the server schema.  This migration cleans
-- up the local SQLite mirror to match.
--
-- SQLite does not support DROP COLUMN directly on older versions, so we
-- recreate the table without the column using the standard rename+recreate
-- pattern.  All existing data is preserved.
-- ============================================================================

-- Drop the derived view first (references chain_origin_id).
DROP VIEW IF EXISTS v_chain_status;

-- Drop the index on the removed column.
DROP INDEX IF EXISTS idx_an_chain;

-- Recreate action_node without chain_origin_id.
-- Step 1: rename the old table.
ALTER TABLE action_node RENAME TO action_node_old;

-- Step 2: create the new table without chain_origin_id.
CREATE TABLE action_node (
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
  project_name     TEXT,
  space_name       TEXT,
  space_path       TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  _synced_at       INTEGER,
  _dirty           INTEGER NOT NULL DEFAULT 0,
  _deleted         INTEGER NOT NULL DEFAULT 0
);

-- Step 3: copy data (chain_origin_id is simply omitted).
INSERT INTO action_node
  SELECT
    id, user_id, name, status, type, priority, parent_id, space_id,
    date, bucket, body, completed_at, archived, pinned,
    git_backed, git_pr_url,
    project_name, space_name, space_path,
    created_at, updated_at, _synced_at, _dirty, _deleted
  FROM action_node_old;

-- Step 4: drop the old table.
DROP TABLE action_node_old;

-- Step 5: recreate indexes.
CREATE INDEX IF NOT EXISTS idx_an_updated_at ON action_node(updated_at);
CREATE INDEX IF NOT EXISTS idx_an_parent     ON action_node(parent_id);
CREATE INDEX IF NOT EXISTS idx_an_status     ON action_node(status, archived);
CREATE INDEX IF NOT EXISTS idx_an_type       ON action_node(type, archived);
CREATE INDEX IF NOT EXISTS idx_an_dirty      ON action_node(_dirty) WHERE _dirty = 1;
