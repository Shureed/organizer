import { test, expect } from '@playwright/test'

/**
 * Flip-over scenario 7: REALTIME DIRECT APPLY
 *
 * Maps to smoke-slices.mjs step 7 — "From another tab or Supabase Studio:
 * update a task name. The task name updates in the UI within ~1 s without
 * a Network request to /rest/v1/v_active_tasks."
 *
 * We simulate the "other tab" with a direct supabase-js call from the
 * Playwright test runner (same project, same creds as global-setup). The
 * page is the authenticated e2e session; if realtime is wired into the
 * flip-over apply path, the page's SQLite is updated without a REST fetch
 * against the view.
 *
 * Assumption flag (see PR body): we target the seeded bucket task
 * 646e0015 because the today task (e45d0a2b) is churned by specs 5/6.
 * Using the bucket task isolates realtime from outbox activity.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Target the today fixture task (`e45d0a2b-...`). The earlier choice of the
// bucket task was wrong: its date is NULL and TodayView filters `t.date === today`,
// so no body change there ever surfaces on `/`. The today task is visible on
// `/`, so realtime body updates can be asserted by `getByText(newName)`. We
// restore the body in a finally so other specs see the canonical fixture.
const TARGET_TASK_ID = 'e45d0a2b-08f8-494a-8f25-3174f47d754e'
const TARGET_RESTORE_NAME = 'E2E fixture — today task'

function loadSupabaseCreds(): { url: string; anonKey: string } {
  let url = process.env.VITE_SUPABASE_URL
  let anonKey = process.env.VITE_SUPABASE_ANON_KEY
  const envPath = resolve(process.cwd(), '.env')
  if ((!url || !anonKey) && existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      if (m[1] === 'VITE_SUPABASE_URL' && !url) url = m[2].trim()
      if (m[1] === 'VITE_SUPABASE_ANON_KEY' && !anonKey) anonKey = m[2].trim()
    }
  }
  if (!url || !anonKey) throw new Error('realtime spec: missing Supabase creds')
  return { url, anonKey }
}

test('realtime UPDATE lands in UI without a /rest/v1/ view GET', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('E2E fixture — today task').first()).toBeVisible({
    timeout: 45_000,
  })

  // Start watching for REST view fetches from the UI *after* warm load.
  const viewReads: string[] = []
  await context.route('**/rest/v1/**', async (route) => {
    const req = route.request()
    if (
      req.method() === 'GET' &&
      /\/rest\/v1\/(v_active_tasks|action_node)/.test(req.url())
    ) {
      viewReads.push(req.url())
    }
    await route.continue()
  })

  // Drive the change from a side-channel supabase-js client authenticated as
  // the same test user.
  const { url, anonKey } = loadSupabaseCreds()
  const email = process.env.E2E_EMAIL!
  const password = process.env.E2E_PASSWORD!
  const sb = createClient(url, anonKey)
  const { error: authErr } = await sb.auth.signInWithPassword({ email, password })
  if (authErr) throw new Error(`side-channel auth failed: ${authErr.message}`)

  const newName = `E2E realtime ping ${Date.now()}`
  try {
    const { error: updErr } = await sb
      .from('action_node')
      .update({ body: newName })
      .eq('id', TARGET_TASK_ID)
    if (updErr) throw new Error(`side-channel update failed: ${updErr.message}`)

    // Expect the new name to appear in the UI (via realtime direct apply) in
    // under ~5s. Plan §2 target is <1s; we widen to 5s to absorb realtime
    // connection cold-start on CI.
    await expect(page.getByText(newName).first()).toBeVisible({ timeout: 5_000 })

    expect(
      viewReads,
      `realtime apply should not trigger REST view GETs; got:\n${viewReads.join('\n')}`,
    ).toHaveLength(0)
  } finally {
    // Restore the today fixture's canonical body so subsequent specs (and
    // future runs) see the seeded value. Runs even if the assertions above
    // throw — leaving the today task with a transient ping name would break
    // every other spec that anchors on `getByText('E2E fixture — today task')`.
    await sb.from('action_node').update({ body: TARGET_RESTORE_NAME }).eq('id', TARGET_TASK_ID)
  }
})
