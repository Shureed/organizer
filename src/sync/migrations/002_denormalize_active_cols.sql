-- ============================================================================
-- Migration 002 — Denormalize active join columns onto action_node (PR-C fix)
-- ============================================================================
-- The original PR-C (attempt #33, reverted via #35) had a bug: the local
-- v_active_tasks view referenced project_name / space_name / space_path
-- but action_node (migration 001) did not include those columns.
-- They exist only on the *server* view (joined from spaces + v_space_tree).
--
-- Fix: add the three columns to the local action_node table.  The pull engine
-- populates them when fetching from the server views v_active_tasks /
-- v_active_projects.  Rows pulled from the base action_node table leave them
-- NULL — that is fine because only rows satisfying the v_active_tasks WHERE
-- clause need them, and those rows will have been populated by a view-pull.
--
-- COALESCE semantics in the base-table upsert (pull.ts) ensure a base-table
-- pull never clobbers join cols already set by a prior view-pull.
-- ============================================================================

ALTER TABLE action_node ADD COLUMN project_name TEXT;
ALTER TABLE action_node ADD COLUMN space_name   TEXT;
ALTER TABLE action_node ADD COLUMN space_path   TEXT;
