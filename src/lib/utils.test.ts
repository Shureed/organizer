/**
 * utils.test.ts
 *
 * Tests for the `cn` helper in src/lib/utils.ts.
 * `cn` is a thin wrapper: clsx (conditional class joining) + twMerge (Tailwind
 * conflict resolution). Tests confirm the wrapper behaves correctly for the
 * common cases used throughout the codebase.
 */

import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn (class name helper)', () => {
  it('joins multiple class strings', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles a single class string', () => {
    expect(cn('only')).toBe('only')
  })

  it('ignores undefined / null / false values', () => {
    expect(cn('a', undefined, null, false, 'b')).toBe('a b')
  })

  it('handles an empty call gracefully', () => {
    expect(cn()).toBe('')
  })

  it('merges conflicting Tailwind utilities — later value wins', () => {
    // tailwind-merge resolves p-2 vs p-4 to the last one.
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })

  it('handles conditional object syntax from clsx', () => {
    expect(cn({ 'text-red-500': true, 'text-blue-500': false })).toBe('text-red-500')
  })

  it('handles array inputs', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c')
  })
})

// DELIBERATE FAILURE — verification 1.5 of Phase 1 (task de428b85).
// This test asserts the opposite of cn's behavior to prove the CI unit job flips red.
// The PR opening this branch will be closed without merging.
import { describe as _d, it as _i, expect as _e } from 'vitest'
import { cn as _cn } from './utils'
_d('verification: deliberate failure', () => {
  _i('cn should fail — this is intentional', () => {
    _e(_cn('a', 'b')).toBe('NOPE')
  })
})
