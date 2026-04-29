/**
 * seed-e2e-fixtures.mjs — Idempotent seed for the three e2e flipover fixtures.
 *
 * Wipes any pollution from prior CI runs by UPSERTing the canonical state
 * for each row. Replaces the per-spec restore-in-finally pattern that left
 * the suite vulnerable to cascading failures: any mutation spec that didn't
 * cleanly restore the today task put `status='done'` into shared state and
 * broke every downstream spec until the DB was manually fixed.
 *
 * Auth model: uses an `sb_secret_*` service-role-class key so we can write
 * to action_node bypassing RLS. Read by:
 *   SUPABASE_SECRET_KEY      — required (env-only, never committed)
 *   SUPABASE_URL             — defaults to VITE_SUPABASE_URL from .env
 *
 * Run before flipover / smoke specs in `.github/workflows/e2e.yml` so each
 * run starts from a known-canonical fixture state.
 *
 * Flags:
 *   --dry                    — print the planned payloads without sending
 *
 * Exit codes:
 *   0 — all three rows upserted (or --dry mode)
 *   1 — missing required env / HTTP failure / unexpected error
 *
 * Schema note: the payloads below MUST stay in lockstep with action_node's
 * schema. If a NOT-NULL column is added without a default, this script
 * fails — update both at once.
 */

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const DRY = process.argv.includes('--dry')

// ── Resolve env ──────────────────────────────────────────────────────────────

let SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL) {
  // Fall back to committed .env so local devs can run without exporting.
  const envPath = path.join(repoRoot, '.env')
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*VITE_SUPABASE_URL\s*=\s*(.*)\s*$/)
      if (m) { SUPABASE_URL = m[1].trim(); break }
    }
  }
}

if (!SUPABASE_URL) {
  console.error('seed-e2e-fixtures: missing SUPABASE_URL (or VITE_SUPABASE_URL in .env)')
  process.exit(1)
}

if (!DRY && !SUPABASE_SECRET_KEY) {
  console.error('seed-e2e-fixtures: missing SUPABASE_SECRET_KEY (must be set in env)')
  process.exit(1)
}

// ── Canonical fixture state ──────────────────────────────────────────────────

const E2E_USER_ID    = '322fd2fe-dd06-4604-b295-d738a09a5385'
const FIXTURE_SPACE  = '0cdfc0cc-e25f-4ea6-a0f1-79017c425329'
const FIXTURE_PROJECT_ID = '1d13ff37-d367-4aa3-ac4a-985fcec79b63'
const FIXTURE_TODAY_ID   = 'e45d0a2b-08f8-494a-8f25-3174f47d754e'
const FIXTURE_BUCKET_ID  = '646e0015-c84a-4beb-8462-0b8ff89958a7'

// ISO timestamp shared across the batch so updated_at moves consistently.
const NOW_ISO = new Date().toISOString()
// Today's date in the UTC YYYY-MM-DD form expected by `action_node.date`.
// Used for the today-fixture so it renders in TodayView's today section
// (empty section triggers a "No tasks scheduled for today." string that
// `airplane-read` asserts must not appear).
const TODAY_YMD = NOW_ISO.slice(0, 10)
// `created_at` is required (NOT NULL); we use a stable past date so the
// existing rows aren't touched on this column. PostgREST upsert with
// merge-duplicates writes whatever we send — keep it stable.
const FIXTURE_CREATED = '2026-04-22T00:00:00Z'

const ROWS = [
  {
    id: FIXTURE_PROJECT_ID,
    user_id: E2E_USER_ID,
    name: 'E2E Fixture Project',
    status: 'open',
    type: 'thought',
    priority: null,
    parent_id: null,
    space_id: FIXTURE_SPACE,
    date: null,
    bucket: null,
    body: 'Parent for fixture tasks',
    archived: false,
    pinned: false,
    git_backed: false,
    completed_at: null,
    created_at: FIXTURE_CREATED,
    updated_at: NOW_ISO,
  },
  {
    id: FIXTURE_TODAY_ID,
    user_id: E2E_USER_ID,
    name: 'E2E fixture — today task',
    status: 'open',
    type: 'task',
    priority: null,
    parent_id: FIXTURE_PROJECT_ID,
    space_id: FIXTURE_SPACE,
    date: TODAY_YMD,
    bucket: null,
    body: 'E2E fixture — today task',
    archived: false,
    pinned: false,
    git_backed: false,
    completed_at: null,
    created_at: FIXTURE_CREATED,
    updated_at: NOW_ISO,
  },
  {
    id: FIXTURE_BUCKET_ID,
    user_id: E2E_USER_ID,
    name: 'E2E fixture — bucket task',
    status: 'open',
    type: 'task',
    priority: null,
    parent_id: FIXTURE_PROJECT_ID,
    space_id: FIXTURE_SPACE,
    date: null,
    bucket: 'needs_doing',
    body: null,
    archived: false,
    pinned: false,
    git_backed: false,
    completed_at: null,
    created_at: FIXTURE_CREATED,
    updated_at: NOW_ISO,
  },
]

// ── Run ──────────────────────────────────────────────────────────────────────

if (DRY) {
  console.log(`seed-e2e-fixtures: --dry mode — would POST to ${SUPABASE_URL}/rest/v1/action_node`)
  for (const row of ROWS) {
    console.log(JSON.stringify(row, null, 2))
  }
  process.exit(0)
}

try {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/action_node?on_conflict=id`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(ROWS),
    },
  )
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    console.error(`seed-e2e-fixtures: HTTP ${resp.status} ${resp.statusText}\n${text}`)
    process.exit(1)
  }
  const persisted = await resp.json().catch(() => [])
  console.log(`seed-e2e-fixtures: upserted ${Array.isArray(persisted) ? persisted.length : 0}/3 rows`)
  process.exit(0)
} catch (err) {
  console.error('seed-e2e-fixtures: unexpected error:', err)
  process.exit(1)
}
