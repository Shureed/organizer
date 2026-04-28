/**
 * applyrows-mutex.test.ts — Regression for the BEGIN/BEGIN race in pull.ts
 *
 * Pre-fix, two concurrent callers of the applyRows path (e.g. App.tsx
 * bootstrap's syncAll racing useRealtime.onRejoin's syncAll) could each call
 * `mutate('BEGIN')` before either committed, producing
 *   SQLite3Error: cannot start a transaction within a transaction
 * because Comlink round-trips serialise individual mutate calls but don't
 * bound the transaction window.
 *
 * The mutex chains each applyRows invocation onto the previous one's
 * settlement (success or failure), so the worker only ever sees one open
 * transaction at a time. This test fires two concurrent upsertFromServer
 * calls (which go through applyRows) and asserts the mocked mutate sequence
 * never has two BEGINs without a COMMIT/ROLLBACK between them.
 */

// @vitest-environment happy-dom

import { describe, it, beforeEach, expect, vi } from 'vitest'

// Mock the Comlink-bridged mutate to a tracker that records call order.
const mutateCalls: string[] = []
const mutateMock = vi.fn(async (sql: string) => {
  mutateCalls.push(sql.trim().split(/\s+/)[0]!.toUpperCase())
  // Yield to the event loop so concurrent callers race realistically.
  await new Promise((r) => setTimeout(r, 0))
})

vi.mock('../client', () => ({
  mutate: (sql: string, params?: unknown) => mutateMock(sql, params),
  query: vi.fn(async () => []),
  checkQuotaAndEvict: vi.fn(async () => {}),
  registerQuotaCheck: vi.fn(),
}))

// Import AFTER the mock so pull.ts picks up the mocked client.
import { upsertFromServer } from '../pull'

describe('applyRows mutex', () => {
  beforeEach(() => {
    mutateCalls.length = 0
    mutateMock.mockClear()
  })

  it('serialises two concurrent applyRows calls so BEGINs do not nest', async () => {
    const row1 = makeRow('00000000-0000-0000-0000-000000000001')
    const row2 = makeRow('00000000-0000-0000-0000-000000000002')

    // Fire concurrently — pre-fix this would interleave both BEGINs at the
    // mocked mutate before either COMMIT was issued.
    await Promise.all([
      upsertFromServer('action_node', row1),
      upsertFromServer('action_node', row2),
    ])

    // Reduce to just transaction-control verbs to keep the assertion tight.
    const txnVerbs = mutateCalls.filter((v) => v === 'BEGIN' || v === 'COMMIT' || v === 'ROLLBACK')

    // Expected: BEGIN, COMMIT, BEGIN, COMMIT (in that order).
    expect(txnVerbs).toEqual(['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT'])
  })

  it('serialises across success/failure — second caller proceeds even if first throws', async () => {
    // Make the second mutate call (the per-row INSERT) reject for the first
    // applyRows; the second applyRows should still run cleanly.
    let callCount = 0
    mutateMock.mockImplementation(async (sql: string) => {
      mutateCalls.push(sql.trim().split(/\s+/)[0]!.toUpperCase())
      callCount++
      // Throw on the first INSERT (after the first BEGIN). This forces a
      // ROLLBACK in applyRows and rejects the first call.
      if (callCount === 2) throw new Error('synthetic per-row failure')
      await new Promise((r) => setTimeout(r, 0))
    })

    const row1 = makeRow('00000000-0000-0000-0000-000000000003')
    const row2 = makeRow('00000000-0000-0000-0000-000000000004')

    const [r1, r2] = await Promise.allSettled([
      upsertFromServer('action_node', row1),
      upsertFromServer('action_node', row2),
    ])

    expect(r1.status).toBe('rejected')
    expect(r2.status).toBe('fulfilled')

    const txnVerbs = mutateCalls.filter((v) => v === 'BEGIN' || v === 'COMMIT' || v === 'ROLLBACK')
    // First call: BEGIN, ROLLBACK (per-row failure). Second call: BEGIN, COMMIT.
    expect(txnVerbs).toEqual(['BEGIN', 'ROLLBACK', 'BEGIN', 'COMMIT'])
  })
})

// Helper — minimal action_node row shape that pull.ts's binders accept.
function makeRow(id: string): Record<string, unknown> {
  return {
    id,
    user_id: 'u1',
    name: 'test',
    status: 'open',
    type: 'task',
    priority: null,
    parent_id: null,
    space_id: null,
    date: null,
    bucket: 'needs_doing',
    body: null,
    completed_at: null,
    archived: false,
    pinned: false,
    git_backed: false,
    git_pr_url: null,
    project_name: null,
    space_name: null,
    space_path: null,
    created_at: '2026-04-28T00:00:00Z',
    updated_at: '2026-04-28T00:00:00Z',
    _deleted: false,
  }
}
