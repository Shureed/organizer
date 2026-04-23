/**
 * fakeSupabase.ts — In-memory fake of the @supabase/supabase-js query builder,
 * scoped to the exact surface that src/sync/pull.ts uses.
 *
 * Supported chain:
 *   .from(table)
 *     .select(cols)
 *     .order(col, { ascending })     // chainable; compound order supported
 *     .or(expr)                      // single PostgREST `.or(...)` expression
 *     .gt(col, value)
 *     .eq(col, value)
 *     .in(col, values)
 *     .limit(n)
 *   => await resolves to { data, error }
 *
 * `.or(...)` parses a restricted PostgREST grammar sufficient for the
 * compound (updated_at, id) cursor that PR-B will introduce:
 *
 *   updated_at.gt.<value>,and(updated_at.eq.<value>,id.gt.<value>)
 *
 * Current pull.ts does NOT call .or(), but this harness supports it so the
 * same fake can be reused by PR-B without changes.
 *
 * Only enough is implemented to answer the exact questions pull.ts asks.
 * It is NOT a general PostgREST emulator.
 */

type Row = Record<string, unknown>

type OrderSpec = { col: string; ascending: boolean }

interface Predicate {
  test: (row: Row) => boolean
}

export interface FakeSupabase {
  from: (table: string) => Builder
  /** Replace the entire backing store for a table. */
  seed: (table: string, rows: Row[]) => void
  /** Read the raw (unfiltered) contents of a backing table. */
  dump: (table: string) => Row[]
  /** Test-only: number of `.from(...)` calls observed (for debugging flake). */
  fromCallCount: () => number
}

interface Builder extends PromiseLike<{ data: Row[] | null; error: Error | null }> {
  select: (cols?: string) => Builder
  order: (col: string, opts?: { ascending?: boolean }) => Builder
  or: (expr: string) => Builder
  gt: (col: string, value: unknown) => Builder
  eq: (col: string, value: unknown) => Builder
  in: (col: string, values: unknown[]) => Builder
  limit: (n: number) => Builder
}

function cmp(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const as = String(a)
  const bs = String(b)
  return as < bs ? -1 : as > bs ? 1 : 0
}

/**
 * Parse a single PostgREST .or() expression into a disjunction of predicates.
 * Grammar supported (only what pull.ts / PR-B needs):
 *
 *   or_expr     := or_term ( "," or_term )*
 *   or_term     := leaf | "and(" and_expr ")"
 *   and_expr    := leaf ( "," leaf )*
 *   leaf        := <col> "." <op> "." <value>
 *   op          := "gt" | "eq"
 *
 * The top-level expression is a disjunction of terms; and(...) groups a
 * conjunction of leaves.
 */
function parseOrExpression(expr: string): Predicate {
  // Split on top-level commas (respecting parens).
  const terms: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (ch === '(') depth++
    else if (ch === ')') depth--
    else if (ch === ',' && depth === 0) {
      terms.push(expr.slice(start, i))
      start = i + 1
    }
  }
  terms.push(expr.slice(start))

  const termPreds: Predicate[] = terms.map((t) => parseTerm(t.trim()))

  return {
    test: (row) => termPreds.some((p) => p.test(row)),
  }
}

function parseTerm(term: string): Predicate {
  if (term.startsWith('and(') && term.endsWith(')')) {
    const inner = term.slice(4, -1)
    // Split inner on top-level commas
    const parts: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i]
      if (ch === '(') depth++
      else if (ch === ')') depth--
      else if (ch === ',' && depth === 0) {
        parts.push(inner.slice(start, i))
        start = i + 1
      }
    }
    parts.push(inner.slice(start))
    const leafPreds = parts.map((p) => parseLeaf(p.trim()))
    return { test: (row) => leafPreds.every((p) => p.test(row)) }
  }
  return parseLeaf(term)
}

function parseLeaf(leaf: string): Predicate {
  // col.op.value — but value may itself contain dots (e.g. ISO timestamps).
  // Split on first two dots.
  const firstDot = leaf.indexOf('.')
  const secondDot = leaf.indexOf('.', firstDot + 1)
  if (firstDot < 0 || secondDot < 0) {
    throw new Error(`fakeSupabase: cannot parse .or leaf "${leaf}"`)
  }
  const col = leaf.slice(0, firstDot)
  const op = leaf.slice(firstDot + 1, secondDot)
  const value = leaf.slice(secondDot + 1)

  if (op === 'gt') {
    return { test: (row) => cmp(row[col], value) > 0 }
  }
  if (op === 'eq') {
    return { test: (row) => String(row[col]) === value }
  }
  throw new Error(`fakeSupabase: unsupported .or op "${op}"`)
}

export function createFakeSupabase(initial?: Record<string, Row[]>): FakeSupabase {
  const store: Record<string, Row[]> = {}
  if (initial) {
    for (const [k, v] of Object.entries(initial)) store[k] = v.map((r) => ({ ...r }))
  }

  let fromCount = 0

  function makeBuilder(table: string): Builder {
    const predicates: Predicate[] = []
    const orders: OrderSpec[] = []
    let limit: number | null = null

    const exec = (): { data: Row[] | null; error: Error | null } => {
      const rows = (store[table] ?? []).map((r) => ({ ...r }))
      let filtered = rows.filter((row) => predicates.every((p) => p.test(row)))

      if (orders.length > 0) {
        filtered.sort((a, b) => {
          for (const o of orders) {
            const c = cmp(a[o.col], b[o.col])
            if (c !== 0) return o.ascending ? c : -c
          }
          return 0
        })
      }

      if (limit !== null) filtered = filtered.slice(0, limit)
      return { data: filtered, error: null }
    }

    const builder = {
      select: (_cols?: string) => { void _cols; return builder },
      order: (col: string, opts?: { ascending?: boolean }) => {
        orders.push({ col, ascending: opts?.ascending !== false })
        return builder
      },
      or: (expr: string) => {
        predicates.push(parseOrExpression(expr))
        return builder
      },
      gt: (col: string, value: unknown) => {
        predicates.push({ test: (row) => cmp(row[col], value) > 0 })
        return builder
      },
      eq: (col: string, value: unknown) => {
        predicates.push({ test: (row) => row[col] === value })
        return builder
      },
      in: (col: string, values: unknown[]) => {
        const set = new Set(values)
        predicates.push({ test: (row) => set.has(row[col]) })
        return builder
      },
      limit: (n: number) => {
        limit = n
        return builder
      },
      then: <TResult1, TResult2>(
        onfulfilled?: ((v: { data: Row[] | null; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ): PromiseLike<TResult1 | TResult2> => {
        return Promise.resolve(exec()).then(onfulfilled, onrejected)
      },
    } as unknown as Builder

    return builder
  }

  return {
    from: (table: string) => {
      fromCount++
      return makeBuilder(table)
    },
    seed: (table, rows) => { store[table] = rows.map((r) => ({ ...r })) },
    dump: (table) => (store[table] ?? []).map((r) => ({ ...r })),
    fromCallCount: () => fromCount,
  }
}
