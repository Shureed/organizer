# SQLite-wasm Vitest Spike — Phase 2 Task 2.1

## Summary

**Decision: (a) in-process Vitest with happy-dom is fully viable.**

`@sqlite.org/sqlite-wasm` boots cleanly under Vitest + happy-dom without
Playwright, OPFS, or a Web Worker.  All 5 spike tests pass in ~140 ms.

---

## Environments tried

| Environment | Result |
|---|---|
| `happy-dom` (default vitest.config.ts) | **All tests pass** |
| `node` | Not needed — happy-dom succeeded; skipped |

---

## Test results (exact output)

```
 RUN  v4.1.5

[A1] importError: null
[A1] sqlite3InitModule type: function
✓ A1: can import sqlite3InitModule without throwing   4ms

[A2] initError: null
[A2] sqlite3 keys: [ 'WasmAllocError', 'SQLite3Error', 'capi', 'wasm',
                     'config', 'version', 'client', 'scriptInfo',
                     'oo1', 'initWorker1API', 'vfs', 'vtab' ]
✓ A2: sqlite3InitModule() resolves and returns an oo1 constructor   9ms

[A3] SELECT 1 result: [ [Object: null prototype] { val: 1 } ]
✓ A3: can open an in-memory DB and run SELECT 1   14ms

[A4] migrationError: null
[A4] tables after migration: [ '_meta', '_outbox', 'action_node', 'comments', 'inbox' ]
✓ A4: can apply 001_init.sql migration on an in-memory DB   8ms

[A5] action_node columns: [
  '_deleted', '_dirty', '_synced_at', 'archived', 'body', 'bucket',
  'chain_origin_id', 'completed_at', 'created_at', 'date', 'git_backed',
  'git_pr_url', 'id', 'name', 'parent_id', 'pinned', 'priority',
  'space_id', 'status', 'type', 'updated_at', 'user_id'
]
✓ A5: representative column-presence SELECT (mirrors task 2.4 intent)   8ms

Tests  5 passed (5)
Duration  142ms
```

---

## How it works

The production driver (`db.worker.ts`) requires:
1. **Comlink** — a Web Worker to proxy calls over `MessageChannel`
2. **OPFS SAHPool VFS** — `navigator.storage.getDirectory()` for persistent
   storage

Neither is available in Vitest/happy-dom.  However, `@sqlite.org/sqlite-wasm`
also ships a **Node-compatible entry** (`node.mjs`) that Vitest resolves via
the `"node"` export condition in the package's `exports` map.  This entry
uses `createRequire` and loads a Node-optimised Emscripten bundle
(`sqlite3-node.mjs`).

The `oo1.DB(':memory:')` constructor does **not** require OPFS — it uses an
in-memory VFS.  This is exactly what the column-presence tests need: boot the
real driver, apply real migration SQL, then assert schema shape with
`pragma_table_info`.

Key insight: the Node export condition fires even under `environment:
'happy-dom'` because Vitest resolves imports in the Node process, not in
happy-dom.  The DOM-like environment only affects globals available to
test code, not which Node module resolver is used.

---

## Decision

**(a) in-process Vitest (happy-dom) is viable** for column-presence and schema
tests.  No Playwright, no `better-sqlite3`, no `environment: 'node'` override
needed.

Task 2.4 should:
- Import `sqlite3InitModule` from `@sqlite.org/sqlite-wasm` directly
- Open `':memory:'` via `oo1.DB`
- Read migration SQL with `fs.readFileSync` (Vitest runs in Node process)
- Assert columns via `pragma_table_info('<table>')`

The OPFS/Comlink path in `db.worker.ts` is **not** exercised by this approach
— these are unit/schema tests only.  Integration behaviour (OPFS durability,
Comlink serialisation) stays in the Playwright harness.
