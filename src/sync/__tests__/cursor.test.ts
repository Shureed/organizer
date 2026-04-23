/**
 * cursor.test.ts — unit tests for the compound (updated_at, id) cursor helper.
 *
 * Covers:
 *   - compoundCursorFilter: null → builder unchanged; non-null → .or invoked
 *     with the exact expected expression.
 *   - serializeCompoundCursor / parseCompoundCursor round-trip.
 *   - Legacy bare-ISO fallback (pre-PR-B _meta format) pairs with zero UUID.
 */

import { describe, it, expect, vi } from 'vitest'
import {
  compoundCursorFilter,
  serializeCompoundCursor,
  parseCompoundCursor,
  ZERO_UUID,
} from '../cursor'

describe('compoundCursorFilter', () => {
  it('returns the builder unchanged when cursor is null', () => {
    const builder = { or: vi.fn() }
    const out = compoundCursorFilter(builder, null)
    expect(out).toBe(builder)
    expect(builder.or).not.toHaveBeenCalled()
  })

  it('invokes .or with the exact compound expression when cursor is non-null', () => {
    const builder = { or: vi.fn(() => builder) }
    const cursor = {
      updated_at: '2026-01-01T00:00:02.000Z',
      id: '33333333-3333-4333-8333-333333333333',
    }
    const out = compoundCursorFilter(builder, cursor)
    expect(out).toBe(builder)
    expect(builder.or).toHaveBeenCalledTimes(1)
    expect(builder.or).toHaveBeenCalledWith(
      'updated_at.gt.2026-01-01T00:00:02.000Z,' +
        'and(updated_at.eq.2026-01-01T00:00:02.000Z,id.gt.33333333-3333-4333-8333-333333333333)',
    )
  })
})

describe('serializeCompoundCursor / parseCompoundCursor', () => {
  it('round-trips a compound cursor through pipe-delimited form', () => {
    const c = {
      updated_at: '2026-01-01T00:00:02.000Z',
      id: '33333333-3333-4333-8333-333333333333',
    }
    expect(parseCompoundCursor(serializeCompoundCursor(c))).toEqual(c)
  })

  it('parses a legacy bare-ISO cursor and pairs it with ZERO_UUID', () => {
    const parsed = parseCompoundCursor('2026-01-01T00:00:02.000Z')
    expect(parsed).toEqual({
      updated_at: '2026-01-01T00:00:02.000Z',
      id: ZERO_UUID,
    })
  })

  it('returns a cold-start cursor at the epoch when input is null', () => {
    const parsed = parseCompoundCursor(null)
    expect(parsed).toEqual({
      updated_at: '1970-01-01T00:00:00.000Z',
      id: ZERO_UUID,
    })
  })
})
