/**
 * cursor.ts — compound (updated_at, id) keyset cursor helper for sync pull.
 *
 * Bug id:       9a61d89c-1df5-4a42-95fe-0fba2f0dd0c0
 * Plan archive: archive/node/96370305-eee9-49c5-a2e7-1b34bd6ced64
 *
 * The four pull paths in src/sync/pull.ts (fullBackfill, fullBackfillFromView,
 * deltaPull, deltaPullFromView) all need keyset pagination that is stable
 * across page boundaries when rows share either updated_at (ties) or when ids
 * are non-monotonic relative to the order-by column (random UUIDs).
 *
 * The fix is a compound cursor: strictly greater by updated_at, OR equal
 * updated_at AND strictly greater id.  Expressed via PostgREST .or() as:
 *
 *   updated_at.gt.<updated_at>,and(updated_at.eq.<updated_at>,id.gt.<id>)
 *
 * ORDER BY must always be (updated_at ASC, id ASC) — the pagination contract
 * this cursor implements.
 */

export type CompoundCursor = { updated_at: string; id: string } | null

/**
 * Apply a compound keyset cursor to a PostgREST builder.
 * When cursor is null, the builder is returned unchanged (first page).
 */
export function compoundCursorFilter<B>(builder: B, cursor: CompoundCursor): B {
  if (cursor === null) return builder
  const expr =
    `updated_at.gt.${cursor.updated_at},` +
    `and(updated_at.eq.${cursor.updated_at},id.gt.${cursor.id})`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (builder as any).or(expr) as B
}

/**
 * Zero-UUID sentinel used when migrating a legacy bare-ISO `_meta.last_pull_*`
 * cursor into the compound format.  Pairing the legacy updated_at with the
 * zero UUID means the next delta pull re-admits any ties at that timestamp
 * (since every real UUID compares strictly greater), guaranteeing no rows
 * are silently dropped across the format switch.
 */
export const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

/**
 * Serialize a compound cursor as a single `_meta` string: `<iso>|<uuid>`.
 */
export function serializeCompoundCursor(c: { updated_at: string; id: string }): string {
  return `${c.updated_at}|${c.id}`
}

/**
 * Parse a `_meta.last_pull_*` value into a compound cursor.
 *
 * Supports two formats:
 *   - New:    `<iso>|<uuid>`
 *   - Legacy: bare `<iso>` (pre-PR-B) — paired with ZERO_UUID so the first
 *             post-upgrade delta pull does not drop rows tied at that ts.
 *
 * null input (no meta row yet) returns a cold-start cursor at the epoch.
 */
export function parseCompoundCursor(value: string | null): { updated_at: string; id: string } {
  if (value === null) {
    return { updated_at: '1970-01-01T00:00:00.000Z', id: ZERO_UUID }
  }
  const pipe = value.indexOf('|')
  if (pipe < 0) {
    // Legacy bare-ISO: pair with zero UUID to re-admit ties at that timestamp.
    return { updated_at: value, id: ZERO_UUID }
  }
  return {
    updated_at: value.slice(0, pipe),
    id: value.slice(pipe + 1),
  }
}
