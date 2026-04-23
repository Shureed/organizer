/**
 * schema-version.test.ts — tests for the PR-B T7 client repair path.
 *
 * Covers:
 *   - Fresh DB (no sync_schema_version, no action_node rows): repair fires,
 *     initialSync runs, sync_schema_version stamped to SYNC_SCHEMA_VERSION.
 *   - Upgrade path (sync_schema_version missing, but stale last_pull_* cursors
 *     present): repair wipes last_pull_*, runs initialSync, stamps version.
 *   - Subsequent load (version already at current): repair is a no-op and
 *     initialSync is NOT called again.
 */

// @vitest-environment happy-dom

import { describe, it, beforeEach, expect, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from './fixtures/fakeSupabase'

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let fake: FakeSupabase = createFakeSupabase()
const meta = new Map<string, string>()
const executedMutations: string[] = []

vi.mock('../../lib/supabase', () => ({
  get supabase() { return fake },
}))

vi.mock('../client', () => ({
  mutate: async (sql: string, params?: unknown[]) => {
    const trimmed = sql.trim().toUpperCase()
    executedMutations.push(trimmed.slice(0, 60))
    if (trimmed.startsWith('BEGIN') || trimmed.startsWith('COMMIT') || trimmed.startsWith('ROLLBACK')) {
      return
    }
    if (trimmed.startsWith('INSERT INTO _META')) {
      const p = (params ?? []) as unknown[]
      meta.set(p[0] as string, p[1] as string)
      return
    }
    if (trimmed.startsWith("DELETE FROM _META WHERE KEY LIKE 'LAST_PULL_%'")) {
      for (const k of Array.from(meta.keys())) {
        if (k.startsWith('last_pull_')) meta.delete(k)
      }
      return
    }
    // Ignore upserts into action_node / inbox — not under test here.
  },
  query: async (sql: string, params?: unknown[]) => {
    const trimmed = sql.trim().toUpperCase()
    if (trimmed.startsWith('SELECT VALUE FROM _META')) {
      const p = (params ?? []) as unknown[]
      const v = meta.get(p[0] as string)
      return v !== undefined ? [{ value: v }] : []
    }
    return []
  },
  checkQuotaAndEvict: async () => {},
  registerQuotaCheck: () => {},
  isSqliteAvailable: async () => true,
  ready: async () => true,
  destroy: async () => {},
}))

const pull = await import('../pull')

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  fake = createFakeSupabase()
  meta.clear()
  executedMutations.length = 0
})

describe('maybeRunSchemaRepair', () => {
  it('fires on a fresh DB (no version) and stamps sync_schema_version', async () => {
    // Fresh DB: no last_pull_*, no sync_schema_version.
    const fired = await pull.maybeRunSchemaRepair()

    expect(fired).toBe(true)
    expect(meta.get('sync_schema_version')).toBe(String(pull.SYNC_SCHEMA_VERSION))
  })

  it('wipes stale last_pull_* cursors on the upgrade path', async () => {
    // Simulate a pre-PR-B client: legacy bare-ISO cursors present, no version.
    meta.set('last_pull_action_node', '2026-01-01T00:00:00.000Z')
    meta.set('last_pull_inbox', '2026-01-01T00:00:00.000Z')

    const fired = await pull.maybeRunSchemaRepair()

    expect(fired).toBe(true)
    // After repair, initialSync stamps the cursors afresh in the compound form.
    const stamped = meta.get('last_pull_action_node')
    expect(stamped).toBeDefined()
    expect(stamped).toContain('|')
    expect(meta.get('sync_schema_version')).toBe(String(pull.SYNC_SCHEMA_VERSION))
    // Confirm the DELETE _meta statement was issued.
    expect(
      executedMutations.some((s) => s.startsWith("DELETE FROM _META WHERE KEY LIKE 'LAST_PULL_%'")),
    ).toBe(true)
  })

  it('skips the repair when sync_schema_version is already current', async () => {
    meta.set('sync_schema_version', String(pull.SYNC_SCHEMA_VERSION))
    meta.set('last_pull_action_node', '2026-01-01T00:00:00.000Z|00000000-0000-0000-0000-000000000000')

    const fired = await pull.maybeRunSchemaRepair()

    expect(fired).toBe(false)
    // last_pull_action_node must NOT have been wiped.
    expect(meta.get('last_pull_action_node')).toBe(
      '2026-01-01T00:00:00.000Z|00000000-0000-0000-0000-000000000000',
    )
    // Version unchanged.
    expect(meta.get('sync_schema_version')).toBe(String(pull.SYNC_SCHEMA_VERSION))
  })
})
