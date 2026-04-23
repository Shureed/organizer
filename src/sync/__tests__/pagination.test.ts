/**
 * pagination.test.ts — PR-A regression shield for the sync pagination bugs.
 *
 * These tests are EXPECTED-FAILING against the current src/sync/pull.ts.
 * They are registered via Vitest's `it.fails(...)` so the red state is
 * tracked explicitly: the test file passes as long as the underlying
 * assertions actually fail, which proves the bug is still present.
 *
 * Context:
 *   - Bug id:       9a61d89c-1df5-4a42-95fe-0fba2f0dd0c0
 *   - Plan archive: archive/node/96370305-eee9-49c5-a2e7-1b34bd6ced64
 *                   (in the cortex-nodes repo)
 *
 * The four pagination paths drop rows under adversarial conditions:
 *   - fullBackfill / fullBackfillFromView order by (created_at, id) but
 *     keyset only on id. Random v4 UUIDs cause rows with id ≤ cursor but
 *     later created_at to be skipped.
 *   - deltaPull / deltaPullFromView filter .gt('updated_at', cursor) strictly,
 *     so tied updated_at rows straddling a page boundary are dropped.
 *
 * PR-B will unify all four on a compound (updated_at, id) cursor via
 *   .or('updated_at.gt.X,and(updated_at.eq.X,id.gt.Y)')
 * and flip these tests from `it.fails` to plain `it` — at which point they
 * MUST pass.
 */

// @vitest-environment happy-dom

import { describe, it, beforeEach, expect, vi } from 'vitest'
import { createFakeSupabase, type FakeSupabase } from './fixtures/fakeSupabase'

// ---------------------------------------------------------------------------
// Shared mock state — defined before the vi.mock factories so closures resolve
// ---------------------------------------------------------------------------

let fake: FakeSupabase = createFakeSupabase()
const mirror: Record<string, Map<string, Record<string, unknown>>> = {
  action_node: new Map(),
  inbox: new Map(),
}
const meta = new Map<string, string>()

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../lib/supabase', () => ({
  get supabase() { return fake },
}))

vi.mock('../client', () => ({
  mutate: async (sql: string, params?: unknown[]) => {
    const trimmed = sql.trim().toUpperCase()
    if (trimmed.startsWith('BEGIN') || trimmed.startsWith('COMMIT') || trimmed.startsWith('ROLLBACK')) {
      return
    }
    if (trimmed.startsWith('INSERT INTO ACTION_NODE')) {
      const p = (params ?? []) as unknown[]
      const id = p[0] as string
      mirror['action_node'].set(id, { id, user_id: p[1], name: p[2], updated_at: p[18] })
      return
    }
    if (trimmed.startsWith('INSERT INTO INBOX')) {
      const p = (params ?? []) as unknown[]
      const id = p[0] as string
      mirror['inbox'].set(id, { id, user_id: p[1], title: p[2], updated_at: p[11] })
      return
    }
    if (trimmed.startsWith('INSERT INTO _META')) {
      const p = (params ?? []) as unknown[]
      meta.set(p[0] as string, p[1] as string)
      return
    }
    // Ignore other mutations (comments eviction, outbox, etc.).
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

// Import pull AFTER mocks are registered.
const pull = await import('../pull')

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

const USER = 'user-test'

/**
 * Build an 8-row fixture with an adversarial tied-updated_at cluster and a
 * non-monotonic id order.
 *
 * With PAGE_SIZE=3 the pages are [0,1,2], [3,4,5], [6,7].
 *
 * Rows 3 and 4 share the same updated_at, straddling page boundaries 1→2 is
 * avoided (both on page 2), but rows 2 and 3 also share the same updated_at
 * across the page 1→2 boundary — a deltaPull keyed strictly on .gt drops
 * row 3 (or rows tied with row 2's updated_at on page 2).
 *
 * For the id-keyed backfill bug: rows are inserted in created_at order, but
 * row 2's id is deliberately larger than row 3's id. A keyset on .gt(id)
 * after page 1 (cursor = id of row 2) filters row 3 out forever.
 *
 * The created_at values are strictly increasing to keep the order stable.
 */
function buildAdversarialRows(): Record<string, unknown>[] {
  const t0 = '2026-01-01T00:00:00.000Z'
  const t1 = '2026-01-01T00:00:01.000Z'
  const t2 = '2026-01-01T00:00:02.000Z'  // rows 2 and 3 tie here
  const t3 = '2026-01-01T00:00:03.000Z'  // rows 4 and 5 tie here
  const t4 = '2026-01-01T00:00:04.000Z'
  const t5 = '2026-01-01T00:00:05.000Z'

  // Adversarial ids:
  //   - Rows 2 and 3 share updated_at=t2 and straddle a page boundary under
  //     PAGE_SIZE=3 (row 2 is last-of-page-1 by (updated_at, insertion-order)).
  //     deltaPull's strict `.gt('updated_at', cursor)` then drops row 3.
  //   - Row 7 has the LATEST created_at / updated_at in the fixture but a
  //     tiny id (00000000…). fullBackfill's keyset `.gt('id', cursor)` after
  //     page 1 (cursor = ids[3] = '33333…') filters row 7 out permanently,
  //     even though its created_at is later than the cursor row.
  //
  // Rows 4 and 5 also share updated_at=t3 — a second tied cluster that
  // survives only because it doesn't straddle a boundary.
  const ids = [
    '11111111-1111-4111-8111-111111111111', // 0
    '22222222-2222-4222-8222-222222222222', // 1
    'ffffffff-ffff-4fff-8fff-ffffffffffff', // 2  large id, tied with row 3
    '33333333-3333-4333-8333-333333333333', // 3  small id, tied with row 2
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', // 4
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', // 5
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', // 6
    '00000000-0000-4000-8000-000000000000', // 7  tiny id, latest timestamp
  ]

  const createdAt = [t0, t1, t2, t2, t3, t3, t4, t5]
  const updatedAt = [t0, t1, t2, t2, t3, t3, t4, t5]

  return ids.map((id, i) => ({
    id,
    user_id: USER,
    name: `row-${i}`,
    status: 'open',
    type: 'task',
    priority: null,
    parent_id: null,
    space_id: null,
    date: null,
    bucket: null,
    body: null,
    completed_at: null,
    archived: false,
    pinned: false,
    git_backed: false,
    git_pr_url: null,
    project_name: null,
    space_name: null,
    space_path: null,
    created_at: createdAt[i],
    updated_at: updatedAt[i],
  }))
}

function buildInboxRows(): Record<string, unknown>[] {
  // Reuse adversarial shape, map to inbox schema.
  return buildAdversarialRows().map((r, i) => ({
    id: r['id'],
    user_id: USER,
    title: `inbox-${i}`,
    body: null,
    source: 'chat',
    item_id: null,
    item_type: null,
    archived: false,
    read: false,
    pinned: false,
    created_at: r['created_at'],
    updated_at: r['updated_at'],
  }))
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  ;(globalThis as { __PULL_PAGE_SIZE?: number }).__PULL_PAGE_SIZE = 3
  fake = createFakeSupabase()
  mirror['action_node'].clear()
  mirror['inbox'].clear()
  meta.clear()
})

// ---------------------------------------------------------------------------
// Tests — each is expected to FAIL against current pull.ts (it.fails).
// PR-B will remove `.fails` and the assertions will pass.
// ---------------------------------------------------------------------------

describe('pagination regression shield (PR-B: compound (updated_at, id) cursor)', () => {
  it('fullBackfill(action_node) mirrors every row despite non-monotonic ids across pages', async () => {
    const rows = buildAdversarialRows()
    fake.seed('action_node', rows)

    await pull.fullBackfill('action_node')

    const expectedIds = new Set(rows.map((r) => r['id']))
    const mirroredIds = new Set(mirror['action_node'].keys())
    expect(mirror['action_node'].size).toBe(rows.length)
    expect(mirroredIds).toEqual(expectedIds)
  })

  it('deltaPull(inbox) mirrors every row despite tied updated_at across page boundary', async () => {
    const rows = buildInboxRows()
    fake.seed('inbox', rows)

    await pull.deltaPull('inbox')

    const expectedIds = new Set(rows.map((r) => r['id']))
    const mirroredIds = new Set(mirror['inbox'].keys())
    expect(mirror['inbox'].size).toBe(rows.length)
    expect(mirroredIds).toEqual(expectedIds)
  })

  it('fullBackfillFromView(v_active_tasks) mirrors every row despite non-monotonic ids', async () => {
    const rows = buildAdversarialRows()
    fake.seed('v_active_tasks', rows)

    await pull.fullBackfillFromView('v_active_tasks')

    const expectedIds = new Set(rows.map((r) => r['id']))
    const mirroredIds = new Set(mirror['action_node'].keys())
    expect(mirror['action_node'].size).toBe(rows.length)
    expect(mirroredIds).toEqual(expectedIds)
  })

  it('deltaPullFromView(v_active_tasks) mirrors every row despite tied updated_at across page boundary', async () => {
    const rows = buildAdversarialRows()
    fake.seed('v_active_tasks', rows)

    await pull.deltaPullFromView('v_active_tasks')

    const expectedIds = new Set(rows.map((r) => r['id']))
    const mirroredIds = new Set(mirror['action_node'].keys())
    expect(mirror['action_node'].size).toBe(rows.length)
    expect(mirroredIds).toEqual(expectedIds)
  })
})
